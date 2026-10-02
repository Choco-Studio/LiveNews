import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { claimGrounded, extractFigures, groundQuote, isGrave, numbersGrounded, numbersIn, quotationsGrounded, quotesIn, wordsGrounded } from '../server/facts.js';

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
    assert.equal(extractFigures('Brent crude dropped 2 percent to 71 dollars a barrel.').find((f) => f.value === '2%').fact, 'BRENT CRUDE DOWN 2%');
    assert.equal(extractFigures('The index has gained 21 percent since January.')[0].fact, 'INDEX UP 21%', 'a percentage names what moved');
    assert.equal(extractFigures('A survey found 62 percent of traders use solar.')[0].fact, '62% OF TRADERS');
    assert.equal(extractFigures('The cost of shipping a container has fallen by 20 percent.')[0].fact, 'COST DOWN 20%');
    assert.equal(extractFigures('Electric models made up 17 percent of new cars.')[0].fact, '17% OF NEW CARS', '"made up" is not a rise');
    assert.deepEqual(extractFigures('It is 20 percent.'), [], 'a bare percentage with nothing to say is dropped');
    assert.equal(extractFigures('A deal worth about 12 billion dollars.')[0].fact, 'ABOUT 12 BILLION DOLLARS');
    assert.equal(extractFigures('More than 160 million passengers used the network.')[0].fact, 'MORE THAN 160 MILLION PASSENGERS');
  });

  test('a magnitude is named before its figure, and labels stop at the verb', () => {
    assert.equal(extractFigures('A magnitude 5.8 earthquake shook northern Chile.')[0].fact, 'MAGNITUDE 5.8');
    assert.equal(extractFigures('Some 300 workers took part.')[0].fact, 'ABOUT 300 WORKERS');
  });

  test('skips bare years, dates, clock times, ordinals and bare small numbers', () => {
    assert.deepEqual(extractFigures('By 2030, on 12 March at 10:30, for the 3rd time, 4 said.'), []);
  });

  test('every figure it extracts is grounded in its own source', () => {
    const src = 'A magnitude 5.8 earthquake shook the north. Curators say the larger boat is 43 metres long and was rebuilt from 1,200 pieces.';
    for (const f of extractFigures(src)) assert.ok(claimGrounded(f.fact, src), f.fact);
  });
});

describe('extractFigures: qualifiers and ages', () => {
  test('keeps "about", "more than" and "up to" with the figure, on the card and in speech', () => {
    const [f] = extractFigures('It will cost about 1,500 dollars when it launches.');
    assert.deepEqual(f, { value: '1,500', label: 'DOLLARS', fact: 'ABOUT 1,500 DOLLARS', said: 'about 1,500 dollars', score: 5.5, qualifier: 'ABOUT' });
    // a unit alone says nothing on a card: the thing measured comes first ("WAVES UP TO 3 METRES")
    assert.equal(extractFigures('Waves of up to 3 metres hit the coast.')[0].fact, 'WAVES UP TO 3 METRES');
    assert.equal(extractFigures('The quake struck at a depth of 30 km.')[0].fact, 'DEPTH 30 KM');
    assert.equal(extractFigures('Winds of 130 mph battered the coast.')[0].fact, 'WINDS 130 MPH');
    assert.equal(extractFigures('It supplies more than 1 million people.')[0].fact, 'MORE THAN 1 MILLION PEOPLE');
  });

  test('marks ages ("7,000 years old", "3,000-year-old") so they are never the number of the day', () => {
    assert.equal(extractFigures('Footprints about 7,000 years old were found.')[0].age, true);
    assert.equal(extractFigures('A 3,000-year-old temple was found.')[0].age, true);
    assert.equal(extractFigures('It will carry 40,000 passengers a day.')[0].age, undefined);
  });

  test('labels stop at time words: "6 million passengers last month" is "6 MILLION PASSENGERS"', () => {
    assert.equal(extractFigures('Airports handled a record 6 million passengers last month.')[0].fact, '6 MILLION PASSENGERS');
  });
});

