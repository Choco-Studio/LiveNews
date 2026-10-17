// The fallback writer's truth and standards on real news (docs/roadmap/critique/fallback-lengths.md, round 6): what the
// hard panel found reading round 5's editions, each case as it aired. A view with no word of a view, a person nobody
// introduced, an advice column leading MONEY MINUTE, one event told twice, a question its answer misses, a playful kicker on
// a grave story.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, compressSentence, normalizeBulletin } from '../server/writer.js';
import { outletView, extractFigures, groundQuote } from '../server/facts.js';
import { createMockProvider, calmTitle, study, answerable, introducePeople, introduceNames, undateline } from '../server/providers/mock.js';
import { topicOf } from '../server/topics.js';
import { notNews, sameReport } from '../server/news.js';
import { askLine, followLine, missesQuestion, AHEAD } from '../server/correspondents.js';
import { questionLine, followLine as expertFollow } from '../server/experts.js';
import { untold } from '../server/coherence.js';
import { loadChannel } from '../server/channel.js';

const DUO = { A: { id: 'paco', name: 'Paco Pixel' }, B: { id: 'lola', name: 'Lola Byte' } };
const st = (id, title, summary, extra = {}) => ({ id, title, summary, source: 'Pixelburg Post', category: 'world', image: null, link: `https://example.test/${id}`, ...extra });
const write = async (stories, program, extra = {}) => extractJson((await createMockProvider().generate({ stories, channelName: 'TEST', presenters: DUO, program, count: program.stories, ...extra })).text);
const spoken = (ep) => ep.segments.map((s) => String(s.text || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ')).join('\n');
const channel = loadChannel();
const programOf = (id) => ({ id, ...channel.programs[id] });
// plain news in other places, for a programme's other stories
const PLAIN = [
  (cat) => st('p1', 'Lisbon opens a new metro line to the airport', 'Lisbon has opened a new metro line linking the airport to the city centre. The line will carry 40,000 passengers a day, the operator says.', { category: cat }),
  (cat) => st('p2', 'Oslo bans private cars from its old town', 'Oslo has banned private cars from its old town from next month. The city council voted for the plan on Tuesday.', { category: cat }),
  (cat) => st('p3', 'Lima plants ten thousand trees along its river', 'Lima has planted ten thousand trees along its river, the city says. The work took two years.', { category: cat }),
  (cat) => st('p4', 'Accra port handles record cargo in September', 'The port of Accra handled a record 1.2 million tonnes of cargo in September, its operator says. Exports of cocoa rose sharply.', { category: cat }),
];

describe('round 6: what the news desk calls no news never airs, and never leads', () => {
  test('advice, a columnist’s question, a column in the first person, an outlet’s event, a match’s predictions, a headline’s guess', () => {
    const no = [
      st('a', 'Energy bills through the roof? Five signs your house is leaking heat', 'Pick a day when there is a good breeze, and heat the house to its usual temperature. Then wander around with a candle or smoke pen (about £20).', { source: 'Guardian Business', category: 'business' }),
      st('b', 'Faisal Islam: What surprise praise for UK economy tells us about the Budget', 'On three occasions in the past 24 hours, top IMF officials have praised UK plans to reduce its annual levels of borrowing.', { source: 'BBC Business', category: 'business' }),
      st('c', 'I don’t miss the camera on the Ray-Ban Meta Audio glasses', 'The other day I whizzed past several people while running in the park, my playlist blasting at full volume.', { source: 'The Verge', category: 'tech' }),
      st('d', 'TechCrunch Disrupt 2026 starts tomorrow: Your final chance to secure up to $100 ticket savings', 'Tomorrow at 8 a.m. PT, it all begins.', { source: 'TechCrunch', category: 'tech' }),
      st('e', 'Atletico Madrid vs Manchester United: Champions League – Predictions, teams', 'In-form Atletico host struggling Man United as the Champions League continues.', { source: 'Al Jazeera' }),
      st('f', 'The Yandex outage probably didn’t blitz Russian bots', 'Multiple Ukrainian drone strikes over the last week have taken Russian data centers offline.', { source: 'The Verge', category: 'tech' }),
      st('g', "Analysis: Trump's global headaches worsen weeks before crucial elections", 'US President Donald Trump has had a whirlwind weekend.', { source: 'BBC News' }),
      st('h', 'The Alexa Tablet 12 Pro is almost the Android tablet we needed', "It's the first thing you notice.", { source: 'The Verge', category: 'tech' }),
      st('i', '’How do you explain deletion of 130m names?’', 'Why Indian voters are on the streets.', { source: 'The Guardian' }),
      st('j', 'It looks like Apple Music is getting new icon', 'A new icon has appeared in the beta.', { source: 'The Verge', category: 'tech' }),
    ];
    for (const s of no) assert.ok(notNews(s), s.title);
    // a report's "what we know", a study's "we", everyone's "our", a king's numeral: news
    const yes = [
      st('n1', "What we know about Russia's overnight strikes on Ukraine", 'At least six people were killed in Kyiv overnight.', { source: 'BBC News' }),
      st('n2', "AI can act exactly like a human, but we still don't think it's conscious", 'A new study reveals that people draw a sharp line between behaviour and experience.', { source: 'ScienceDaily', category: 'science' }),
      st('n3', 'James Webb reveals a massive cosmic structure that challenges our understanding of the Universe', 'The telescope has revealed an ancient galaxy cluster.', { source: 'ScienceDaily', category: 'science' }),
      st('n4', 'World War I letters found in a Belgian attic', 'Letters written by soldiers in 1916 have been found in Ypres.'),
      st('n5', 'Toilet paper and secret recorders: What we know about the arrest of the Saudi OpenAI engineer', 'Abdulrahman Alfozan had worked for the AI giant for more than a year.', { source: 'BBC Business', category: 'business' }),
    ];
    for (const s of yes) assert.ok(!notNews(s), s.title);
  });

  test('an advice column first in the desk’s order never leads MONEY MINUTE, nor airs', async () => {
    const program = programOf('money-minute');
    const advice = st('adv', 'Energy bills through the roof? Five signs your house is leaking heat', 'Pick a day when there is a good breeze, and heat the house to its usual temperature. Then wander around with a candle or smoke pen (about £20). Alternatively, buy a thermal leak detector.', { source: 'Guardian Business', category: 'business' });
    const ep = await write([advice, ...PLAIN.map((f) => f('business'))], program);
    const ids = ep.segments.map((s) => s.storyId).filter(Boolean);
    assert.ok(!ids.includes('adv'), spoken(ep));
    assert.ok(!/leaking heat|Pick a day/i.test(spoken(ep)), spoken(ep));
  });

  test('a column the desk lets through never leads and never airs, the programme shorter instead', async () => {
    const program = { id: 'tech-bytes', title: 'TECH BYTES', stories: 4, maxChats: 0 };
    const column = st('col', 'Android is best and worst thing about Googlebooks', 'So far, success feels a lot further away than failure. The laptops run Android apps.', { source: 'The Verge', category: 'tech' });
    const ep = await write([column, ...PLAIN.slice(0, 3).map((f) => f('tech'))], program);
    const ids = ep.segments.map((s) => s.storyId).filter(Boolean);
    assert.ok(!ids.includes('col'), spoken(ep));
  });
});

describe('round 6: one event is one story', () => {
  const S = {
    fbA: st('s5349b4bff5', 'Facebook is giving users more control over their algorithm', 'Meta announced the launch of its new AI-powered feature, “Your Algorithm,” a feature it first launched on Instagram.', { source: 'TechCrunch', category: 'tech' }),
    fbB: st('sc9abe9b08c', 'Facebook will let you customize your feed algorithm using AI', 'Facebook\'s new "Your Algorithm" feature will let you directly add and manage topics you want to see in your feed and Facebook Reels. Meta says your recommendations "respond right away" after you make updates.', { source: 'The Verge', category: 'tech' }),
    imfA: st('s6676c3ee7a', 'IMF raises UK growth forecast as economist says Healey should ‘stay the course’', 'Fund upgrades UK’s GDP growth forecast for 2026 to 1.3%, but says it is likely to edge down next year. IMF warns global economy ‘could soon test the limits of resilience’.', { source: 'Guardian Business', category: 'business' }),
    imfB: st('scdd52e4bee', 'UK growth forecast upgraded but higher energy prices to hit economy next year', 'The prediction from the IMF comes as final preparations are being made for the first Budget under Prime Minister Andy Burnham.', { source: 'BBC Business', category: 'business' }),
    abA: st('s0326aba6e1', 'Archbishop of US military condemns Pentagon plans to livestream execution', 'The archbishop who oversees the spiritual care of Catholics serving in the US military condemned the Pentagon’s proposed plans to livestream the firing squad execution of Nidal Hasan later this year. Archbishop Timothy Broglio also stipulated in a Monday statement that any Catholic soldier assigned to the US army firing squad should ask to be excused.', { source: 'The Guardian' }),
    abB: st('s2675c9ffbe', 'US archbishop says Catholics in army should not participate in firing squad', 'Archbishop Timothy Broglio says US plan to livestream Fort Hood attacker\'s execution is contrary to church teachings.', { source: 'Al Jazeera' }),
  };
  test('the two Facebook feed stories, the IMF’s UK forecast twice, the archbishop twice: one event each (sameReport)', () => {
    assert.ok(sameReport(S.fbA, S.fbB));
    assert.ok(sameReport(S.imfA, S.imfB));
    assert.ok(sameReport(S.abA, S.abB));
  });
  test('two hurricanes, two school shootings, two start-ups’ rounds, a match and a club: never one', () => {
    const pairs = [
      [st('h1', 'Hurricane Elena cuts power to 1.2 million homes in Yucatán', 'Hurricane Elena has cut electricity to about 1.2 million homes on Mexico’s Yucatán peninsula after making landfall overnight.'), st('h2', "Hurricane Simon batters Mexico's Pacific Coast", "Hurricane Simon is currently running parallel to Mexico's Pacific Coast, bringing heavy rainfall and strong winds to vulnerable towns.")],
      [st('o1', 'France school shooting: Police detain pupil after two injured', 'Officials say a staff member disarmed the suspect, who hid a hunting shotgun in a guitar case, before police arrived.'), st('o2', 'Police search for clues to deadly shooting at Oregon elementary school', 'Police are investigating a deadly shooting at an elementary school in Bend, Oregon, where a 16-year-old opened fire on Thursday.')],
      [st('z1', 'Former Plaud exec raises $26M for AI app that listens to you in the background', 'Ambi is releasing apps for iPhone, Mac, and Apple Watch that enables ambient capture', { category: 'tech' }), st('z2', 'Zenzap raises $44M for its AI chat app that aims to replace WhatsApp in the workplace', 'Zenzap is used by organizations including Starbucks and Taco Bell', { category: 'tech' })],
      [st('m1', 'Atletico Madrid beat Manchester United 2-0 as winless run continues', "Michael Carrick's Man Utd continue to search for a win as Atletico win 2-0 in UEFA Champions League."), st('m2', 'UK PM Andy Burnham met Man City chairman during time as Manchester mayor', "Statement comes after criticism of Burnham's initial response to City being found guilty of serious financial breaches.")],
    ];
    for (const [a, b] of pairs) assert.ok(!sameReport(a, b), `${a.title} / ${b.title}`);
  });
  test('the writer tells the two Facebook stories once', async () => {
    const program = { id: 'tech-bytes', title: 'TECH BYTES', stories: 4, maxChats: 0 };
    const ep = await write([S.fbA, S.fbB, ...PLAIN.slice(0, 3).map((f) => f('tech'))], program);
    const ids = ep.segments.filter((s) => s.type === 'story').map((s) => s.storyId);
    assert.equal(ids.filter((id) => id === S.fbA.id || id === S.fbB.id).length, 1, ids.join(' '));
  });
});

describe('round 6: a question its answer answers, or no exchange', () => {
  const gdp = 'UK GDP growth has been stronger than expected in early 2026, at 0.6% in the first quarter and 0.5% in the second quarter.';
  const drought = 'El Nino-induced drought is affecting roughly half of the country as three-year long war continues.';
  test('"what comes next?" is never asked of what has been, nor of a present that goes on', () => {
    assert.ok(!AHEAD.test(gdp) && !AHEAD.test(drought));
    const omar = { id: 'omar', name: 'Omar Quant', first: 'Omar' };
    const rhea = { id: 'rhea', name: 'Rhea Raster', first: 'Rhea' };
    for (let i = 0; i < 8; i++) {
      assert.ok(!/next|\bnow\?|watch for/.test(expertFollow(omar, `k${i}`, gdp, i)), expertFollow(omar, `k${i}`, gdp, i));
      assert.ok(!/next/.test(askLine(rhea, `k${i}`, drought)), askLine(rhea, `k${i}`, drought));
      assert.ok(!/next/.test(followLine(rhea, `k${i}`, drought)), followLine(rhea, `k${i}`, drought));
    }
    // (a forecast ahead still is: "Forecasters expect more rain over the next two days.")
    assert.match(askLine(rhea, 'k1', 'Forecasters expect more rain over the next two days.'), /next\?$/);
    // (and a "will" inside someone's quotation marks is theirs, not what comes next)
    assert.ok(!/next/.test(askLine(rhea, 'k2', '“We will not tolerate these threats on our soil,” Burnham told parliament.')));
  });
  test('each answer that missed its question in round 5 misses it by rule, and a fitting one does not', () => {
    assert.ok(missesQuestion('Omar, what comes next?', gdp));
    assert.ok(missesQuestion('And Rhea, what happens next?', drought));
    assert.ok(missesQuestion('[chin] Walk me through how it works.', 'It’s very close in overall size to the Fitbit Air and uses the same magnetic charging puck.'));
    assert.ok(missesQuestion('[chin] How do they know, Dr Reyes?', 'The data support weather forecasting by providing timely observations of environmental conditions.'));
    assert.ok(!missesQuestion('Rhea, what happens next?', 'The council will vote on the plan next week.'));
    assert.ok(!missesQuestion('[chin] How does it actually work?', 'The ring uses an infrared sensor to measure blood oxygen while you sleep.'));
    assert.ok(!missesQuestion('[chin] How do they know, Dr Reyes?', 'The team measured the light from 300 galaxies using the Webb telescope.'));
    assert.ok(!missesQuestion('Omar, what else should people know?', gdp));
  });
  test('an expert’s first question is one the answers give: "what is behind it?" only with a cause', () => {
    const e = { id: 'omar', name: 'Omar Quant', first: 'Omar', desk: 'economics' };
    for (let i = 0; i < 12; i++) assert.ok(!/behind/.test(questionLine(e, `q${i}`, null, i, { answer: gdp })), questionLine(e, `q${i}`, null, i, { answer: gdp }));
  });
  test('THE CATCH is never a contrast with a sentence the viewer did not hear', () => {
    const info = { s: { title: 'Microsoft President Brad Smith calls for urgent AI regulation', summary: 'Smith said the U.K. can regulate AI in ways that the U.S. cannot.' } };
    assert.ok(!answerable('Despite the president’s pushback, however, Smith argued the U.K. can regulate AI in ways that the U.S. cannot.', info));
  });
});

describe('round 6: no playful kicker on a grave story, no kicker from a stray word', () => {
  test('the strap fits the story’s gravity and its section', () => {
    const k = (title, summary = '', category = 'world') => topicOf({ title, summary, category });
    assert.equal(k('Conflict, drought increasing risk of famine in Sudan: Monitor', 'El Nino-induced drought is affecting roughly half of the country as three-year long war continues.'), 'HUMANITARIAN');
    assert.ok(!['SOFTWARE', 'GADGETS', 'AI'].includes(k('Missing Australian hiker Jordan Yap last seen on remote trail found dead in Peru', 'Family and friends say Melbourne man should be remembered. Get our breaking news email, free app or daily news podcast.')));
    assert.notEqual(k('Family of man killed by tiger criticise online content after Trump reposts video', 'The family of a man killed by a tiger at a UK wildlife park have spoken of their distress.'), 'WILDLIFE');
    assert.notEqual(k('At least two security officials killed near Iran’s critical Chabahar port', "Iran says 'terrorist groups' supported from outside the country are targeting security forces."), 'TRADE');
    assert.equal(k('Passenger train derails in central Pakistan, killing at least 5 and injuring 35'), 'ACCIDENTS');
    assert.equal(k("Children killed in arson attack named - as family calls for culprit to 'own up'", 'Two children who died in an arson attack at a home in Ireland have been named.'), 'CRIME');
    assert.equal(k('Taxes, housing and tuition fees: 2027 budget measures impact family budgets in Portugal', 'From taxes and wages to pensions, housing and tuition fees, the 2027 State Budget contains several measures.', 'business'), 'ECONOMY');
    assert.notEqual(k('More part-time bosses and co-CEOs could keep women in leadership and narrow Australia’s pay gap', 'Uneven caring responsibilities have prevented women from staying in senior positions. Get our breaking news email, free app or daily news podcast.'), 'SOFTWARE');
    assert.notEqual(k('Turkey police raid opposition TV station, halting live broadcasts', 'Police raided the offices of a television channel and cut its live broadcasts; the gadget-free studio went dark.'), 'GADGETS');
    // (an animal's death, an ancient one, an actor's: their own field)
    assert.equal(k('Flying foxes in NSW and Victoria face mass starvation amid food shortages'), 'WILDLIFE');
    assert.equal(k('Neanderthal remains may be earliest human ancestor find killed by a spear', '', 'science'), 'HISTORY');
    assert.equal(k('RJ Mitte, actor best known for Breaking Bad role, dies aged 34'), 'CULTURE');
  });
});

describe('round 6: a view is said as someone’s, or not at all', () => {
  test('the outlet’s framing and praise are views whoever the sentence quotes', () => {
    for (const t of [
      'Ironically, claims that the drone strikes hindered Russian disinformation campaigns appears to be a form of disinformation itself, no matter what Zelenskyy says.',
      'However, in reality, that might not be the case.',
      'Meta is making up for lost time in the AI race.',
      'As important as some of the messages in The Social Reckoning are, the movie has been drastically underperforming at the box office.',
      "On Monday morning, the world's econ nerds tuned in to an announcement from Sweden to learn who won this year's Nobel Prize in economics.",
      'A spectacular blaze tore through the iconic covered market overnight, gutting its iron and glass roof.',
      'Blumhouse’s Other Mommy raked in an impressive $27 million.',
      "Apple's ad introducing its new HomeView smart display is a little unusual.",
    ]) assert.ok(outletView(t), t);
    for (const t of [
      'Scientists say the discovery is remarkable.',
      'Striking workers walked out on Monday over pay.',
      'Shareholders called an extraordinary general meeting for November.',
      'Iran’s Islamic Revolutionary Guard Corps was behind the plot, the prime minister said.',
    ]) assert.ok(!outletView(t), t);
  });
  test('a headline’s praise is not said as ours, its article fitted', () => {
    assert.equal(calmTitle('Striking new images show new flash floods hitting central Nepal'), 'New images show new flash floods hitting central Nepal');
    assert.equal(calmTitle('Iconic Iguazu Falls walkway dismantled amid record water levels'), 'Iguazu Falls walkway dismantled amid record water levels');
    assert.equal(calmTitle('The incredible flying Tesla Roadster is just for show'), 'The flying Tesla Roadster is just for show');
    assert.equal(calmTitle('Antarctica’s sea ice has undergone a stunning reversal'), 'Antarctica’s sea ice has undergone a reversal');
    assert.equal(calmTitle('A stunning 18-month rally'), 'An 18-month rally');
    assert.equal(calmTitle('Shareholders call an extraordinary general meeting'), 'Shareholders call an extraordinary general meeting');
    assert.equal(calmTitle('Striking workers walk out'), 'Striking workers walk out');
  });
  test('a series’ plot is never told as news, its release is', () => {
    const info = study(st('br', 'Prime Video unveils Blade Runner 2099 full trailer at NYCC', 'Prime Video will drop all eight episodes of Blade Runner 2099 on November 25, 2026.', { category: 'tech', source: 'The Verge', body: '2099 is taking place at a junction point when one species is ending and a new one is rising.\nThe series stars Michelle Yeoh as an aging replicant.' }));
    assert.ok(info.sentences.some((t) => /November 25/.test(t)), info.sentences.join(' | '));
    assert.ok(!info.sentences.some((t) => /junction point/.test(t)), info.sentences.join(' | '));
  });
  test('TECH BYTES never closes on a sneer at the story', async () => {
    const tb = { ...programOf('tech-bytes') };
    const SNEER = /not selling it|What could possibly go wrong|slightly worrying|outside the press release|survives its first software update/;
    for (let i = 0; i < 6; i++) {
      const stories = [
        st(`a${i}`, `Startup ${i} launches an AI app that writes emails`, `The app uses a language model to draft replies, the company says. It costs $10 a month.`, { category: 'tech' }),
        st(`b${i}`, `Chipmaker ${i} opens a factory in Ohio`, 'The factory will employ 3,000 people, the company says. Production starts next year.', { category: 'tech' }),
        st(`c${i}`, `Robot vacuum ${i} learns to climb stairs`, 'The robot uses two legs to lift itself onto each step, its maker says. It goes on sale in the spring.', { category: 'tech' }),
        ...PLAIN.slice(0, 2).map((f) => f('tech')),
      ];
      assert.ok(!SNEER.test(spoken(await write(stories, tb))));
    }
  });
});

describe('round 6: who someone is, the first time they speak', () => {
  test('a speaker is said with the role the source gives, or the line does not air', async () => {
    const program = programOf('world-now');
    const wgea = st('wg', 'More part-time bosses and co-CEOs could keep women in leadership', 'More part-time bosses and co-CEOs could keep women in leadership and narrow Australia’s gender pay gap, the federal government’s Workplace Gender Equality Agency says.', {
      body: [
        'WGEA’s chief executive, Christine Castley, said uneven caring responsibilities combined with a lack of flexible work options had prevented women from staying in senior positions for many years.',
        'Christine Castley said employers could think creatively about reforms to keep women in senior roles.',
        'Full-time women were promoted more often than men in 2024-25, according to the report.',
        'The agency surveyed more than 5,000 employers across the country.',
      ].join('\n'),
    });
    const text = spoken(await write([wgea, ...PLAIN.map((f) => f('world'))], program, { depth: 3 }));
    const first = text.indexOf('Christine Castley');
    if (first >= 0) assert.match(text.slice(Math.max(0, first - 60), first + 80), /chief executive/, text);
  });
  test('a part of a name is said whole, with its role; a surname from the headline is said whole', async () => {
    const program = programOf('world-now');
    const pk = st('pk', "Pakistan's president suspends provincial government led by Khan’s party ahead of march", 'Pakistani President Asif Ali Zardari has declared a state of emergency in northwestern Khyber Pakhtunkhwa province.', {
      body: ['Ali Zardari acted on the recommendation of Prime Minister Shehbaz Sharif’s Cabinet, according to a statement from the president’s office.', 'The province has been governed by the party of the jailed former prime minister Imran Khan since 2013.'].join('\n'),
    });
    const hb = st('hb', 'Healey faces £35bn Budget challenge to meet spending pledges, says think tank', 'Chancellor John Healey faces a £35bn challenge to meet his spending pledges, the Institute for Fiscal Studies says.', {
      category: 'business',
      body: ['The IFS said that Healey must set out credible spending plans in the Budget, which will take place on 28 October.', 'Departments have been asked to find savings of 5% over three years.'].join('\n'),
    });
    const text = spoken(await write([pk, hb, ...PLAIN.slice(0, 3).map((f) => f('world'))], program, { depth: 3 }));
    // (the first time each is said, in a tease or a story: whole, "Asif Ali Zardari", "John Healey")
    const z = text.indexOf('Zardari');
    const h = text.indexOf('Healey');
    assert.ok(z < 0 || /Asif Ali $/.test(text.slice(0, z)), text);
    assert.ok(h < 0 || /John $/.test(text.slice(0, h)), text);
  });
  test('"the organisation", "the 46-year-old", "the three news organizations", "the Kenyan American engineer" lean on what was said', () => {
    assert.equal(untold('The organisation said it would appeal the ruling.', 'Officials said the plan would go ahead'), 'definite');
    assert.equal(untold('The organisation said it would appeal the ruling.', 'A National Trust manager said the plan would go ahead'), null);
    assert.equal(untold('The 46-year-old was arrested at his home on Monday.', 'Police arrested a man in Leeds'), 'person');
    assert.equal(untold('The 46-year-old was arrested at his home on Monday.', 'Police arrested a 46-year-old man in Leeds'), null);
    assert.equal(untold('The three news organizations said they would sue.', 'Reporters were barred from the briefing'), 'sequel');
    assert.equal(untold('The Kenyan American engineer was detained at the airport.', 'A man was detained'), 'person');
  });
});

describe('round 6: what the final replays’ readings found', () => {
  const src = (title, body, summary = 'x') => ({ s: { title, summary, body } });
  test('a speaker is said with the role the source gives beside the name, a title or a sentence’s first word left out of it', () => {
    assert.equal(
      introducePeople('As Ross Benes put it: “They haven’t been able to find another line of major revenue.”', 'Netflix shares fell.', src('Netflix shares fall', '“They haven’t been able to find like another line of major revenue,” said Ross Benes, a senior analyst at eMarketer, adding the company remained reliant on subscriptions.')),
      'As Ross Benes, a senior analyst at eMarketer, put it: “They haven’t been able to find another line of major revenue.”'
    );
    assert.equal(
      introducePeople('Mark Singleton said National Trust tenant farmers were managing the land to support wildlife.', 'x', src('Purbeck', 'Mark Singleton, Purbeck\'s National Trust countryside manager, said: "This is an exciting project."')),
      "Mark Singleton, Purbeck's National Trust countryside manager, said National Trust tenant farmers were managing the land to support wildlife."
    );
    // (an honorific alone says too little when the source says more)
    assert.match(introducePeople('Phoebe Meagher said of the 39 turtles, two had to be humanely euthanised.', 'Turtles were released.', src('Turtles released', '“That’s what we work for,” said Dr Phoebe Meagher, a wildlife conservation officer at Taronga Conservation Society.')), /^Phoebe Meagher, a wildlife conservation officer at Taronga Conservation Society, said/);
    // (what they do is who they are: "who has led Bellway since 2017")
    assert.match(introducePeople('Jason Honeyman welcomed the new programme.', '', src('Bellway', 'Jason Honeyman, who has led Bellway since 2017, welcomed the new programme, which will be more targeted.')), /^Jason Honeyman, who has led Bellway since 2017, welcomed/);
    // (a speaker the source never says who they are does not air)
    assert.equal(introducePeople('Working with a government gives Ultrahuman the opportunity, Mohit Kumar said.', 'x', src('Ultrahuman', 'Working with a government gives Ultrahuman the opportunity, Mohit Kumar said.')), null);
    // (a role before the name, for anyone the line names: "Pakistani President Asif Ali Zardari’s federal government")
    assert.equal(introducePeople('Asif Ali Zardari’s federal government said the emergency rule was invoked.', 'x', src('Pakistan', '', 'Pakistani President Asif Ali Zardari has declared a state of emergency.')), 'Pakistani President Asif Ali Zardari’s federal government said the emergency rule was invoked.');
  });
  test('a surname the source gives whole is said whole; "Dr." before a whole name is no surname', () => {
    const info = src('DNA recording system reveals how a single cell becomes a body', 'Such research could eventually advance knowledge, said Dr. Jay Shendure, a professor of genome sciences at the University of Washington.\nShendure led the research alongside Dr. Chengxiang Qiu, a molecular and systems biologist at Dartmouth College in New Hampshire.', 'Scientists have traced the development of a mouse embryo.');
    assert.match(introduceNames('Shendure led the research alongside Dr. Chengxiang Qiu, a molecular and systems biologist at Dartmouth College in New Hampshire.', 'Scientists have traced the development of a mouse embryo.', info), /^Jay Shendure led the research alongside Dr\. Chengxiang Qiu/);
    // (a surname the source never gives whole, of someone who argues, is nobody the viewer can know: "Canestrini and his
    // colleagues argued…")
    assert.equal(introduceNames('Canestrini and his colleagues argued that as a soldier the defendant was bound to secrecy.', 'A Ukrainian man has gone on trial in Hamburg.', src('Germany puts Ukrainian on trial', 'Canestrini and his colleagues argued that as a soldier the defendant was bound to secrecy, and therefore he could not have a fair trial.')), null);
  });
  test('a wire’s dateline is never read, twice or with its agency', () => {
    assert.equal(undateline('WARSAW, Poland -- WARSAW, Poland (AP) — Poland is blaming Russia for an arson attack.'), 'Poland is blaming Russia for an arson attack.');
    assert.equal(undateline('The UN -- which met on Monday -- said it would act.'), 'The UN -- which met on Monday -- said it would act.');
  });
  test('a cut never ends on a time that needs what it is the time of', () => {
    const out = compressSentence('He met Keir Starmer at Downing Street the day after Trump and his vice-president, JD Vance, publicly berated the Ukrainian president in the Oval Office 18 months ago.', 14, { min: 8 }) || [];
    for (const t of out) assert.ok(!/\bthe day[.,]?$/.test(t.trim()), t);
  });
  test('"Not that…", "an often wayward ally", "the illustrious share register" are views', () => {
    assert.ok(outletView('Not that the heritage charity will be taking on the napkin-folding and the slow cooking of pork cheeks.'));
    assert.ok(outletView('Donald Trump is an often wayward ally for Ukraine, and Zelenskyy has expressed anger at the diesel deal.'));
    assert.ok(outletView('Lando Norris has become the latest sports star to join the illustrious share register of Seat Unique.'));
  });
  test('"that paperwork", "Both served as senior authors", "That was, until…" lean on what was never said', () => {
    assert.equal(untold('Ilhan Omar’s late father filled out that paperwork when Omar was a child.', 'Democrats rebuke federal raid of Ilhan Omar’s home'), 'demonstrative');
    assert.equal(untold('Both served as senior authors of the study.', 'Scientists have traced the development of a mouse embryo'), 'sequel');
    assert.equal(untold('That was, until it was suddenly taken away.', 'Indian voters are on the streets'), 'also');
  });
  test('an explainer’s headline, "What ice cream has to do with…", is a feature and never airs as news', async () => {
    const program = { id: 'money-minute', title: 'MONEY MINUTE', stories: 4, maxChats: 0 };
    const ice = st('ice', "What ice cream has to do with this year's Nobel Prize in economics", 'Prices can get sticky. That helps explain why recessions hurt so much.', { source: 'NPR Business', category: 'business' });
    const ids = (await write([ice, ...PLAIN.map((f) => f('business'))], program)).segments.map((s) => s.storyId).filter(Boolean);
    assert.ok(!ids.includes('ice'), ids.join(' '));
  });
  test('the IFS’s budget warning is the economy’s, never a war’s for a word in its summary; a deadly collapse is an accident', () => {
    assert.equal(topicOf({ title: 'IFS: budget will be ‘work of fiction’ without clear plan to cover UK’s £35bn spending pressures', summary: 'John Healey has been warned by Britain’s leading tax and spending experts. As the war in the Middle East rattles the public finances, the IFS said…', category: 'business' }), 'ECONOMY');
    assert.equal(topicOf({ title: 'Pakistan orders school inspections following deadly roof collapse', summary: '', category: 'world' }), 'ACCIDENTS');
    assert.notEqual(topicOf({ title: 'Surveillance video shows moment ICE vehicle strikes man in Houston', summary: 'New footage shows the moment a man was hit by an ICE officer’s car.', category: 'world' }), 'PRIVACY');
  });
});

describe('round 6: what reading the interrupted final replay found', () => {
  const src = (title, body, summary = 'x') => ({ s: { title, summary, body } });
  test('THE CATCH is a limit or a cost, never good news', () => {
    assert.ok(missesQuestion('[chin] There is always a but. What is it here?', 'Hideo Kojima’s discontinued "playable trailer" is no longer stuck on a few aging PS4 hard drives.'));
    assert.ok(!missesQuestion('[steeple] And the small print?', "The Fitbit Edge offers more than the Air, but it's not a real smartwatch."));
  });
  test('an organisation’s letters are said whole the first time, a body is never taken for a speaker, a role reads without a stray comma', () => {
    const wgea = src('More part-time bosses could keep women in leadership', '', 'More part-time bosses could narrow Australia’s gender pay gap, the federal government’s Workplace Gender Equality Agency says. WGEA warned resistance was growing.');
    assert.equal(introducePeople('WGEA warned resistance to gender equality was growing.', 'x', wgea), 'The Workplace Gender Equality Agency warned resistance to gender equality was growing.');
    assert.equal(introducePeople('Efferon has developed a mechanism, according to Dima Romashin.', 'x', src('Efferon', 'It works, said Dima Romashin, Efferon’s co-founder and CEO, in an interview.')), 'Efferon has developed a mechanism, according to Dima Romashin, Efferon’s co-founder and CEO.');
    assert.equal(introducePeople('Alexus Grynkewich said NATO allies needed to attribute blame.', 'x', src('NATO', "Alexus Grynkewich, NATO 's Supreme Allied Commander Europe, said allies needed to act.")), "Alexus Grynkewich, NATO's Supreme Allied Commander Europe, said NATO allies needed to attribute blame.");
    // (a subject the line tells of says who they are too; a storm never takes a role)
    assert.equal(introducePeople('Kanishka Narayan will call on companies to do more.', 'x', src('UK to strengthen cyber defences', 'The AI minister, Kanishka Narayan, will call on companies developing frontier AI to do more.')), 'Kanishka Narayan, the AI minister, will call on companies to do more.');
    assert.equal(introducePeople('Hurricane Isaias is intensifying as it heads toward the Gulf Coast.', 'x', src('Isaias', 'Hurricane Isaias, the first hurricane of the 2026 Atlantic season, is intensifying.')), 'Hurricane Isaias is intensifying as it heads toward the Gulf Coast.');
  });
  test('a quotation’s "he wrote" never answers with nobody named; "this morning" airs only near its morning; no vulgar word, no outlet’s question, no "at the time of writing"', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 4, maxChats: 0 };
    const now = new Date('2026-10-12T18:21:00Z');
    const macron = st('mc', 'Citroën bets on nostalgia at Paris motor show', 'Citroën has unveiled an electric version of its 2CV at the Paris Motor Show. French president Emmanuel Macron is paying his customary visit to the Paris Motor Show this morning. The car goes on sale next year.', { published: Date.parse('2026-10-12T07:00:00Z') });
    const gibney = st('gb', 'Alex Gibney says Universal wavered over releasing Elon Musk documentary', 'The film-maker Alex Gibney says Universal wavered over releasing his documentary about Elon Musk. Elon Musk’s response was to post “Gibney is a douche” on X. The film opens next month.', { published: now.getTime() });
    const romero = st('rr', 'US marine veteran aims to win back working-class voters', 'Regina Romero draws on unique biography to connect with voters in Arizona battleground – can she flip a key swing seat? Tucson mayor Regina Romero knocked on doors on Saturday. At the time of writing, the race is tied.', { published: now.getTime() });
    const text = spoken(await write([macron, gibney, romero, ...PLAIN.slice(0, 2).map((f) => f('world'))], program, { now }));
    assert.ok(!/this morning/.test(text), text);
    assert.ok(!/douche/.test(text), text);
    assert.ok(!/flip a key swing seat/.test(text), text);
    assert.ok(!/time of writing/i.test(text), text);
  });
  test('a yes-or-no question as a headline, a podcast’s page: no news; never the question with its own answer', () => {
    assert.ok(notNews(st('q1', 'Was Burnham right to talk about Russian interference', 'Andy Burnham has started a row.')));
    assert.ok(notNews(st('q2', 'Is your boss watching you? The rise of AI surveillance at work – podcast', 'Workers have always been monitored.')));
    assert.ok(!notNews(st('q3', 'Was Neanderthal life violent? This wound suggests lethal fighting was more common', 'A study of a skull suggests violence.', { category: 'science' })));
  });
  test('"In that state", "That could bring…", "Gibney replied", "the artisan" lean on what was never said; a charity is a body of its kind', () => {
    assert.equal(untold('In that state, OurProperty will introduce a new system of memberships.', 'Rent-tech platforms are sidestepping a card surcharge ban'), 'demonstrative');
    assert.equal(untold('That could bring scattered power outages and downed trees.', 'Several major routes were open by daybreak'), 'also');
    assert.equal(untold('Gibney replied: “Yes.”', 'Alex Gibney says Universal wavered'), 'also');
    assert.equal(untold('“I never thought anything like this could happen,” the artisan said.', 'Spanish prosecutors are investigating'), 'person');
    assert.equal(untold('Surveys showed promising early results, according to the charity.', "BBC Gardeners' World Magazine has described the plant"), 'definite');
    assert.equal(untold('Surveys showed promising early results, according to the charity.', 'The Chiltern Society cleared the river'), null);
  });
  test('a business story’s strap is never a war or a fire it mentions in passing', () => {
    assert.equal(topicOf({ title: 'Fewer Britons plan to ringfence money for holidays abroad next year, says travel industry', summary: 'The war in the Middle East and wildfires in Greece have hit bookings.', category: 'business' }), 'BUSINESS');
  });
  test('"much-needed", "hefty" in a headline are not said as ours; "supposedly", "doubtful", "a particularly encouraging finding" are views', () => {
    assert.equal(calmTitle('Long-lost horror gaming cult classic P.T. gets a much-needed PC port'), 'Long-lost horror gaming cult classic P.T. gets a PC port');
    assert.equal(calmTitle('WindBorne wins a hefty US Air Force contract'), 'WindBorne wins a US Air Force contract');
    assert.ok(outletView('The model is supposedly trained to refuse malicious instructions.'));
    assert.ok(outletView('Now, after the Riyadh airport attack, it is doubtful.'));
    assert.ok(outletView('One particularly encouraging finding was how little exercise appeared to be necessary.'));
    assert.ok(outletView('The work raises a profound question about the universe.'));
  });
});

