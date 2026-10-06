// Same event or not? (editorial-2 fix round 1, critics' tables.) The desk
// clusters reports, counts outlets, keeps one report per event in a
// programme, covers the others with it and lends pictures across them. Two
// different events that share a headline template must stay apart (a wrong
// picture on air is worse than none, and one must not hide the other), while
// two outlets' reports of one event still cluster and lend.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NewsDesk, namesOf, placesAgree } from '../server/news.js';
import { lookupPlace } from '../server/gazetteer.js';

const silent = { info() {}, warn() {}, error() {} };
const desk = () => new NewsDesk({ log: silent, fetchImpl: async () => { throw new Error('no network'); } });
const S = (title, summary = '') => ({ title, summary });

const APART = [
  ['Man charged over London bridge attack', 'Man charged over London fraud scheme'],
  ['Storm hits Florida coast, thousands lose power', 'Storm hits Texas coast, thousands lose power'],
  ['Two killed in Paris shooting near station', 'Two arrested after Paris robbery at station'],
  ['Wildfire forces thousands to flee in California', 'Wildfire forces thousands to flee in Oregon'],
  ['Earthquake of magnitude 6.1 strikes Japan', 'Earthquake of magnitude 6.1 strikes Chile'],
  ['Prime Minister announces new tax plan', 'Prime Minister rejects new tax plan'],
  ['Bank of England holds interest rates at 4%', 'Bank of England raises interest rates to 4.25%'],
  ['Tesla recalls 200,000 cars over software fault', 'Tesla opens new factory with 200,000 car capacity'],
  ['Teachers strike in Chicago enters second week', 'Teachers strike in Los Angeles enters second week'],
  ['Apple unveils new iPhone with faster chip', 'Apple unveils new iPad with faster chip'],
  ['Boeing plane makes emergency landing after engine fire', 'Boeing plane makes emergency landing after window blows out'],
].map(([a, b]) => [S(a), S(b)]);

// The country is only in the summary: the headline alone would wrongly match another country's report.
const SUMMARY_PLACE = [
  [S("Norway's central bank raises rates unexpectedly"), S('Central bank raises interest rates unexpectedly', "Brazil's central bank has raised its main interest rate unexpectedly. Economists had expected no change.")],
  [S('Tokyo stocks close at a record high'), S('Stocks close at a record high', 'Shares in London closed at a record high on Friday, led by banks.')],
  [S('Rail strike halts most trains across Germany'), S('Rail strike halts most trains', 'Most trains across Britain were cancelled as rail workers walked out.')],
  [S('Wildfire near Marseille forces thousands to evacuate'), S('Wildfire forces thousands to evacuate', 'A wildfire in southern California has forced thousands of people from their homes.')],
];

const SAME = [
  [S('Hurricane Elena makes landfall in Mexico'), S('Hurricane Elena cuts power to 1.2 million homes', 'Hurricane Elena has cut electricity to about 1.2 million homes on Mexico’s Yucatán peninsula.')],
  [S('Hurricane Elena cuts power to 1.2 million homes in Yucatan'), S("Hurricane Elena makes landfall on Mexico's Yucatan coast")],
  [S('Norway raises interest rates in a surprise move'), S('Norway’s central bank raises rates unexpectedly')],
  [S('Marseille wildfire: thousands evacuate from hill villages'), S('Wildfire near Marseille forces thousands to evacuate')],
  [S('Iceland volcano erupts again on the Reykjanes peninsula'), S('Iceland volcano: lava fountains light up the Reykjanes sky')],
  [S('Earthquake strikes northern Japan'), S('Powerful earthquake hits northern Japan')],
  // a report and an explainer of one election (the BBC, 4 Oct): the same two people in the same country
  [S("Lula or Bolsonaro? Some Brazilian voters say they don't want either", "Brazil's election enters its final day of campaigning as Lula and Flávio Bolsonaro make their last pitches."), S('Lula and Bolsonaro face off in Brazil presidential race', 'Twelve candidates are on the ballot, but the race is centred on two rivals: President Luiz Inacio Lula da Silva and Flavio Bolsonaro.')],
  [S('Polls close in Brazil as Lula and Flávio Bolsonaro remain neck and neck', 'If no candidate gets more than 50% of the vote, the election will go to a run-off on 25 October.'), S("What to know about Brazil's election as Lula and Flávio Bolsonaro face off", 'Polls suggest the election will be a closely run contest between the left-wing incumbent and his right-wing rival.')],
];

