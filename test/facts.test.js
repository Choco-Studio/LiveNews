import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { claimGrounded, extractFigures, groundQuote, isGrave, numbersGrounded, numbersIn, quotesIn, wordsGrounded } from '../server/facts.js';

describe('numbersIn', () => {
  test('reads figures as news copy writes them, with scale words', () => {
    const n = numbersIn('Some 40,000 people, $2.5bn, 7.1 magnitude, 30 percent and 1.2 million homes.');
    assert.deepEqual(n.map((x) => x.value), [40000, 2.5, 7.1, 30, 1.2]);
    assert.deepEqual(n.map((x) => x.scaled), [40000, 2.5e9, 7.1, 30, 1.2e6]);
    assert.ok(n[3].percent && n[1].currency);
  });

  test('ignores digits glued to words (model names, COP30) and the minutes of a clock time', () => {
    assert.deepEqual(numbersIn('COP30 starts at 10:30 with the A320').map((x) => x.value), [10]);
  });
});

describe('numbersGrounded', () => {
  const source = 'Some 40,000 people were evacuated. A $2 billion deal. Three people were hurt. Prices rose 2.5 percent.';

  test('every number must be stated in the source, in digits, with a scale or as a word', () => {
    assert.equal(numbersGrounded('40,000 EVACUATED', source), true);
    assert.equal(numbersGrounded('$2BN DEAL', source), true);
    assert.equal(numbersGrounded('3 HURT', source), true);
    assert.equal(numbersGrounded('2.5%', source), true);
    assert.equal(numbersGrounded('50,000 EVACUATED', source), false);
    assert.equal(numbersGrounded('40,000 evacuated and 12 missing', source), false, 'one invented figure is enough to fail');
  });

  test('a text without numbers is grounded', () => {
    assert.equal(numbersGrounded('No figures here', source), true);
  });
});

describe('wordsGrounded and claimGrounded', () => {
  test('share of content words found in the source, with crude stemming', () => {
    assert.equal(wordsGrounded('PASSENGERS A DAY', 'it will carry 40,000 passengers a day'), 1);
    assert.equal(wordsGrounded('EVACUATION', 'people were evacuated'), 1);
    assert.equal(wordsGrounded('DEAD', 'people were evacuated'), 0);
  });

  test('"DOWN" and "UP" are grounded by the verbs of the copy', () => {
    assert.equal(wordsGrounded('DOWN 2%', 'Brent crude dropped 2 percent'), 1);
    assert.equal(wordsGrounded('UP 4%', 'Retail sales rose 4 percent'), 1);
    assert.equal(wordsGrounded('UP 2%', 'Brent crude dropped 2 percent'), 0);
  });

  test('a claim needs its numbers and at least half of its words', () => {
    assert.equal(claimGrounded('40,000 EVACUATED', 'Some 40,000 people were evacuated.'), true);
    assert.equal(claimGrounded('40,000 DEAD', 'Some 40,000 people were evacuated.'), false);
  });
});

describe('quotesIn and groundQuote', () => {
  const src =
    'The line opened today. “This line will change how people move around the old town,” the mayor said. ' +
    'Another said: "We are ready for the summer season," said Ana Silva. The minister said: “Water is a right, not a privilege for the few.”';

  test('finds literal quotations of three words or more, with the speaker when the sentence names one', () => {
    assert.deepEqual(
      quotesIn(src).map((q) => [q.text, q.by]),
      [
        ['This line will change how people move around the old town', 'the mayor'],
        ['We are ready for the summer season', 'Ana Silva'],
        ['Water is a right, not a privilege for the few.', 'The minister'],
      ]
    );
    assert.deepEqual(quotesIn('He said "no comment" and left.'), [], 'two words are not a quotation worth a card');
  });

  test('a quote for the screen must be (part of) a quotation in the source', () => {
    assert.deepEqual(groundQuote({ text: 'This line will change how people move', by: 'the mayor' }, src), { text: 'This line will change how people move', by: 'the mayor' });
    assert.equal(groundQuote({ text: 'This line will change everything', by: 'the mayor' }, src), null, 'paraphrase');
    assert.equal(groundQuote({ text: 'The line opened today' }, src), null, 'not inside quotation marks');
    assert.equal(groundQuote({ text: 'Water is a right' }, src)?.by, null, 'no speaker given');
    assert.equal(groundQuote({ text: 'Water is a right', by: 'the prime minister' }, src).by, null, 'a speaker the source does not name is dropped');
    assert.equal(groundQuote('“We are ready for the summer season”', src).text, 'We are ready for the summer season', 'a plain string, quote marks trimmed');
    assert.equal(groundQuote({ text: 'Ready' }, src), null, 'too short');
  });
});

describe('extractFigures', () => {
  test('takes the figure and the words that follow it in the source, best first', () => {
    const f = extractFigures('The city says the 9 kilometre route will carry 40,000 passengers a day and cut traffic.');
    assert.deepEqual(f[0], { value: '40,000', label: 'PASSENGERS A DAY', fact: '40,000 PASSENGERS A DAY', said: '40,000 passengers a day', score: 4 });
    assert.equal(f[1].fact, '9 KILOMETRE ROUTE');
  });

  test('percentages keep their direction when the copy gives one; money and scales are read as written', () => {
    assert.equal(extractFigures('Brent crude dropped 2 percent to 71 dollars a barrel.')[0].fact, 'DOWN 2%');
    assert.equal(extractFigures('A deal worth about 12 billion dollars.')[0].fact, '12 BILLION DOLLARS');
    assert.equal(extractFigures('More than 160 million passengers used the network.')[0].fact, '160 MILLION PASSENGERS');
  });

  test('a magnitude is named before its figure, and labels stop at the verb', () => {
    assert.equal(extractFigures('A magnitude 5.8 earthquake shook northern Chile.')[0].fact, 'MAGNITUDE 5.8');
    assert.equal(extractFigures('Some 300 workers took part.')[0].fact, '300 WORKERS');
  });

  test('skips bare years, dates, clock times, ordinals and bare small numbers', () => {
    assert.deepEqual(extractFigures('By 2030, on 12 March at 10:30, for the 3rd time, 4 said.'), []);
  });

  test('every figure it extracts is grounded in its own source', () => {
    const src = 'A magnitude 5.8 earthquake shook the north. Curators say the larger boat is 43 metres long and was rebuilt from 1,200 pieces.';
    for (const f of extractFigures(src)) assert.ok(claimGrounded(f.fact, src), f.fact);
  });
});

describe('isGrave', () => {
  test('spots grave news by whole words only', () => {
    assert.equal(isGrave('Fire leaves three injured'), true);
    assert.equal(isGrave('Thousands evacuated as floods rise'), true);
    assert.equal(isGrave('Studies show the audience loved the fireworks'), false);
  });
});