describe('numbersGrounded: scale, percent, currency, counted thing and words', () => {
  const W = { words: true };
  test('the scale must match: 12 million is not 12 billion', () => {
    assert.equal(numbersGrounded('a 12 million dollar deal', 'worth about 12 billion dollars', W), false);
    assert.equal(numbersGrounded('$12 MILLION DEAL', 'A deal worth about 12 billion dollars', W), false);
    assert.equal(numbersGrounded('$12 BILLION DEAL', 'A deal worth about 12 billion dollars', W), true);
    assert.equal(numbersGrounded('1 million trees', 'Volunteers planted one million trees.', W), true, 'number words in the source count too');
  });

  test('a percentage needs a percentage, a currency the same currency', () => {
    assert.equal(numbersGrounded('up 40%', 'about 40 people attended', W), false);
    assert.equal(numbersGrounded('40 people', 'prices rose 40 percent', W), false);
    assert.equal(numbersGrounded('£12 million', 'a $12 million fund', W), false);
    assert.equal(numbersGrounded('€300m', 'It cost 300 million euros.', W), true);
  });

  test('the thing counted must match when the source counts something else', () => {
    assert.equal(numbersGrounded('120 people died', 'Officials opened 120 relief camps.', W), false);
    assert.equal(numbersGrounded('120 relief camps', 'Officials opened 120 relief camps.', W), true);
    assert.equal(numbersGrounded('Three people were injured.', 'Fire leaves three injured.', W), true, 'the source counts no other thing');
    assert.equal(numbersGrounded('at 3.5 percent, Ledger Line reports', 'kept rates at 3.5 percent.', W), true, 'the counted noun stops at the comma');
  });

  test('numbers in words are claims too; "one" alone is not (it is usually a pronoun)', () => {
    assert.equal(numbersGrounded('Seven people were hurt.', 'Two people were hurt.', W), false);
    assert.equal(numbersGrounded('Two people were hurt.', 'Two people were hurt.', W), true);
    assert.equal(numbersGrounded('Hundreds of people were killed.', 'Rain flooded streets.', W), false);
    assert.equal(numbersGrounded('One of the cubs is female.', 'Two cubs were born.', W), true);
    assert.equal(numbersGrounded('Seven people were hurt.', 'Two people were hurt.'), true, 'words are only checked when asked (labels)');
  });
});

describe('quotationsGrounded and the speaker of a quote', () => {
  const src = 'In Kerala, rain flooded streets. “We are working day and night,” the chief minister said.';
  test('a quotation in spoken text must be in the source word for word', () => {
    assert.equal(quotationsGrounded('“We are working day and night,” the chief minister said.', src), true);
    assert.equal(quotationsGrounded('“We will rebuild every home by Christmas,” the chief minister said.', src), false);
    assert.equal(quotationsGrounded('He said "yes" and left.', src), true, 'one or two words in quotes are not a quotation');
  });

  test('"by" is kept only when it is the speaker the source gives for that quotation', () => {
    assert.equal(groundQuote({ text: 'We are working day and night', by: 'the chief minister' }, src).by, 'the chief minister');
    assert.equal(groundQuote({ text: 'We are working day and night', by: 'Kerala' }, src).by, null, 'a place the summary names is not the speaker');
  });
});

describe('isGrave', () => {
  test('spots grave news by whole words only', () => {
    assert.equal(isGrave('Fire leaves three injured'), true);
    assert.equal(isGrave('Thousands evacuated as floods rise'), true);
    assert.equal(isGrave('Studies show the audience loved the fireworks'), false);
  });
});

describe('isGrave: disaster and emergency vocabulary (editorial-2)', () => {
  test('natural disasters, accidents and emergencies are grave', () => {
    for (const t of ['Hurricane Elena makes landfall', 'Typhoon hits the coast', 'Cyclone batters islands', 'Tornado flattens homes', 'Tsunami warning lifted', 'Landslide blocks road', 'Drought ruins harvest', 'Heatwave grips Spain', 'Bridge collapses', 'Train derails near Lyon', 'Ferry capsizes off Crete', 'Boat sank overnight', 'Two drowned at sea', 'Cholera spreads in camps', 'A life-threatening situation', 'Storm surge floods the seafront', 'Spain issues a red alert as temperatures hit 44 degrees', 'Extreme heat closes schools', 'State of emergency declared']) {
      assert.equal(isGrave(t), true, t);
    }
  });
  test('light stories with near-miss words stay light', () => {
    for (const t of ['Tidal power station starts sending electricity', 'Fireworks light up the harbour', 'Coffee prices reach a ten-year high', 'Bank announces red-alert pricing', 'Startup raises funds']) assert.equal(isGrave(t), false, t);
  });
});
