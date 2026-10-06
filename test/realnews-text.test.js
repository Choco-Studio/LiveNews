import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sentencesIn } from '../server/facts.js';
import { dropPageFurniture, dropTranscriptLines, isTranscriptLine } from '../server/transcript.js';
import { extractArticle } from '../server/article.js';
import { trimClause, shortHeadline, headlineNames } from '../server/writer.js';

// What the first real-news run of WORLD NOW round 2 aired wrong (4 Oct, the mock writer on the live feeds), each
// case taken from the outlet's own text.

describe('sentences', () => {
  test('never split inside a figure, after a title or a month, or after initials (unless a sentence starts again)', () => {
    assert.deepEqual(sentencesIn('Japanese police arrested a U.S. Marine on Okinawa, officials said Sunday. The suspect is 22.'), ['Japanese police arrested a U.S. Marine on Okinawa, officials said Sunday.', 'The suspect is 22.']);
    assert.deepEqual(sentencesIn('Talks were held in the U.S. The next round is in May.'), ['Talks were held in the U.S.', 'The next round is in May.']);
    assert.deepEqual(sentencesIn('More than 158.7 million Brazilians can vote. Dr. Smith said 3.5% was low.'), ['More than 158.7 million Brazilians can vote.', 'Dr. Smith said 3.5% was low.']);
    assert.deepEqual(sentencesIn('Gen. Ali spoke in St. Louis on Sept. 3. It rained.'), ['Gen. Ali spoke in St. Louis on Sept. 3.', 'It rained.']);
  });

  test('a figure survives the desk’s clean-up: "more than 158.7 million" never becomes "7 million" (the BBC)', () => {
    const t = "According to Brazil's Superior Electoral Court (TSE), more than 158.7 million Brazilians, including one million people abroad, are eligible to vote in the election.";
    assert.equal(dropPageFurniture(dropTranscriptLines(t)), t);
    const u = 'In Israel, however, Bolsonaro won 74.40% of the valid votes. He also won 71.59% of the valid votes in Japan.';
    assert.equal(dropPageFurniture(u), u);
  });
});

describe('a sentence cut to length keeps its sense, or is not aired', () => {
  const cut = (s, max = 14) => trimClause(s, max);
  test('the cuts that break a phrase are refused', () => {
    assert.equal(cut('After casting his ballot, 80-year-old left-wing President Luiz Inácio Lula da Silva warned that the choice was between democracy and "barbarism".'), null, 'a pair is one phrase');
    assert.equal(cut('Education Minister Edouard Geffray announced the precautionary measures on Sunday as part of a bid for a “partial, progressive return to lessons”.'), null, 'never inside a quotation');
    assert.equal(cut('Nearly 160 million voters will also pick lawmakers, senators and governors in an election that will determine whether Latin America follows a regional swing.'), null, 'never inside a list');
    assert.equal(cut("The Tigray People's Liberation Front (TPLF), which has been running the region, said its decision to relocate was made because of concerns about risks to civilians."), null, 'a light passive needs its complement');
    assert.equal(cut('The United States removed its B-1 bombers from a UK air base one week after the arrests of five men near the base.'), null, 'a span of time keeps its "after"');
    assert.equal(cut('It also remains unclear how a citizen of Oman, an Arab country that has no diplomatic relations with Israel, was able to board the flight in Dubai.', 16), null, 'a "how" clause keeps its verb');
    assert.equal(cut("Lula is challenged by 11 candidates, although BBC Brazil's poll aggregator suggests that candidates other than Lula and Bolsonaro will get only about 10% of the vote.", 20), 'Lula is challenged by 11 candidates.', 'a "that" clause keeps its verb; a pair of names stays whole');
    assert.equal(cut('With counting nearly concluded, Serb nationalist Zeljka Cvijanovic, Bosniak moderate leftist Denis Becirovic and Croat Zeljko Komsic appeared to have won.'), null, 'an opening phrase is not a clause; a list stays whole');
    assert.equal(cut("Nationalist parties dominated races as citizens chose officials across many tiers of government, including members of the country's multiethnic presidency.", 16), 'Nationalist parties dominated races as citizens chose officials across many tiers of government.', 'never an adjective without its noun');
  });

  test('the clean cuts still come', () => {
    assert.equal(cut('Airports in Cancún and Mérida have closed, and hotels have moved guests to inner rooms to wait out the storm.'), 'Airports in Cancún and Mérida have closed.');
    assert.equal(cut('The hurricane made landfall near Cancún on Sunday morning, the first major storm of the season and the strongest in years.'), 'The hurricane made landfall near Cancún on Sunday morning.');
    assert.equal(cut('Officials are investigating how the fire started, the ministry said in a statement on Sunday evening.', 16), 'Officials are investigating how the fire started.');
  });
});