describe('round 6: the last reading before the final replay', () => {
  test('a channel’s number is no figure for a card; the outlet’s own trip is no news line', async () => {
    assert.ok(!extractFigures('France 24 travelled to the place Turning Point was founded to find out more.').some((f) => /24/.test(f.fact)));
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 4, maxChats: 0 };
    const tp = st('tp', 'Turning Point and the battle for Charlie Kirk’s legacy', 'The number of American universities with Turning Point chapters surged by 64 percent. France 24 travelled to the place Turning Point was founded - Phoenix, Arizona - to find out more.', { source: 'France 24' });
    const text = spoken(await write([tp, ...PLAIN.slice(0, 3).map((f) => f('world'))], program));
    assert.ok(!/find out more/.test(text), text);
  });
  test('a surname with its possessive before a number is someone the viewer must meet whole', () => {
    assert.equal(introduceNames("Mannon's 300 cattle survived the blaze.", 'Ranchers wrestle with costs', { s: { title: 'American ranchers wrestle with soaring costs', summary: 'x', body: '"So we are," said Mannon, 63, who voted for Trump.' } }), null);
  });
  test('a name with its own article keeps it once: "TFG" is "The Foschini Group", never "The The Foschini Group"', () => {
    const info = { s: { title: 'Phase Eight and Hobbs owner hit', summary: 'TFG London has apologised to customers.', body: 'According to TFG London - the UK arm of retail conglomerate The Foschini Group - it identified an incident on Sunday.' } };
    assert.equal(introducePeople('TFG said it was investigating.', 'x', info), 'The Foschini Group said it was investigating.');
    assert.equal(introducePeople('Customers of TFG were told.', 'x', info), 'Customers of the Foschini Group were told.');
    // (and letters before the rest of a name are that name: "TFG London" is the UK arm, never "The Foschini Group London")
    assert.equal(introducePeople('TFG London has apologised to customers for disruption.', 'x', info), 'TFG London has apologised to customers for disruption.');
  });
  test('a surname is said with all the given names the source gives it: "Abdel Fattah al-Burhan", never "Fattah al-Burhan"', () => {
    const info = { s: { title: 'Air strikes kill dozens of gold miners on Sudan-Egypt border', summary: 'A Sudan-based rights group said 72 people were killed.', body: "Sudan's civil war between Abdel Fattah al-Burhan's military junta and the paramilitary Rapid Support Forces (RSF) has killed more than 200,000 people.\nDespite backing Sudan's army chief al-Burhan, Egypt considers the war at its border a threat to its security." } };
    const line = introduceNames("Despite backing Sudan's army chief al-Burhan, Egypt considers the war at its border a threat to its security.", 'x', info);
    assert.equal(line, "Despite backing Sudan's army chief Abdel Fattah al-Burhan, Egypt considers the war at its border a threat to its security.");
  });
  test('a quotation card names its speaker whole, as the source gives them, or there is no card', async () => {
    const body = [
      'According to TFG London - the UK arm of retail conglomerate The Foschini Group - it identified an incident on Sunday affecting some IT systems.',
      'Beverley Griffiths, senior lecturer in security and resilience at Bucks New University told PA that this was "a clear sign that major brands are firmly in the crosshairs of cyber attackers".',
      '"No organisation is immune, so the real test of resilience is how quickly a business can detect an incident, respond and recover while keeping its customers informed," Griffiths said.',
    ].join('\n');
    const source = `TFG London has apologised. ${body}`;
    assert.equal(groundQuote({ text: 'No organisation is immune, so the real test of resilience', by: 'Beverley Griffiths' }, source)?.by, 'Beverley Griffiths');
    assert.equal(groundQuote({ text: 'No organisation is immune, so the real test of resilience', by: 'Andrey Griffiths' }, source)?.by, null);
    const program = { id: 'money-minute', title: 'MONEY MINUTE', stories: 4, maxChats: 0 };
    const tfg = st('tfg', 'Phase Eight and Hobbs owner hit by cyber attack', 'TFG London has apologised to customers for disruption after it identified a "cybersecurity incident" on Sunday.', { body, category: 'business', source: 'BBC Business' });
    const ep = await write([tfg, ...PLAIN.slice(0, 3).map((f) => f('business'))], program);
    for (const seg of ep.segments.filter((x) => x.quote?.by)) assert.ok(/\s/.test(seg.quote.by) || /^the\s/i.test(seg.quote.by) || spoken(ep).includes(seg.quote.by), JSON.stringify(seg.quote));
    // (a first name is said with its surname, never with the word that opens its sentence: "Friends Malcolm Butcher, 82, …")
    const flood = st('fl', 'Storm floods market town', 'Residents of the town were cleaning up on Sunday.', {
      body: 'Friends Malcolm Butcher, 82, Jim Tyler, 81, and Dave Blake, 82, said they had lived in the town all their lives "and never seen anything like it".\n"At 2:30 in the morning when it hit it was unbelievable... absolutely raging," Malcolm said.',
      source: 'BBC News',
    });
    const ep3 = await write([flood, ...PLAIN.slice(0, 3).map((f) => f('world'))], { id: 'world-now', title: 'WORLD NOW', stories: 4, maxChats: 0 });
    const card = ep3.segments.find((x) => x.storyId === 'fl' && x.quote?.by);
    if (card) assert.equal(card.quote.by, 'Malcolm Butcher');
    assert.ok(!/As Sunday|Friends Malcolm/.test(spoken(ep3)), spoken(ep3));
    // (never a name run across a headline's end, "…over Manchester City" and "Kogan says…", nor a product after a company)
    const ifr = st('ifr', 'Football regulator chair insists he will resign if politically pressured over Manchester City', 'Kogan says he has faced ‘absolutely no political pressure’.', {
      body: 'The chair of the Independent Football Regulator (IFR), David Kogan, has said he will resign if he faces any political pressure.\n“We have powers within the legislation that allow us to review not only owners and directors and senior executives,” said Kogan.',
      category: 'business', source: 'Guardian Business',
    });
    const ep4 = await write([ifr, ...PLAIN.slice(0, 3).map((f) => f('business'))], program);
    const kogan = ep4.segments.find((x) => x.storyId === 'ifr' && x.quote);
    if (kogan) assert.equal(kogan.quote.by, 'David Kogan');
    assert.ok(!/City Kogan|Kogan\. Kogan/.test(spoken(ep4)), spoken(ep4));
    const hv = st('hv', 'Apple’s first smart display is the 7-inch HomeView', 'Apple opened preorders for the HomeView smart home hub today.', {
      body: 'Apple opened preorders for the HomeView smart home hub today.\nIt works with Apple Intelligence-supporting phones.\n“With Siri AI built into HomeView, users without an Apple Intelligence-enabled iPhone or iPad will benefit from Siri AI’s broad world knowledge,” Apple said.',
      category: 'tech', source: 'Ars Technica',
    });
    const ep5 = await write([hv, ...PLAIN.slice(0, 3).map((f) => f('tech'))], { id: 'tech-bytes', title: 'TECH BYTES', stories: 4, maxChats: 0 });
    const apple = ep5.segments.find((x) => x.storyId === 'hv' && x.quote?.by);
    if (apple) assert.equal(apple.quote.by, 'Apple');
    const dog = st('dog', "Owners fear 'healthy' dog died due to orange substance exposure", "Donna and Pete O'Brien say Misty's health declined after a walk.", {
      body: 'Donna said they did not think much of it at the time.\n"At the time you think it might be copper or iron washing down through the landscape but it stank and it was sort of oily all over her coat," Donna added.',
      category: 'science', source: 'BBC Science',
    });
    const ep2 = await write([dog, ...PLAIN.slice(0, 3).map((f) => f('science'))], { id: 'cosmos', title: 'COSMOS DESK', stories: 4, maxChats: 0 });
    assert.ok(!ep2.segments.some((x) => x.quote?.by === 'Donna' && !/\bDonna\b/.test(String(x.text))), JSON.stringify(ep2.segments.map((x) => x.quote).filter(Boolean)));
  });
  test('letters inside a longer name stay as they are: "NASA JPL", never "NASA the Jet Propulsion Laboratory"', () => {
    const info = { s: { title: 'Perseverance', summary: 'x', body: 'NASA’s Jet Propulsion Laboratory (JPL) in Southern California built it. NASA JPL built and manages operations.' } };
    assert.equal(introducePeople('NASA JPL built and manages operations of the rover.', 'x', info), 'NASA JPL built and manages operations of the rover.');
    assert.equal(introducePeople('JPL built and manages operations of the rover.', 'x', info), 'The Jet Propulsion Laboratory built and manages operations of the rover.');
  });
  test('a quotation’s "he wrote" never follows a line that names nobody', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 4, maxChats: 0 };
    const uk = st('uk', 'UK blames Iran for airbase plot, sanctions two Iranian nationals', 'Britain has sanctioned two Iranians over a suspected plot against an air base.', {
      body: [
        'Foreign Secretary Ed Miliband said on Monday that the government was sanctioning two Iranians.',
        'One is Ruhollah Bazghandi, the head of IRGC counterespionage operations.',
        'The group is already under UK sanctions and has been accused of involvement in several plots against Iranian dissidents.',
        '“We have repeatedly made clear to Iran, Britain will not tolerate threats on our soil,” he wrote on X.',
      ].join('\n'),
    });
    const text = spoken(await write([uk, ...PLAIN.slice(0, 3).map((f) => f('world'))], program, { depth: 3 }));
    if (/he wrote on X/.test(text)) assert.match(text.slice(Math.max(0, text.indexOf('“We have repeatedly') - 160), text.indexOf('“We have repeatedly')), /Miliband|Foreign Secretary/, text);
  });
  test('"this morning" airs only in the morning where the story is, whatever the feed’s date says', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 4, maxChats: 0 };
    const story = (published) => st('mc', 'Citroën bets on nostalgia at Paris motor show amid struggling French sales', 'French president Emmanuel Macron is paying his customary visit to the Paris Motor Show this morning. This year’s show sees electric and hybrid vehicles in the spotlight as European carbuilders seek to roll back years of sliding sales. The sector has been given a boost by a new subsidy.', { published, source: 'France 24' });
    // (France 24's morning video, its feed dated 40 minutes before a WORLD NOW at 18:21 UTC, 12 Oct)
    const evening = new Date('2026-10-12T18:21:00Z');
    const late = spoken(await write([story(evening.getTime() - 40 * 60_000), ...PLAIN.slice(0, 3).map((f) => f('world'))], program, { now: evening }));
    assert.ok(!/this morning/.test(late), late);
    const morning = new Date('2026-10-12T09:10:00Z');
    const early = spoken(await write([story(morning.getTime() - 60 * 60_000), ...PLAIN.slice(0, 3).map((f) => f('world'))], program, { now: morning }));
    assert.ok(/Macron/.test(early), early);
  });
  test('a count the headline gives is no leaning: the lead tells the strike, never only its background', async () => {
    const t = "Yandex has been forced to pause its operations at a data centre near Moscow after the facility was damaged in a Ukrainian drone strike - the third attack on the Russian tech giant's sites this week.";
    assert.equal(untold(t, 'Ukraine strikes Yandex data centre in third attack on Russian tech giant'), null);
    assert.equal(untold('Officials said the third attack came at night.', 'Ukraine strikes a data centre'), 'sequel');
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 4, maxChats: 0 };
    const yx = st('yx', 'Ukraine strikes Yandex data centre in third attack on Russian tech giant', 'It is the third time this week that Ukraine has targeted Russian tech giant Yandex, forcing the company to suspend its operations.', {
      body: [
        t,
        'Earlier this week, Yandex said it was struggling to maintain its services after two of its five data centres were hit in Ukrainian strikes.',
        'Both Russia and Ukraine have stepped up attacks on infrastructure in recent months as the war between them continues in its fifth year.',
        'Meanwhile, Russian strikes on Ukraine have continued through the weekend.',
      ].join('\n'),
      source: 'BBC News',
    });
    const ep = await write([yx, ...PLAIN.slice(0, 3).map((f) => f('world'))], program);
    const lead = ep.segments.find((x) => x.storyId === 'yx' && x.type === 'story');
    assert.match(String(lead.text), /Yandex has been forced to pause|drone strike/, lead.text);
    // (deeper, never on another event the article tells further down: "On Saturday, at least 20 people… were killed in Russian
    // attacks on Zaporizhzhia")
    const zap = st('yx3', yx.title, yx.summary, { body: `${yx.body}\nOn Saturday, at least 20 people including four children were killed in Russian attacks on Zaporizhzhia, local officials confirmed.`, source: 'BBC News' });
    for (const depth of [0, 2]) {
      const ep3 = await write([zap, ...PLAIN.slice(0, 3).map((f) => f('world'))], program, { depth });
      const lead3 = ep3.segments.find((x) => x.storyId === 'yx3' && x.type === 'story');
      assert.ok(lead3 && !/^(?:\s*\[[^\]]*\])*\s*On Saturday/.test(lead3.text), lead3?.text);
    }
    // (and never opened on "also", wherever it stands: the writer would drop it, its headline still in the intro)
    const deep = st('yx2', yx.title, yx.summary, { body: `${yx.body}\nRussia has previously also struck Ukrainian data centres, causing internet outages and prompting some firms to move their servers abroad.`, source: 'BBC News' });
    const grave = st('gv', 'Earthquake kills 40 in eastern Turkey', 'An earthquake has killed at least 40 people in eastern Turkey, officials say. Rescuers are searching collapsed buildings.', { source: 'BBC News' });
    for (const depth of [0, 2]) {
      const ep2 = await write([grave, deep, ...PLAIN.slice(0, 2).map((f) => f('world'))], program, { depth });
      const first = ep2.segments.find((x) => x.storyId === 'yx2' && x.type === 'story');
      assert.ok(first, JSON.stringify(ep2.segments.map((x) => x.text)));
      assert.ok(!/^[^,;:.]{0,80}\balso\b/i.test(String(first.text).replace(/^(?:\s*\[[^\]]*\])+\s*/, '')), first.text);
    }
  });
  test('the outlet’s reading of a group’s mind is a view; a picture’s page is no news', () => {
    assert.ok(outletView('Republicans seem keenly aware of the discord and frustration among farmers.'));
    assert.ok(!outletView('Analysts say Republicans seem keenly aware of the discord among farmers.'));
    assert.ok(notNews(st('n1', 'Transporter-18 SmallSats Encapsulation', 'Three NASA-supported small spacecraft are shown before being encapsulated in a SpaceX Falcon 9.', { link: 'https://www.nasa.gov/image-article/transporter-18-smallsats-encapsulation/', source: 'NASA' })));
    assert.ok(notNews(st('n2', 'NASA’s Record-Setting Perseverance Rover Team', 'Members of the team gather in the Mars Yard.', { link: 'https://science.nasa.gov/photojournal/nasas-record-setting-perseverance-rover-team/', source: 'NASA' })));
    assert.ok(!notNews(st('n3', 'NASA Science, Cargo Launch on 35th SpaceX Resupply Mission to Station', 'NASA’s SpaceX 35th commercial resupply mission lifted off at 6:33 a.m. EDT Tuesday.', { link: 'https://www.nasa.gov/news-release/nasa-science-cargo-launch-on-35th-spacex-resupply-mission-to-station/', source: 'NASA' })));
  });
  test('a body described, not named, follows the sentence that named it: never another body’s line', async () => {
    const program = programOf('money-minute');
    // (the story as BBC Business wrote it, 13 Oct)
    const tfg = st('tfg', 'Phase Eight and Hobbs owner hit by cyber-attack, as H&M probes separate hack claim', 'TFG London has apologised to customers for disruption after it identified a "cybersecurity incident" on Sunday.', {
      body: [
        'The owner of high-end fashion brands Hobbs, Whistles and Phase Eight says it is investigating a cyber-security incident.',
        'According to TFG London - the UK arm of retail conglomerate The Foschini Group - it identified an incident on Sunday affecting some IT systems and "specifically impacting our Phase Eight, Hobbs, and Whistles brands".',
        '"We are actively investigating and working with external cyber security specialists," the company told BBC News in a statement.',
        'Meanwhile, H&M is investigating a separate claim that it was attacked by a notorious hacking group.',
        'TFG said its brands\' stores are operating as normal but some website capabilities may be unavailable, adding "we apologise for any disruption and will provide additional updates to our customers as appropriate".',
        'The retail group reportedly told customers in an email that it did not believe customers\' payment information had been affected by the incident.',
        '"As our investigation continues, we will be working to identify if any sensitive information related to our customers was impacted," it said.',
        'The email, seen by news service PA, also said that those whose personal information had been impacted would be informed directly.',
        'Beverley Griffiths, senior lecturer in security and resilience at Bucks New University told PA that this was "a clear sign that major brands are firmly in the crosshairs of cyber attackers".',
        'Fashion giants ranging from Adidas to Alexander McQueen have been targeted by cyber-criminals seeking to extort money by threatening to release customer data unless they are paid a ransom.',
      ].join('\n'),
      category: 'business', source: 'BBC Business',
    });
    for (const depth of [0, 1, 2]) {
      const text = spoken(await write([tfg, ...PLAIN.slice(0, 3).map((f) => f('business'))], program, { depth }));
      if (/The retail group reportedly/.test(text)) assert.ok(/TFG said its brands/.test(text), text);
      assert.ok(!/H&M is investigating a separate claim that it was attacked by a notorious hacking group\.\s+The retail group/.test(text), text);
    }
  });
  test('a public body the story named is "the organisation" after it, as the coherence gate knows: the IMF’s forecast airs', async () => {
    // (the business rule above once took "The organisation's latest report…" for a lean and dropped the forecast the headline
    // is about, MONEY MINUTE 14 Oct; BBC Business as written)
    const imf = st('imf', 'UK growth forecast upgraded but higher energy prices to hit economy next year', 'The prediction from the IMF comes as final preparations are being made for the first Budget under Prime Minister Andy Burnham.', {
      body: [
        'The UK economy is forecast to grow by more than previously expected this year before higher energy prices and interest rates hit the economy in 2027, the International Monetary Fund (IMF) said.',
        'The organisation\'s latest report, which is closely watched by the government, said the UK economy would expand by 1.3% in 2026, up from the 1% it predicted in July, before slowing in 2027.',
        'Economies across the world have proved more resilient to the energy price shock caused by the US-Iran war, the IMF said, but it warned the economic fallout from the conflict remained "highly uncertain".',
        'Chancellor John Healey said the government would look to "provide some breathing space" for households in the Budget.',
        'Healey is making the final preparations to Andy Burnham\'s new-look government\'s tax and spending plans, which will be announced on 28 October.',
      ].join('\n'),
      category: 'business', source: 'BBC Business',
    });
    for (const depth of [0, 2]) {
      const text = spoken(await write([imf, ...PLAIN.slice(0, 3).map((f) => f('business'))], programOf('money-minute'), { depth }));
      assert.match(text, /1\.3%/, text);
    }
  });
  test('a weekday before a surname is no part of the name: "On Monday Narayan" is the AI minister, introduced', () => {
    const info = { s: { title: 'Nvidia, worth $5.5tn, donates $250m to UK for AI safety research', summary: 'The $5.5tn US chipmaker Nvidia is donating $250m worth of computing power to the UK.', body: 'Kanishka Narayan, the UK’s AI minister, said the announcement was a “vote of confidence”.\nOn Monday Narayan confirmed that the institute was conducting tests on US-developed AI models.' } };
    const named = introduceNames('On Monday Narayan confirmed that the institute was conducting tests on US-developed AI models.', 'x', info);
    assert.match(String(named), /Kanishka Narayan/);
    const line = introducePeople(named, 'x', info);
    assert.ok(line === null || /Kanishka Narayan, the UK’s AI minister,/.test(line), line);
    // (and a place the gazetteer lacks keeps its "In": "In Kosanica, Montenegro, the average maximum temperature…", Guardian 12 Oct)
    const wx = { s: { title: 'Balkan temperatures swing as heavy rain heads for Greece', summary: 'Clear skies bring warm days and cold nights to Montenegro.', body: 'In Kosanica, Montenegro, the average maximum temperature in October is 15C (59F), while the average minimum is 4C.' } };
    const kos = 'In Kosanica, Montenegro, the average maximum temperature in October is 15C (59F), while the average minimum is 4C.';
    assert.equal(introduceNames(kos, 'x', wx), kos);
  });
  test('the intro never teases a story the checks dropped', () => {
    const WN = programOf('world-now');
    const duo = { A: { id: 'paco', ...channel.presenters.paco }, B: { id: 'lola', ...channel.presenters.lola } };
    const a = st('a', 'Lisbon opens a new metro line to the airport', 'Lisbon has opened a new metro line linking the airport to the city centre.');
    const b = st('b', 'Ukraine strikes Yandex data centre in third attack on Russian tech giant', 'It is the third time this week that Ukraine has targeted Russian tech giant Yandex, forcing the company to suspend its operations.');
    const out = normalizeBulletin({
      title: 'T',
      segments: [
        { type: 'intro', anchor: 'A', emotion: 'neutral', text: '[serious] Lisbon opens a new metro line to the airport. Also coming up: Ukraine strikes Yandex data centre in third attack on Russian tech giant. This is WORLD NOW. I’m Paco Pixel, with Lola Byte.' },
        { type: 'story', storyId: 'a', anchor: 'A', emotion: 'neutral', headline: a.title, text: 'Lisbon has opened a new metro line linking the airport to the city centre.', shot: 'wide' },
        { type: 'story', storyId: 'b', anchor: 'B', emotion: 'neutral', headline: b.title, text: 'Russia has previously also struck Ukrainian data centres.', shot: 'wide' },
        { type: 'outro', anchor: 'A', emotion: 'neutral', text: 'That’s WORLD NOW.' },
      ],
    }, [a, b], { program: WN, presenters: duo, maxStories: 14 });
    assert.ok(!out.segments.some((x) => x.storyId === 'b'), 'the leaning story is dropped');
    const intro = out.segments.find((x) => x.type === 'intro').text;
    assert.ok(!/Yandex/.test(intro), intro);
    assert.match(intro, /Lisbon opens a new metro line/);
  });
  test('a tanker attacked is a war’s story, never the sea’s', () => {
    assert.equal(topicOf({ title: 'Oil tanker reportedly attacked in Strait of Hormuz region', summary: 'A vessel was hit at sea.', category: 'world' }), 'CONFLICT');
  });
});
