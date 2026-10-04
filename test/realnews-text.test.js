import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sentencesIn } from '../server/facts.js';
import { dropPageFurniture, dropTranscriptLines, isTranscriptLine } from '../server/transcript.js';
import { extractArticle } from '../server/article.js';
import { trimClause, shortHeadline } from '../server/writer.js';

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