describe('headlines shortened for the strap and the intro', () => {
  test('never through a name nor a particle; a clause boundary first', () => {
    const t = "What to know about Brazil's election as Lula and Flávio Bolsonaro face off";
    assert.equal(shortHeadline(t, 45), "What to know about Brazil's election");
    assert.ok(!/ face$/.test(shortHeadline(t, 45, { spoken: true })), 'the particle stays with its verb');
    assert.equal(shortHeadline('Polls close in Brazil as Lula and Flávio Bolsonaro remain neck and neck', 45), 'Polls close in Brazil');
  });
});

describe('what never reaches a script', () => {
  test('an outlet’s promo for its own interview, never a report that merely says "explains"', () => {
    assert.ok(isTranscriptLine('France24 International affairs commentator Douglas Herbert shares further insights.'));
    assert.ok(isTranscriptLine("France 24's Gavin Lee speaks to Brazil analyst Henrique Tavares Furtado about how Flavio Bolsonaro is pledging to reshape the country."));
    assert.ok(isTranscriptLine("Americas Quarterly editor in chief Brian Winter explains how Brazil's presidential election could impact trade."));
    assert.ok(!isTranscriptLine('The minister explains the new rules to parliament.'));
  });

  test('an outlet’s standing disclaimer is page furniture', () => {
    const html = `<html><body><article><p>Brazil is a global supplier of oil, soybeans and critical minerals, and its election could reshape its trade with the United States and China.</p><p>Voters chose between two candidates on Sunday in a race seen as close by most pollsters across the country.</p><p>NPR does not offer or accept money for coverage or interviews.</p></article></body></html>`;
    const a = extractArticle(html);
    assert.ok(a && !/accept money/.test(a.text), a?.text);
  });
});

test('an article cut to length ends on a real sentence end, never on initials ("crime related to U.S.")', () => {
  const html = '<article><p>Japanese police arrested a U.S. Marine in the alleged robbery and murder of a woman on Okinawa, officials said on Sunday afternoon.</p><p>Okinawans have long complained about noise, pollution and crime related to U.S. bases on the island, and the case has revived calls for change. Officials met on Monday.</p></article>';
  const a = extractArticle(html, { max: 230 });
  assert.ok(a && !/related to U\.S\.$/.test(a.text) && !/U\.S\.$/.test(a.text.trim()), a?.text);
});

test('a story is placed where it happened, not in the country that acted (the map once pinned Kansas for RAF Fairford)', async () => {
  const { locate } = await import('../server/gazetteer.js');
  const at = (h, s = '') => locate(h, s)?.place;
  assert.equal(at('US withdraws all B-1 bombers from British military base RAF Fairford', "The Pentagon confirmed that all US B-1 bombers deployed to Britain's RAF Fairford had returned home."), 'UK');
  assert.equal(at('US Marine arrested for alleged murder of woman in Okinawa, Japan'), 'OKINAWA, JAPAN');
  assert.equal(at('China sends warships near Taiwan'), 'TAIWAN');
  assert.equal(at('US Fed raises interest rates'), 'USA', 'no other place: the actor’s country stays');
  assert.equal(at('Kenya switches on its largest solar farm near Nairobi'), 'NAIROBI, KENYA');
});

test('a shortened headline never ends on a verb that lost what it takes ("…to Islamabad demanding")', () => {
  assert.equal(shortHeadline('Imran Khan’s party launches march to Islamabad demanding his release', 45), 'Imran Khan’s party launches march to Islamabad');
  assert.equal(shortHeadline('Fire guts historic building', 45), 'Fire guts historic building', 'an -ing noun may end it');
});

