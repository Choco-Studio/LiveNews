// What the fallback writer aired wrong on the real news of 9 Oct (COSMOS DESK, TECH BYTES, WORLD NOW), each case taken
// from the outlet's own text: broken feed sentences, names nobody introduced, a label read as a headline, a number in a
// name on a card, the reader addressed, a time that points back at a sentence left out, a follow-up three stories later.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockProvider, sentenceCase, LABEL_TITLE } from '../server/providers/mock.js';
import { extractJson, trimClause } from '../server/writer.js';
import { extractFigures, isGrave, quotesIn, sentencesIn } from '../server/facts.js';
import { notNews } from '../server/news.js';
import { parseCues } from '../public/js/cues.js';
import { loadChannel } from '../server/channel.js';

const spoken = (t) => parseCues(t).text;
const COSMOS_CAST = { A: { id: 'nova', name: 'Dr Nova Reyes' }, B: { id: 'unit8', name: 'UNIT-8' } };
const TECH_CAST = { A: { id: 'max', name: 'Max Circuit' }, B: { id: 'ada', name: 'Ada Volt' } };
const program = (id, stories = 3, extra = {}) => ({ id, title: id.toUpperCase(), stories, maxChats: 0, intro: 'frame', targetSeconds: [360, 480], ...extra });
const st = (id, title, summary, body = '', extra = {}) => ({ id, title, summary, body, source: 'Pixelburg Post', category: 'science', image: null, ...extra });
const FILLER = [
  st('f1', 'Rare tree on Somerset clifftops being protected', "A rare tree, Fay's whitebeam, that is only found on cliffs in Somerset is being protected."),
  st('f2', 'Bees use the sun as a compass on cloudy days', 'Honeybees can find their way by the sun even when clouds cover the sky, researchers in Germany say.'),
];
const write = async (stories, prog = program('cosmos'), cast = COSMOS_CAST, extra = {}) => extractJson((await createMockProvider().generate({ stories, channelName: 'TEST', presenters: cast, program: prog, count: prog.stories, ...extra })).text);
const tell = async (story, prog, cast) => {
  const seg = (await write([...FILLER, story], prog, cast)).segments.find((s) => s.storyId === story.id);
  assert.ok(seg, `${story.id} aired`);
  return spoken(seg.text);
};

describe('the desk and the facts (9 Oct)', () => {
  test('a clock keeps its time zone; a number in a name is no figure; an adjective keeps its noun on a card', () => {
    assert.deepEqual(sentencesIn('The crew will speak at 3:30 p.m. EDT, Thursday, at the center. They landed at 9 a.m. The rest followed.'), ['The crew will speak at 3:30 p.m. EDT, Thursday, at the center.', 'They landed at 9 a.m.', 'The rest followed.']);
    assert.deepEqual(extractFigures('After more than seven months aboard the station, NASA’s SpaceX Crew-12 mission safely splashed down Thursday.'), []);
    assert.deepEqual(extractFigures('The rocket put 24 satellites into orbit, and Apollo 11 landed safely.').map((f) => f.fact), ['24 SATELLITES']);
    assert.ok(extractFigures('Intense flash of radio waves has travelled through ‘approximately 80% of cosmic history’.').some((f) => f.fact === 'ABOUT 80% OF COSMIC HISTORY'));
  });

  test('viruses and microbes are attacked and killed in biology; a death notice and a shooting are grave', () => {
    for (const t of ['Researchers have uncovered a new way bacteria detect viral attacks.', 'These viruses target bacteria, allowing them to kill harmful microbes without damaging human cells.', 'Ministers rip up the rulebook on planning']) assert.ok(!isGrave(t), t);
    for (const t of ['RIP Margaret Hamilton, whose code saved the Apollo 11 Moon landing', 'US immigration agents shot and wounded a man in his car.', 'The drug killed two cancer patients in the trial.']) assert.ok(isGrave(t), t);
  });

  test('a picture’s caption and an hourly newscast are no reports; a quotation is said by the company, not by "a move the company"', () => {
    assert.ok(notNews({ title: 'Crew-12 Returns to Earth', summary: 'The SpaceX Crew Dragon Freedom spacecraft is seen moments before splashing down in the Pacific Ocean in this Oct. 8, 2026, photograph.' }));
    assert.ok(notNews({ title: "Trump says U.S. won't attack Iran before midterms. And, ICE agent shoots man in New York" }));
    assert.ok(!notNews({ title: 'NASA’s SpaceX Crew-12 splashes down', summary: 'The crew splashed down off the coast of Los Angeles.' }));
    assert.equal(quotesIn('SpaceX has acquired spectrum licenses - a move the company says "will pave the way" for its Starlink Mobile service.')[0].by, 'the company');
  });

  test('a cut never ends on a word that waits, nor leaves a clause without its main clause', () => {
    assert.equal(trimClause('The plan was for her to work until he finished his law degree, after which she would join him in Boston.', 14, 6), 'The plan was for her to work until he finished his law degree.');
    assert.equal(trimClause('But while Lunsford agreed with the method of execution, he said he did not want to watch it himself on any screen.', 12, 6), null);
    assert.equal(trimClause('In what unions have billed as Act Four of the three-week movement, tens of thousands marched again in cities across France.', 14, 6), null);
    assert.equal(trimClause('If it goes ahead, and legal experts told the BBC it might not ever happen, it would be the first public execution in decades.', 16, 6), null);
    assert.equal(trimClause('The SpaceX Crew Dragon Freedom spacecraft is seen moments before splashing down in the Pacific Ocean off California.', 9, 6), null, '"seen moments" is no sentence');
  });
});