describe('same event', () => {
  test('template pairs about different events neither cluster nor lend', () => {
    const d = desk();
    for (const [a, b] of APART) {
      assert.equal(d.sameStory(a, b), false, `cluster: ${a.title} // ${b.title}`);
      assert.equal(d.samePictureEvent(a, b), false, `lend: ${a.title} // ${b.title}`);
    }
  });

  test('a place named only in the summary keeps two countries apart', () => {
    const d = desk();
    for (const [a, b] of SUMMARY_PLACE) {
      assert.equal(d.sameStory(a, b), false, `cluster: ${a.title} // ${b.title}`);
      assert.equal(d.samePictureEvent(a, b), false, `lend: ${a.title} // ${b.title}`);
    }
  });

  test("two outlets' reports of one event cluster and lend (a storm's name, the same place and subject)", () => {
    const d = desk();
    for (const [a, b] of SAME) {
      assert.equal(d.sameStory(a, b), true, `cluster: ${a.title} // ${b.title}`);
      assert.equal(d.samePictureEvent(a, b), true, `lend: ${a.title} // ${b.title}`);
    }
  });

  test('a report that names no place never borrows on wording alone', () => {
    const d = desk();
    assert.equal(d.samePictureEvent(S('Storm closes ports along the coast'), S('Storm closes ports along the northern coast')), false);
    assert.equal(d.samePictureEvent(S('Storm closes ports along the coast of Portugal'), S('Storm closes ports along the northern coast of Portugal')), true);
  });

  test('covering an aired story covers its own event only', () => {
    const d = desk();
    const add = (id, source, title, summary = '') => d.stories.set(id, { id, title, summary, link: `https://e.test/${id}`, source, category: 'business', weight: 1, published: Date.now(), image: null });
    add('no', 'Ledger Line', "Norway's central bank raises rates unexpectedly", 'Norway’s central bank has unexpectedly raised its main interest rate.');
    add('no2', 'Bitport Herald', 'Norway raises interest rates in a surprise move', 'Norway’s central bank has raised its main rate to 4.75 percent.');
    add('br', 'Pixelburg Post', 'Central bank raises interest rates unexpectedly', "Brazil's central bank has raised its main interest rate unexpectedly.");
    d.markCovered(['no']);
    assert.ok(d.covered.has('no2'), 'the other outlet’s report of the same decision is covered with it');
    assert.ok(!d.covered.has('br'), 'Brazil’s decision is another story: it can still air');
  });

  // (fix r2) Not a mirror of the last critic's table: for every city, headlines that share the place, a role
  // word ("mayor", "police", "judge") and a template, and differ in what happened, neither cluster nor lend.
  const CITIES = ['London', 'Paris', 'Tokyo', 'Berlin', 'Madrid', 'Sydney', 'Lagos', 'Toronto', 'Mumbai', 'Cairo', 'Rome', 'Chicago'];
  const TEMPLATES = [
    (p) => ['library', 'bridge', 'hospital', 'school', 'museum'].map((x) => `${p} mayor opens new ${x}`),
    (p) => ['warehouse', 'hotel', 'school', 'factory'].map((x) => `Fire at ${p} ${x} injures two`),
    (p) => ['robbery', 'stabbing', 'fraud', 'arson', 'protest'].map((x) => `${p} police arrest man over ${x}`),
    (p) => ['housing', 'transport', 'parking', 'budget'].map((x) => `${p} council approves new ${x} plan`),
    (p) => [`${p} court jails former bank chief for fraud`, `${p} court frees bank chief in fraud case`],
    (p) => [`${p} stocks rise on bank earnings`, `${p} stocks fall on bank earnings`],
    (p) => ['stadium', 'airport', 'park', 'metro line'].map((x) => `${p} unveils plans for new ${x}`),
    (p) => [`${p} judge blocks new congestion toll`, `${p} judge sentences crypto founder`, `${p} judge rejects airport appeal`],
    (p) => [`Earthquake drill held at ${p} schools`, `Earthquake strikes ${p}`],
    (p) => [`Storm hits ${p}, thousands lose power`, `${p} braces as second storm forms`],
  ];

  test('generated: per city, headlines that differ in what happened neither cluster nor lend', () => {
    const d = desk();
    const bad = [];
    for (const city of CITIES)
      for (const make of TEMPLATES) {
        const list = make(city).map((t) => S(t));
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            if (d.sameStory(list[i], list[j])) bad.push(`cluster: ${list[i].title} // ${list[j].title}`);
            if (d.samePictureEvent(list[i], list[j])) bad.push(`lend: ${list[i].title} // ${list[j].title}`);
          }
      }
    assert.deepEqual(bad, []);
  });

  test('generated: two reports of one physical event in one city cluster and lend', () => {
    const d = desk();
    const PAIRS = [
      (p) => [`Earthquake strikes ${p}`, `Powerful earthquake hits ${p}, buildings damaged`],
      (p) => [`Wildfire near ${p} forces thousands to evacuate`, `${p} wildfire: firefighters battle flames overnight`],
      (p) => [`Floods swamp streets in ${p}`, `${p} floods: thousands moved to shelters`],
      (p) => [`Storm batters ${p} with record winds`, `${p} storm cuts power to 200,000 homes`],
    ];
    const missed = [];
    for (const city of CITIES)
      for (const make of PAIRS) {
        const [a, b] = make(city).map((t) => S(t));
        if (!d.sameStory(a, b) || !d.samePictureEvent(a, b)) missed.push(`${a.title} // ${b.title}`);
      }
    assert.deepEqual(missed, []);
  });

  test('(fix r2) one specific subject in the same city clusters, but only lends with most of the story in common', () => {
    const d = desk();
    const lisbon = [S('Lisbon opens a new riverside tram line'), S("Thousands ride Lisbon's new tram on its first day")];
    assert.equal(d.sameStory(...lisbon), true, 'one event: covering one covers the other');
    const fires = [S('Fire at London warehouse injures firefighters'), S('London flat fire kills two residents')];
    assert.equal(d.sameStory(...fires), false);
    assert.equal(d.samePictureEvent(...fires), false, 'a warehouse fire picture never illustrates a flat fire');
    const turin = [S('Turin car plant closure threatens 2,400 jobs'), S('Carmaker to close Turin plant, putting 2,400 jobs at risk')];
    assert.equal(d.samePictureEvent(...turin), true);
  });

  test('helpers: names past the first word, places that agree', () => {
    assert.deepEqual([...namesOf('Hurricane Elena cuts power in Yucatán')], ['elena', 'yucatan']);
    assert.deepEqual([...namesOf('Storm Hits Florida Coast, Thousands Lose Power')], [], 'Title Case says nothing');
    assert.equal(placesAgree(lookupPlace('Mexico'), lookupPlace('Yucatán')), true, 'a country holds its regions');
    assert.equal(placesAgree(lookupPlace('Florida'), lookupPlace('Texas')), false, 'two states');
    assert.equal(placesAgree(lookupPlace('Chicago'), lookupPlace('Los Angeles')), false, 'two cities');
    assert.equal(placesAgree(lookupPlace('Norway'), null), null, 'unknown');
  });
});