// What the first real-news run of TECH BYTES aired wrong (4 Oct, the mock writer on the live tech feeds).
describe('TECH BYTES on real news', () => {
  test('shopping, reviews, lists, columns and newsletters are not news', async () => {
    const { notNews } = await import('../server/news.js');
    const drop = (title) => notNews({ title });
    for (const t of [
      'The best early October Prime Day deals happening now',
      'The AirPods Pro 3 are a fantastic deal at $179',
      'The MacBook Air M5 is $200 off for the first time in months',
      'The iPad Mini is slightly cheaper again during Prime Day',
      'This toolless modular lever-action wallet is the coolest I’ve stuck to my phone',
      'Prick’s theatrical industrial punk is perfect for spooky season',
      'All the AI agents that can live in your text messages',
      'All hail electrification. But let’s talk about the hard part.',
      'TechCrunch Mobility: Reining in robotaxis',
      'Pixel 10 Pro review: the best camera on a phone',
      'Can ‘super intelligence’ and a non-binding safety pact solve AI’s image problem?',
    ]) assert.ok(drop(t), t);
    for (const t of [
      'Lawmakers reach deal on budget',
      'Saudi Arabia signs biggest arms deal in history',
      'Markets face a great deal of uncertainty',
      'EU and Mercosur sign trade deal after 25 years',
      "'I'm not resigning,' says PM",
      '“My country will not surrender,” Zelensky says',
      'Government launches review of NHS waiting lists',
      'Solar is now cheaper than coal in most of the world',
      'Federal judge calls Flock ‘indiscriminate mass surveillance’',
      'Jack Dorsey’s Bitchat disappears from app stores in India after government order',
      '“Where is my son?” mother asks after ferry sinks',
    ]) assert.ok(!drop(t), t);
  });

  test('a sensitive subject is grave: no "And finally", no joke after it', async () => {
    const { isGrave } = await import('../server/facts.js');
    assert.ok(isGrave('NJ’s former Lt Gov is using AI to say he’s innocent of sexual harassment'));
    assert.ok(isGrave('The report found he had harassed a staffer.'));
    assert.ok(!isGrave('An AI couldn’t beat humans at StarCraft, so it decided to cheat'));
  });

  test('the feed’s cut sentence, a host’s talk and an editor’s query never reach a script', () => {
    assert.equal(dropPageFurniture('He took a particularly odd tactic during an interview on NJ PBS. […] He told the host he had checked the report.'), 'He took a particularly odd tactic during an interview on NJ PBS. He told the host he had checked the report.');
    assert.equal(dropPageFurniture('Caldwell is making the media rounds. He said the report […] was false. He told the host he had checked it.'), 'Caldwell is making the media rounds. He told the host he had checked it.');
    assert.equal(dropPageFurniture('A rainbow arcs over the hills of Wales in a picture taken at dawn last spring by a local photographer. Supernumerary Rainbows over […]'), 'A rainbow arcs over the hills of Wales in a picture taken at dawn last spring by a local photographer.');
    assert.equal(dropPageFurniture('Supernumerary Rainbows over […]'), 'Supernumerary Rainbows over […]', 'a lone fragment is all there is');
    const tc = 'President Donald Trump hosted the biggest names in AI this week. We were talking about this last week, because this is something [Trump has] been hinting at. But now it is signed into an executive order.';
    assert.equal(dropPageFurniture(tc), 'President Donald Trump hosted the biggest names in AI this week. But now it is signed into an executive order.');
    assert.equal(dropPageFurniture('Officials counted dozens (hundreds?) of incidents last year. The city wants new rules.'), 'Officials counted dozens of incidents last year. The city wants new rules.');
  });

  test('an outlet’s podcast, newsletter and award promos are not the story', () => {
    assert.ok(isTranscriptLine('Kirsten Korosec: Welcome back to the show, everyone.'));
    assert.ok(isTranscriptLine('If you’re a TechCrunch All Access subscriber, you can read the full story.'));
    assert.ok(isTranscriptLine('In this week’s episode, we dig into the robotaxi era.'));
    assert.ok(isTranscriptLine('You can vote for us in the podcast awards and help us win.'));
    assert.ok(!isTranscriptLine('Google said the bug bounty program was paused as of October 1.'));
    assert.ok(!isTranscriptLine('Voters can vote early in most states.'));
  });

  test('an attribution keeps what it attributes; a list item is no sentence', async () => {
    const { splitClauses } = await import('../server/writer.js');
    assert.equal(trimClause('On Friday, the bot was facing off against Pluto, but according to Kotaku, it couldn’t quite get an edge over its rival.', 12), null);
    assert.equal(trimClause('He said heavy rain could overwhelm drainage systems and penetrate walls, causing damp and erosion, while repeated cycles of wetting and drying could crack the stone.', 22), 'He said heavy rain could overwhelm drainage systems and penetrate walls, causing damp and erosion.', 'never inside a pair of nouns ("wetting and drying")');
    assert.equal(trimClause('He said heavy rain could overwhelm drainage systems and penetrate walls, causing damp and erosion, while repeated cycles of wetting, drying, freezing and thawing could harm stonework.', 22), 'He said heavy rain could overwhelm drainage systems and penetrate walls, causing damp and erosion.', 'never inside a longer list');
    const flock = 'A federal judge ruled that a sheriff’s deputy violated a woman’s Fourth Amendment rights when using Flock to search for her license plate without a warrant.';
    assert.equal(trimClause(flock, 20, 6, { keep: headlineNames('Federal judge calls Flock ‘indiscriminate mass surveillance’', flock) }), null, 'never the name the story is about');
    assert.deepEqual(headlineNames('Google froze its open source bug bounty program due to a ‘significant rise’ in AI submissions', 'Blaming a rise in AI submissions, Google has paused its program.'), ['Google']);
    assert.deepEqual(headlineNames('Milt Windler, NASA flight director who helped save Apollo 13, dies at 94'), ['Windler', 'NASA', 'Apollo']);
    assert.equal(splitClauses('There have been numerous incidents of robotaxis impeding traffic, driving into crime scenes, and interfering with first responders.', 12), null);
    assert.deepEqual(splitClauses('Washington announced new chip export controls on Monday, and Beijing responded with sanctions on Tuesday.', 12), ['Washington announced new chip export controls on Monday.', 'Beijing responded with sanctions on Tuesday.']);
  });
});