describe('the fallback writer on real news (9 Oct)', () => {
  test('a feed’s broken sentence, an editor’s note, press logistics and the reader addressed never air', async () => {
    const text = await tell(
      st('sspicy', 'NASA’s SSPICY Mission to Demonstrate In-Space Inspection Technologies', 'A new NASA-supported spacecraft will get up close to satellites that are no longer in service, demonstrating technologies that could support future in-space repairs. 1 from Vandenberg Space Force Base in California.', [
        'The mission is a technology demonstration where an Otter spacecraft will approach up to four inoperable space objects in low Earth orbit.',
        'The crew members will discuss the mission during a news conference at 3:30 p.m. EDT, Thursday, at the agency’s Johnson Space Center.',
        'You might not have known that the spacecraft was built by a company of only forty people.',
        'Update 10/08/2026 1:50pm ET: The article was updated to include a statement from NASA.',
        'Computer vision and sensors enable software to make real-time navigation decisions as the spacecraft approaches each target.',
      ].join('\n'), { source: 'NASA' })
    );
    for (const bad of [/1 from Vandenberg/, /news conference/, /You might/, /Update 10/, /was updated/]) assert.ok(!bad.test(text), `${bad}: ${text}`);
    assert.match(text, /Computer vision and sensors/);
  });

  test('a time that points back airs only after its sentence; a "he" or "she" nobody introduced never airs', async () => {
    const text = await tell(
      st('mh', 'RIP Margaret Hamilton, whose code saved the Apollo 11 Moon landing', 'Hamilton also coined the term "software engineering" and founded two successful software companies.', [
        'Margaret Hamilton, who coined the term “software engineering” and led the development of onboard flight software for NASA’s Apollo program in the 1960s, died last week at the age of 90.',
        'She met James Cox Hamilton while studying mathematics at Earlham College in Indiana.',
        'She married her first husband, James Cox Hamilton, that same year.',
        'The plan was for her to work until he finished his law degree, after which she would study too.',
      ].join('\n'), { source: 'Ars Technica', category: 'tech' })
    );
    assert.match(text, /^Margaret Hamilton died last week at the age of 90/, 'an over-long opener loses its aside, not its news');
    assert.ok(!/that same year/.test(text) || /She met James Cox Hamilton/.test(text), text);
    assert.ok(!/until he finished/.test(text), text);
  });

  test('people by surname alone are named whole or not at all; a connective never opens; an aside already said goes', async () => {
    const crew = await tell(
      st('crew', 'NASA’s SpaceX Crew-12 splashes down', 'After more than seven months aboard the International Space Station, NASA’s SpaceX Crew-12 mission safely splashed down Thursday in the Pacific Ocean off the coast of Los Angeles.', [
        'Teams aboard SpaceX recovery vessels retrieved the spacecraft and its crew shortly after.',
        'The mission was the second for Meir and Fedyaev and the first for Hathaway and Adenot.',
        'During their 237-day mission, the four crew members traveled more than 100 million miles.',
      ].join('\n'), { source: 'NASA' })
    );
    assert.ok(!/Meir and Fedyaev/.test(crew), crew);
    const fh = await tell(
      st('fh', 'Fort Hood survivor supports gunman’s execution', 'Alonzo Lunsford tells the BBC the punishment befits the crime.', [
        'Alonzo Lunsford, who was shot seven times, told the BBC that the "method is befitting" for Nidal Hasan.',
        'Hasan, a US Army psychiatrist, fatally shot 13 unarmed US soldiers in a medical building at Fort Hood, in Texas, in 2009.',
      ].join('\n'), { category: 'world' }),
      program('world-now'),
      { A: { id: 'paco', name: 'Paco Pixel' }, B: { id: 'lola', name: 'Lola Byte' } }
    );
    assert.ok(!/(?<!Nidal )Hasan fatally/.test(fh), fh);
    const dc = await tell(
      st('dc', 'Data centre raises noise and wildlife impact fears', 'The data centre, which will have 72 chiller units on its roof, will generate 150 jobs, planners hear.', [
        'A huge data centre planned in a village near a nature reserve would generate "very high noise levels" without extensive measures to block it, experts have said.',
        'But Norwich Apex Data Centre has defended the scheme, claiming assessments showed it would not harm protected areas.',
      ].join('\n'))
    );
    assert.match(dc, /^A huge data centre planned in a village/, 'a lede that ends on who said it may run a little long');
    assert.ok(!/^But\b/.test(dc));
  });

  test('a label headline is never read as one: the intro says the story’s news, the lead does not say it again', async () => {
    const isaias = st('hur', 'BBC on Hurricane Isaias and its expected Gulf Coast landfall', "BBC Weather's Chris Fawkes says the first hurricane of the 2026 Atlantic season could bring dangerous winds, storm surge and heavy rains to the Gulf Coast Friday.", [
      'Hurricane Isaias, the first hurricane of the 2026 Atlantic season, is intensifying as it heads toward the northern Gulf Coast.',
      'Isaias also ties the record for the latest first hurricane of an Atlantic season, set in 1905.',
    ].join('\n'), { source: 'BBC Science' });
    assert.ok(LABEL_TITLE.test(isaias.title) && LABEL_TITLE.test('RIP Margaret Hamilton, whose code saved Apollo 11') && LABEL_TITLE.test("'Careless use of AI is the real threat'"));
    const cosmos = { id: 'cosmos', ...loadChannel().programs.cosmos, stories: 3 };
    const script = await write([isaias, ...FILLER], cosmos);
    const intro = spoken(script.segments[0].text);
    assert.match(intro, /^Hurricane Isaias is intensifying as it heads toward the northern Gulf Coast\./);
    const lead = spoken(script.segments.find((s) => s.storyId === 'hur').text);
    assert.ok(!/is intensifying/.test(lead), lead);
    assert.match(script.segments.find((s) => s.storyId === 'hur').headline, /^Hurricane Isaias/, 'the strap says the news, not "BBC on ..."');
  });

  test('a Title Case headline is said in sentence case; a name keeps its capital', () => {
    const info = { s: { summary: 'The mission is a technology demonstration of in-space inspection, demonstrating technologies for repairs.', body: '' } };
    assert.equal(sentenceCase('NASA’s SSPICY Mission to Demonstrate In-Space Inspection Technologies', info), 'NASA’s SSPICY mission to demonstrate in-space inspection technologies');
    assert.equal(sentenceCase('Bacteria turn a virus’ own weapon against it', info), 'Bacteria turn a virus’ own weapon against it');
  });

  test('UNIT-8 echoes the headline’s figure from what aired, never a place in its stead', async () => {
    const sewage = st('sew', 'More than 800,000 hours of sewage spills in Wales last year, report claims', 'It is equivalent to a sewage discharge happening every five minutes, according to campaigners.', [
      'New figures show sewage was released into rivers, lakes and the sea around Wales for more than 800,000 hours last year.',
      'The figures are down on the year before when sewage was discharged for more than 970,000 hours.',
    ].join('\n'), { source: 'BBC Science' });
    const script = await write([sewage, ...FILLER], program('cosmos', 3, { maxChats: 6, chats: { after: ['lead', 'story', 'lighter'] } }));
    const echo = script.segments.find((s) => s.type === 'chat' && s.anchor === 'B');
    assert.ok(echo, 'UNIT-8 restates after the lead');
    assert.match(echo.text, /800,000 hours\./);
  });

  test('the number of the day is the headline’s figure when only the article gives it', async () => {
    const rev = st('rev', 'OpenAI’s revenue is reportedly $20 billion less than previously projected', "It had previously been reported that the AI lab's annualized revenue was some $70 billion, but a new report claims it's a whole lot less than that.", [
      'A little over a week ago, it was reported that OpenAI’s annualized revenue was approaching $70 billion.',
      'Now, however, the AI lab is said to have told investors that the real revenue is some $20 billion lower than that.',
    ].join('\n'), { source: 'TechCrunch', category: 'tech' });
    const script = await write([st('l', 'Chipmaker unveils a laptop processor', 'A chipmaker has unveiled a processor that runs for 20 hours on a charge.', '', { category: 'tech' }), rev, ...FILLER], program('tech-bytes', 3, { features: ['number'] }), TECH_CAST);
    const seg = script.segments.find((s) => s.storyId === 'rev');
    assert.equal(seg?.feature, 'number');
    assert.match(spoken(seg.text), /^Our number of the day: some \$20 billion\./);
  });

  test('a second report of the same affair airs right after the first', async () => {
    const tb = program('tech-bytes', 5);
    const stories = [
      st('a', 'OpenAI doubles down on decision to fire three AI safety researchers', 'OpenAI is standing firm on its decision to fire three safety researchers after an investigation.', '', { category: 'tech', source: 'The Verge' }),
      st('b', 'Chipmaker unveils a laptop processor', 'A chipmaker has unveiled a processor that runs for 20 hours on a charge.', '', { category: 'tech' }),
      st('c', 'Robot vacuum learns to climb stairs', 'A robot vacuum maker says its new model can climb stairs.', '', { category: 'tech' }),
      st('d', 'Fired OpenAI safety researchers dispute misconduct claims', 'Three fired OpenAI safety researchers dispute allegations of mishandling sensitive information.', '', { category: 'tech', source: 'TechCrunch' }),
      st('e', 'Seoul tests self-driving buses', 'Seoul has started testing self-driving buses on two routes.', '', { category: 'tech' }),
    ];
    const ids = (await write(stories, tb, TECH_CAST)).segments.filter((s) => s.type === 'story').map((s) => s.storyId);
    const i = ids.indexOf('a');
    const j = ids.indexOf('d');
    assert.ok(i >= 0 && j >= 0, ids.join(' '));
    assert.equal(Math.abs(j - i), 1, ids.join(' '));
  });
});

