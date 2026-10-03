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

  test('helpers: names past the first word, places that agree', () => {
    assert.deepEqual([...namesOf('Hurricane Elena cuts power in Yucatán')], ['elena', 'yucatan']);
    assert.deepEqual([...namesOf('Storm Hits Florida Coast, Thousands Lose Power')], [], 'Title Case says nothing');
    assert.equal(placesAgree(lookupPlace('Mexico'), lookupPlace('Yucatán')), true, 'a country holds its regions');
    assert.equal(placesAgree(lookupPlace('Florida'), lookupPlace('Texas')), false, 'two states');
    assert.equal(placesAgree(lookupPlace('Chicago'), lookupPlace('Los Angeles')), false, 'two cities');
    assert.equal(placesAgree(lookupPlace('Norway'), null), null, 'unknown');
  });
});