test('a strap is cut cleanly or goes up whole on its two lines, never as a scrap (TECH BYTES, 4 Oct)', () => {
  const s = (t) => shortHeadline(t, 45);
  const whole = (t, why) => assert.equal(s(t), t, why);
  whole('Federal judge calls Flock ‘indiscriminate mass surveillance’', 'never inside a quotation, never "calls Flock" alone');
  whole('Can ‘super intelligence’ and a non-binding safety pact solve AI’s image problem?', 'a question is asked whole');
  whole('Spotify billionaire’s body scan startup has come to America', 'never a label without its verb');
  assert.equal(s('Milt Windler, NASA flight director who helped save Apollo 13, dies at 94'), 'NASA flight director Milt Windler dies at 94', 'the appositive’s title before the name; an age is no cut figure');
  assert.equal(s('Google froze its open source bug bounty program due to a ‘significant rise’ in AI submissions'), 'Google froze open source bug bounty program');
  assert.ok(!/just delivered$/.test(s('Forgotten 30-year forest experiment just delivered a surprising result')));
  assert.equal(s('Jack Dorsey’s Bitchat disappears from app stores in India after government order'), 'Jack Dorsey’s Bitchat disappears from app stores', 'never "Bitchat disappears" alone');
  assert.equal(shortHeadline('Imran Khan’s party launches march to Islamabad demanding his release', 45), 'Imran Khan’s party launches march to Islamabad', 'a clean cut still comes');
});

test('an author’s bio card is not the story (TechCrunch, 4 Oct)', () => {
  const story = '<p>As promised, President Donald Trump has announced the formation of a new task force, which he said will be led by his national intelligence director.</p><p>The task force will reportedly have 120 days to create a report on the risks and opportunities presented by AI.</p>';
  for (const bio of [
    '<p>Anthony Ha is TechCrunch&#8217;s weekend editor. Previously, he worked as a tech reporter at Adweek, a senior editor at VentureBeat, and vice president of content at a VC firm.</p>',
    '<p>Jay Peters is a senior reporter at The Verge covering technology, gaming, and more.</p>',
    '<p>You can contact or verify outreach from Anthony by emailing anthony.ha@techcrunch.com.</p>',
    '<p>Get 50% off a second pass The Disrupt experience is meant to be shared. Get your pass and bring a colleague, partner, or peer at 50% off.</p>',
  ]) {
    const a = extractArticle(`<article>${story}${bio}</article>`);
    assert.ok(a && /120 days/.test(a.text) && !/Previously|senior reporter|verify outreach|pass/.test(a.text), a?.text);
  }
  const news = '<p>Rob Nelson is the host of the station’s nightly news programme and asked the questions.</p>';
  assert.ok(/Rob Nelson/.test(extractArticle(`<article>${story}${news}</article>`)?.text || ''), 'a person named in the story stays');
});