describe('MONEY MINUTE format round (9 Oct)', () => {
  const PENNY = { A: { id: 'penny', name: 'Penny Sterling' } };
  const biz = (id, title, summary, body = '', extra = {}) => st(id, title, summary, body, { category: 'business', ...extra });
  test('analysis, features and galleries are not reports; a report that explains is', () => {
    for (const t of ['Aging bull: Why this 4-year-old stock-market rally still packs a punch', 'The new Darth Vader: how tech execs became the film villains of our age', 'New-build homes for first-time buyers in England – in pictures']) assert.ok(notNews({ title: t }), t);
    for (const t of ['Ministers explore how to cut energy bills', 'Howard Marks warns on credit', 'Bank explains why rates rose']) assert.ok(!notNews({ title: t }), t);
  });

  test('Penny alone: one mid-programme signpost of her own, never an exchange', async () => {
    const mm = { id: 'money-minute', ...loadChannel().programs['money-minute'] };
    const titles = ['Oil prices slide as demand cools', 'Bank of Canada holds rates', 'Airline orders 100 new jets', 'UK inflation rises to 3.8 percent', 'Chocolate makers warn of higher prices', 'Copper hits a two-year high', 'Lagos shops switch to solar power', 'Tokyo stocks close at a record high', 'Rice prices ease in Asia'];
    const stories = titles.map((t, k) => biz(`b${k}`, t, `${t.replace(/ as .*/, '')}, officials said on Thursday. Traders said the move was expected by most analysts in the market.`));
    const script = await write(stories, mm, PENNY);
    const chats = script.segments.filter((s) => s.type === 'chat');
    assert.ok(chats.length <= 1, chats.map((c) => c.text).join(' | '));
    assert.ok(chats.every((c) => c.anchor === 'A' && /^(?:\[[^\]]*\]\s*)?Still to come:/.test(c.text)), chats.map((c) => c.text).join(' | '));
  });

  test('a currency conversion and an outlet’s label never air; the number of the day’s card is the figure said', async () => {
    const rev = biz('rev', 'What happened to OpenAI’s $20bn? Revenue scare rattles AI trade', 'US tech futures rebounded on Friday, a day after a report that OpenAI’s annualised revenue was $20 billion (€17.8bn) below earlier estimates helped send the Nasdaq down 1.25% and hit chipmakers.', '', { source: 'Euronews Business' });
    const mm = { id: 'money-minute', ...loadChannel().programs['money-minute'], stories: 3 };
    const script = await write([biz('l', 'Bank of Canada holds rates at 3.5 percent', 'The Bank of Canada has kept its main interest rate unchanged at 3.5 percent.'), biz('w', 'Exclusive: wastewater trade rakes in millions', 'Exclusive: Firms made more than £340m last year from processing industrial and commercial wastewater at sewage works.'), rev], mm, PENNY);
    const text = script.segments.map((s) => spoken(s.text)).join(' ');
    assert.ok(!/€17\.8bn|Exclusive:/.test(text), text);
    const num = script.segments.find((s) => s.feature === 'number');
    assert.ok(num, 'a number of the day');
    assert.match(spoken(num.text), /^Our number of the day: \$20 billion\./);
    assert.equal(num.numbers?.[0]?.value, '$20 BILLION');
    assert.equal(num.numbers?.[0]?.label, 'BELOW ESTIMATES');
  });
});
