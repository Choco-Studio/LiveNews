import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewsDesk, notNews, sameQuotedName, sameStorm, sameSummary } from '../server/news.js';
import { dropPageFurniture, isTranscriptLine } from '../server/transcript.js';
import { isFragment, shortHeadline, splitClauses, trimClause } from '../server/writer.js';
import { topicOf } from '../server/topics.js';
import { extractFigures } from '../server/facts.js';
import { LABEL_TITLE, knownPoints } from '../server/providers/mock.js';

// Faults heard on a live trace with real news (10 Oct), each kept from airing again.

test('a newsletter that greets its readers is no report (The Verge: "Hi, friends! ... Part time, anyway.")', () => {
  assert.ok(notNews({ title: 'The techlash has gone Hollywood', summary: 'Hi, friends! Part time, anyway. Thanks to everyone who sent well wishes and tips for managing three kids.' }));
  assert.ok(notNews({ title: 'This week in batteries', summary: 'Welcome to the weekly briefing.' }));
  assert.ok(notNews({ title: 'Gadgets of the week', summary: 'The new phones arrived.', body: 'Happy Friday! Here is what landed this week.' }));
  assert.ok(!notNews({ title: 'Central bank raises rates', summary: 'Hiring slowed in September, officials said.' }));
  assert.ok(!notNews({ title: 'Hi-tech port opens in Rotterdam', summary: 'Hi-tech cranes began work on Monday.' }), 'a hyphenated "Hi-tech" is no greeting');
});

test('a feed summary cut right after a title\'s full stop loses the half sentence ("Byrnes texted Ohio Sen. […]")', () => {
  const summary = 'A jury found an Ohio political blogger guilty. On Friday, a judge ordered DJ Byrnes to pay a $200 fine. Byrnes texted Ohio Sen. [&#8230;]';
  assert.equal(dropPageFurniture(summary), 'A jury found an Ohio political blogger guilty. On Friday, a judge ordered DJ Byrnes to pay a $200 fine.');
  assert.equal(dropPageFurniture('Gov. Smith signed the bill on Monday. It takes effect in May.'), 'Gov. Smith signed the bill on Monday. It takes effect in May.', 'a title inside a whole sentence stays');
});

test('a two-sentence title that does not fit the strap is its first sentence, never "... AI AGENTS. IT’S"', () => {
  assert.equal(shortHeadline('Anthropic can’t reliably control its AI agents. It’s cutting off its internal evals from the live internet instead', 56), 'Anthropic can’t reliably control its AI agents');
  assert.equal(shortHeadline('U.S. stocks rise. Bonds fall', 56), 'U.S. stocks rise. Bonds fall', 'a short one fits whole');
});

test('a film is CULTURE whatever its plot ("a family on trial" is not JUSTICE)', () => {
  assert.equal(topicOf({ title: 'Director of Fjord takes ‘risky position’ of moderator', summary: 'Cristian Mungiu’s sixth feature, Fjord, concerns a family on trial.', category: 'tech' }), 'CULTURE');
  assert.equal(topicOf({ title: 'Court upholds ban on protest camp', summary: 'The judges ruled on Monday.', category: 'world' }), 'PROTESTS');
  assert.notEqual(topicOf({ title: 'FBI director testifies before senators', summary: 'The director answered questions for three hours.', category: 'world' }), 'CULTURE', 'a director is not a film');
});

// ---- the second trace of the day (one episode of each programme from the live feeds, offline writer)

test('a strap is never cut to say something else: the main verb, a contrast, the opinion\'s owner and a named object stay', () => {
  const sh = (t) => shortHeadline(t);
  assert.match(sh('Ex-Deutsche Bank trader jailed for rigging rates has conviction overturned'), /overturned$/, 'he was cleared, not jailed');
  assert.match(sh('Ex-Deutsche Bank trader has conviction for rigging interest rates quashed'), /quashed$/);
  assert.match(sh('Sydney trader sacked for working from Singapore without permission wins unfair dismissal case'), /wins unfair dismissal case$/);
  assert.match(sh('LG’s RGB LED TV is good, but it’s no OLED'), /but/, 'the verdict keeps its "but"');
  assert.match(sh('Women with PMOS should get subsidised weight-loss drugs, Australian advocates say'), /advocates say$/, 'an opinion is theirs, not ours');
  assert.match(sh('Irish property group in talks about rescue deal for Poundland'), /Poundland$/);
  assert.equal(sh('Pete Hegseth’s plan to livestream execution puts US in dubious company'), 'Pete Hegseth’s plan to livestream execution puts US in dubious company', 'nor "dubious firm"');
});