test('a podcast’s transcript is not read as an article; quoted words are no host talk', () => {
  const intro = '<p>President Donald Trump hosted many of the biggest names in artificial intelligence this week, in part to announce a new name for it.</p>';
  const talk = '<p>I’m wondering if any of you watched the press conference that happened afterwards, which there have been many memes about.</p><p>Sean O’Kane: How much time do you have? First off, sure, they had dinner, and then a luncheon days later.</p>';
  assert.equal(extractArticle(`<article>${intro}${talk}</article>`), null);
  const quotes = '<p>“I think we will win this case,” the company’s lawyer told reporters outside the court on Monday afternoon.</p><p>“I guess we will see,” the judge said before adjourning the hearing until next week in the capital.</p>';
  assert.ok(extractArticle(`<article>${intro}${quotes}</article>`), 'quotations are the story');
});

test('the fallback writer never speaks in the outlet’s voice, and an answer stands on its own', async () => {
  const { ownVoice, answerable } = await import('../server/providers/mock.js');
  assert.ok(ownVoice('We don’t know a ton about the Fitbit Edge, but it appears to be a successor to the Charge line.'));
  assert.ok(ownVoice('I think this is the best phone of the year.'));
  assert.ok(!ownVoice('“We will appeal,” the company said.'), 'a quotation is someone’s words');
  assert.ok(!ownVoice('The US trade office said tariffs would rise.'));
  const info = { s: { title: 'The new Fitbit Edge leaks', summary: 'The Fitbit Edge appears to be a successor to the midrange Charge line.' } };
  assert.ok(!answerable('The Air costs $99.99 and the Watch starts at $399.99, so the Edge would fall in the middle.', info), 'names the story never introduced');
  assert.ok(!answerable('So it resorted to a tactic that is becoming common: it broke the rules.', info), 'follows on from a sentence not said');
  assert.ok(!answerable('He then served as a flight director for all three crewed missions.', info));
  assert.ok(answerable('The Edge will sell for about $150 when it launches next spring.', info));
});

test('a caption never pages on an abbreviation’s dot ("The now-former Lt. / governor", TECH BYTES 5 Oct)', async () => {
  const { paginate } = await import('../public/js/graphics/captions.js');
  for (const per of [1, 2]) {
    const pages = paginate('The now-former Lt. governor has been making the media rounds trying to clear his name.', undefined, per).flatMap((p) => p.lines);
    assert.ok(!pages.some((l) => /Lt\.$/.test(l)), JSON.stringify(pages));
  }
  const { abbreviationDot } = await import('../public/js/audio/sentences.js');
  assert.ok(abbreviationDot('Lt.') && abbreviationDot('U.S.') && abbreviationDot('Dr.') && abbreviationDot('J.'));
  assert.ok(!abbreviationDot('home.') && !abbreviationDot('Lt'));
});

test('the number of the day is judged on what the story is, never a word deep in its article; a lost feature takes its label', async () => {
  const { normalizeBulletin } = await import('../server/writer.js');
  const { loadChannel } = await import('../server/channel.js');
  const CH = loadChannel();
  const TB = { id: 'tech-bytes', ...CH.programs['tech-bytes'] };
  const P2 = { A: { id: 'max', ...CH.presenters.max }, B: { id: 'ada', ...CH.presenters.ada } };
  const s = (id, title, summary, body = '') => ({ id, title, summary, body, source: 'ScienceDaily', category: 'science', image: null });
  const stories = [
    s('l1', 'Chipmaker unveils a laptop processor', 'A chipmaker has unveiled a processor that runs for 20 hours on a charge.'),
    s('n1', 'Protective enzyme could help stop fatty liver', 'Scientists have identified an enzyme that may slow fatty liver disease, which affects an estimated 100 million Americans.', 'Unchecked, the condition can lead to scarring and liver cancer in some patients.'),
    s('g1', 'Fire kills three at battery plant', 'A fire at a battery plant has killed three workers, officials said, as 100 people were evacuated.'),
  ];
  const run = (id, text) =>
    normalizeBulletin(
      { title: 'T', segments: [{ type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Hello.' }, { type: 'story', storyId: 'l1', anchor: 'A', emotion: 'neutral', text: 'A chipmaker has unveiled a processor that runs for 20 hours on a charge.' }, { type: 'story', storyId: id, anchor: 'B', emotion: 'neutral', feature: 'number', numbers: [{ value: '100 million', label: 'Americans' }], text }, { type: 'outro', anchor: 'A', emotion: 'neutral', text: "That's TECH BYTES." }] },
      stories,
      { program: TB, presenters: P2, maxStories: 13, maxChats: 7, features: ['number'] }
    ).segments.find((x) => x.storyId === id);
  const kept = run('n1', 'Our number of the day: 100 million. Scientists have identified an enzyme that may slow fatty liver disease, which affects an estimated 100 million Americans.');
  assert.equal(kept.feature, 'number', '"liver cancer" in the article does not make the story grave');
  const lost = run('g1', 'Our number of the day: 100 million. A fire at a battery plant has killed three workers, officials said, as 100 people were evacuated.');
  assert.notEqual(lost.feature, 'number');
  assert.ok(!/number of the day/i.test(lost.text), lost.text);
});

test('a headline opening a story is told as a sentence: present perfect, the outlet’s article; a plain shape only', async () => {
  const { spokenTitle } = await import('../server/providers/mock.js');
  const I = (summary, body = '') => ({ s: { summary, body } });
  assert.equal(spokenTitle('The new Fitbit Edge leaks', I('')), 'The new Fitbit Edge has leaked');
  assert.equal(spokenTitle('Milt Windler, NASA flight director who helped save Apollo 13, dies at 94', I('', 'Windler died on Thursday.')), 'Milt Windler, NASA flight director who helped save Apollo 13, has died at 94');
  assert.equal(spokenTitle('Federal judge calls Flock ‘indiscriminate mass surveillance’', I('A federal judge ruled that a deputy violated her rights.')), 'A federal judge has called Flock ‘indiscriminate mass surveillance’');
  assert.equal(spokenTitle('OpenAI safety employee resigns, claiming the company’s ‘culture is broken’', I('An OpenAI safety employee has resigned.')), 'An OpenAI safety employee has resigned, claiming the company’s ‘culture is broken’');
  assert.equal(spokenTitle('Kenya opens its largest solar farm', I('Kenya has opened a solar farm.')), 'Kenya has opened its largest solar farm');
  for (const t of ['Amazon responds to data center backlash, says it no longer uses NDAs', 'Scientists find water on a distant planet', 'Google froze its bug bounty program', 'Can AI fix it?', 'Federal judge calls Flock a threat']) assert.equal(spokenTitle(t, I('Someone said something.')), t, t);
});

test('COSMOS on real news (5 Oct): a launch, deep time, a mission blog, a profile and NASA’s picture of the day', async () => {
  const { isGrave } = await import('../server/facts.js');
  const { notNews } = await import('../server/news.js');
  assert.ok(!isGrave('Students blast off to US for Nasa robotics competition.'));
  assert.ok(!isGrave('Zircon crystals show the Ames impact occurred about 370 million years ago, not part of the mysterious Ordovician bombardment.'));
  assert.ok(isGrave('Israeli bombardment of the city continued overnight, killing 12 people.'), 'a bombardment today is grave');
  for (const t of ['Curiosity Blog, Sols 5022-5028: Cashing in at Cache Creek', 'Mapping the Gaps in NASA’s Return to the Moon, featuring Richard Spolzino', 'APOD: 2026 October 4 – Supernumerary Rainbows']) assert.ok(notNews({ title: t }), t);
  assert.ok(!notNews({ title: 'Blogger arrested in Vietnam' }));
  assert.equal(trimClause('It also lies at the southern end of the 1860s Gold Rush Trail, where miners and prospectors flocked to this part of British Columbia in search of riches.', 16), 'It also lies at the southern end of the 1860s Gold Rush Trail.', 'never "where miners" cut from its verb');
  assert.ok(isTranscriptLine('See the link here for more details on naming conventions on Mars.'));
});