test('a strap is never a scrap: no open quotation, no dangling word, no name cut in two, no label that says "it"', () => {
  const sh = (t) => shortHeadline(t);
  assert.equal(sh('Greens must avoid ‘capture by extremists and racists’, says party MP').split('‘').length, sh('Greens must avoid ‘capture by extremists and racists’, says party MP').split('’').length);
  assert.doesNotMatch(sh('UK savings: 5% interest rate deals may not last, say experts'), /may not$/);
  assert.equal(sh('Palestinian president Abbas postpones legislative elections, sets presidential poll for September 2027'), 'Palestinian president Abbas postpones legislative elections');
  assert.match(sh('AI disqualification yields new Nikon Small World in Motion winner'), /Nikon Small World in Motion winner$/);
  assert.match(sh('The Telo MT1 is a big truck trapped in a tiny truck’s body'), /big truck trapped in tiny truck’s body$/);
  assert.doesNotMatch(sh('‘Pure insanity’: Mathematicians will need years to make sense of OpenAI’s latest drop'), /OpenAI’s$/);
  assert.doesNotMatch(sh('Boots has a new owner: Three ways it could affect you'), /^Three ways/);
  assert.doesNotMatch(sh('Questions remain over Ebola patient who travelled across three nations undetected'), /who travelled$/);
  assert.doesNotMatch(sh('Isaias pummels the Gulf Coast, and plows through Alabama'), /and plows$/);
  assert.doesNotMatch(sh('The maker of non-text AI model Jev valued at $7.5B just weeks after launch'), /just weeks$/);
  assert.equal(sh('Mexico City closes its historic centre to cars on Sundays'), 'Mexico City closes historic centre to cars', 'a day still goes');
});

test('a sentence cut to length keeps its predicate, its list and what its last word waits for', () => {
  assert.equal(trimClause('The experiment, called the Kentucky Reentry Probe Experiment (KREPE-3), is the third in a series of low-cost, high-impact missions that use the final moments of the cargo spacecraft’s lifespan to gather valuable data.', 22), null);
  assert.equal(trimClause('The experiment is a collaboration among the University of Kentucky, the state of Kentucky, NASA’s Established Program to Stimulate Competitive Research (EPSCoR), several NASA centers, and other federal and commercial partners.', 22), null);
  assert.doesNotMatch(String(trimClause('A source familiar with the plans said a forthcoming consultation was likely to propose cutting a “significant proportion” of editorial staff, possibly before Christmas.', 22)), /possibly\.$/);
  assert.doesNotMatch(String(trimClause('With the growth version, interest is added each year and paid when the bond matures, while with the income version, interest is paid monthly.', 22)), /income version\.$/);
  assert.equal(trimClause('For all their different reactions, researchers agreed that simply understanding what OpenAI had released could take years, let alone figuring out where the mathematicians themselves fit in the field now changing around them.', 22), null);
});

test('no sentence without its own main clause or subject goes on air', () => {
  for (const t of ['Nobel prizewinning biochemist who succeeded against the odds in mapping the ribosome.', 'A man who lives in a log cabin.', 'For anyone who might not be up on the latest from the Toy Story franchise.', 'Documented how former students had gathered evidence.', 'The experiment, called the Kentucky Reentry Probe Experiment (KREPE-3).']) assert.ok(isFragment(t), t);
  for (const t of ['Investors who fear a slowdown sold shares on Friday.', 'The man who found the coins said he was stunned.', 'The company, which makes chips, reported record sales.', 'The rover, known as Perseverance, landed in 2021.']) assert.ok(!isFragment(t), t);
  assert.equal(splitClauses('Police reopened the case after the BBC World Service revealed accusations of sexual abuse against him, and documented how former students had gathered evidence.', 14), null, 'never "Documented how…"');
  assert.equal(splitClauses('In the process, they exploited software flaws, accessed databases without paying fees, and even submitted a false murder tip to the Philadelphia police.', 14), null, 'never "Even submitted…"');
});

test('one event, one report: a named storm, an outlet\'s update and a quoted name tie reports together', () => {
  assert.ok(sameStorm({ title: 'Isaias becomes major category three storm before landfall' }, { title: 'Hurricane Isaias strengthens as it heads towards land' }));
  assert.ok(sameStorm({ title: 'Isaias weakens after making landfall in US Gulf Coast as hurricane' }, { title: 'Isaias strengthens to become first Atlantic hurricane' }, new Set(['Isaias'])));
  assert.ok(!sameStorm({ title: 'Storm Amy batters Scotland' }, { title: 'Amy Winehouse biopic opens' }));
  const kw = (t) => new Set(t.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const a = { source: 'BBC Science', title: 'Hurricane Isaias strengthens as it heads towards land', summary: 'Isaias, the first hurricane in the Atlantic this hurricane season has been continuing to strengthen and is now a category three major hurricane.' };
  const b = { source: 'BBC Science', title: 'Hurricane Isaias strengthens to a major category three storm', summary: 'Isaias, the first hurricane of the Atlantic season has been continuing to strengthen and is now a category three major hurricane.' };
  a.kw = kw(a.title);
  b.kw = kw(b.title);
  assert.ok(sameSummary(a, b));
  assert.ok(!sameSummary(a, { ...b, source: 'NPR' }), 'an update is one outlet\'s');
  assert.ok(sameQuotedName({ title: 'India’s ‘Cockroach’ leaders detained; New Delhi in lockdown' }, { title: "India detains 'cockroach' leaders ahead of election protest", summary: 'The head of the satirical Cockroach Janta Party was held.' }));
  assert.ok(!sameQuotedName({ title: '‘Stain on the country’: Trump criticises Norway' }, { title: 'Norway is a stain' }), 'a quotation is no name');
  // and the desk keeps them apart from the next story it picks
  const desk = new NewsDesk({ log: { info() {}, warn() {}, error() {} } });
  assert.ok(desk.sameStory(a, b));
});

test('boards, cards and summaries: a range is one figure, a year is no label, a programme page is no story', () => {
  assert.deepEqual(knownPoints(['German media group Axel Springer said to be planning between 50 and 100 editorial redundancies.']), []);
  assert.deepEqual(extractFigures('the creative team powered the project with 30 2012-era Mac Minis.'), []);
  assert.ok(notNews({ title: 'Money Box', link: 'https://www.bbc.co.uk/sounds/play/m0032qlk?at_medium=RSS', summary: 'What age will you get your state pension?' }));
  assert.ok(notNews({ title: 'Tech Now', link: 'https://www.bbc.co.uk/iplayer/episode/m0032yng', summary: 'Shiona McCallum visits Cairngorms National Park.' }));
  assert.ok(notNews({ title: 'Here are the top AI agents that can live in your text messages', summary: 'Rather than downloading another app…' }));
  assert.ok(!notNews({ title: 'Boots sold to Canadian family', link: 'https://www.bbc.co.uk/news/articles/c1', summary: 'The chain has a new owner.' }));
  assert.equal(dropPageFurniture('As part of the agency’s Inspiration Tour flyover, NASA Administrator Jared Isaacman will pilot one of three F-5 fighter jets to kick off the New York Jets vs. Cleveland Browns game on Sunday, Oct. 11. NASA team members will engage with fans at the agency’s Experience Zone, located at the [&#8230;]'), 'As part of the agency’s Inspiration Tour flyover, NASA Administrator Jared Isaacman will pilot one of three F-5 fighter jets to kick off the New York Jets vs. Cleveland Browns game on Sunday, Oct. 11.', 'never "11." alone');
  assert.ok(isTranscriptLine('NASA’s solicitation can be found here.'));
  assert.ok(!LABEL_TITLE.test("'Tropical jungle' of wallabies, porcupines and parrots must move after neighbours complain"), 'a quotation inside the headline\'s sentence is no label');
  assert.ok(LABEL_TITLE.test('‘Stain on country’: Trump criticises Norway'));
});
