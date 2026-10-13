import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { nextFrom, normalizeNext, normalizeShare, normalizeWho, parseShare, peopleWithRoles, saysPerson, saysShare, saysWhen, shareFrom, whoFrom } from '../server/boards.js';
import { normalizeBulletin } from '../server/writer.js';
import { sentencesIn } from '../server/facts.js';
import { loadChannel } from '../server/channel.js';

// SHARE, WHAT HAPPENS NEXT and WHO'S WHO: three boards a story earns from its own text (sentences from the 12 Oct
// live desk), and the checks every writer's boards pass.

describe('SHARE', () => {
  test('a part of a whole, as a statement of its own (real news, 12 Oct)', () => {
    assert.deepEqual(shareFrom(['A year into a ceasefire, Israel restricts access to 65 percent of Gaza and crams 2.1 million people into the rest.']), {
      value: '65%',
      fraction: 0.65,
      lead: 'ISRAEL RESTRICTS ACCESS TO',
      label: 'OF GAZA',
    });
    assert.deepEqual(shareFrom(['Although the adoption of electric vans has begun to increase, about 95% of light commercial vehicles are still powered by diesel.']), {
      value: '95%',
      fraction: 0.95,
      lead: '',
      label: 'OF LIGHT COMMERCIAL VEHICLES ARE STILL POWERED BY DIESEL',
      qualifier: 'ABOUT',
    });
    assert.equal(shareFrom(['Six in 10 electric cars made in France are exported.']).value, '6 IN 10');
    assert.equal(shareFrom(['Two-thirds of Ukrainians back the plan.']).value, 'TWO-THIRDS');
    assert.equal(shareFrom(['Only 26% of new electric cars are made in France.']).qualifier, 'ONLY', 'a lone adverb is the qualifier');
  });

  test('never a movement, a label that hangs, a pronoun, a relative clause or a quote', () => {
    assert.equal(shareFrom(['Sales rose by 12 percent of the forecast.']), null, 'a movement');
    assert.equal(shareFrom(['About 96 percent of the population identifies as.']), null, 'a verb waiting for its complement');
    assert.equal(shareFrom(['Just 27% of those eligible have signed up.']), null, '"those" leans on another line');
    assert.equal(shareFrom(['The rare form, which affects just 0.19% of dogs.']), null, 'a relative clause is no lead');
    assert.equal(shareFrom(['The battery makes up 40% of the total cost of 30,000 dollars.']), null, 'no second figure');
    assert.equal(shareFrom(['“Half of them never came back,” she said.']), null, 'never inside a quote');
    assert.equal(shareFrom(['Inside the mini factory, about 40 percent of the total cost']), null, 'no verb anywhere');
    assert.equal(shareFrom(['The factory accounts for 40 percent of the total cost']).lead, 'THE FACTORY ACCOUNTS FOR', 'the verb in the lead');
  });

  test('the validator keeps the source\'s share and words, and the presenter must say it', () => {
    const src = 'A year into a ceasefire, Israel restricts access to 65 percent of Gaza. One in seven properties are at risk of flooding.';
    assert.deepEqual(normalizeShare({ value: '65%', lead: 'Israel restricts access to', label: 'of Gaza' }, src), { value: '65%', fraction: 0.65, lead: 'ISRAEL RESTRICTS ACCESS TO', label: 'OF GAZA' });
    assert.equal(normalizeShare({ value: 'one in seven', lead: '', label: 'properties are at risk of flooding' }, src).value, '1 IN 7');
    assert.equal(normalizeShare({ value: '70%', lead: 'Israel restricts access to', label: 'of Gaza' }, src), null, 'a share the source does not write');
    assert.equal(normalizeShare({ value: '65%', lead: 'Israel has annexed', label: 'of Gaza' }, src), null, 'words the source does not write');
    assert.equal(parseShare('120%'), null);
    assert.equal(saysShare('Israel restricts access to 65 percent of Gaza.', '65%'), true);
    assert.equal(saysShare('Prices rose 65 percent.', '65%'), false);
    assert.equal(saysShare('Six in 10 cars are exported.', '6 IN 10'), true);
  });
});

describe('WHAT HAPPENS NEXT', () => {
  const MON = Date.parse('2026-10-12T08:00:00Z');
  const at = { published: MON, now: Date.parse('2026-10-12T13:00:00Z') };
  test('a dated step ahead, its date from the day the story was published (real news, 12 Oct)', () => {
    assert.deepEqual(nextFrom(['The matter is due to be discussed in the assembly on Monday, according to BBC Business.'], at), { when: 'MONDAY', date: '2026-10-12', what: 'The matter is due to be discussed in the assembly' });
    assert.deepEqual(nextFrom(['The Budget will take place on 28 October.'], at), { when: '28 OCTOBER', date: '2026-10-28', what: 'The Budget will take place' });
    assert.deepEqual(nextFrom(['The Apple TV is expected to start shipping on October 30.'], at), { when: '30 OCTOBER', date: '2026-10-30', what: 'The Apple TV is expected to start shipping' });
    assert.deepEqual(nextFrom(['Pope Leo is expected to be admitted to hospital on Tuesday.'], at), { when: 'TUESDAY', date: '2026-10-13', what: 'Pope Leo is expected to be admitted to hospital' });
    assert.deepEqual(nextFrom(['Talks will resume next week.'], at), { when: 'NEXT WEEK', date: null, what: 'Talks will resume' });
  });

  test('never a day that has passed, a court date, a guess, a pronoun or a stale "next week"', () => {
    assert.equal(nextFrom(['The matter is due to be discussed in the assembly on Monday.'], { published: MON, now: Date.parse('2026-10-13T09:00:00Z') }), null, 'Monday has passed');
    assert.equal(nextFrom(['John Smith will appear in court on Tuesday.'], at), null);
    assert.equal(nextFrom(['The strike could begin on Friday.'], at), null);
    assert.equal(nextFrom(['He will travel to Paris on Monday.'], at), null);
    assert.equal(nextFrom(['Talks will resume next week.'], { published: MON, now: MON + 4 * 86_400_000 }), null);
    assert.equal(nextFrom(['“We will vote on Thursday,” she said.'], at), null);
    assert.equal(nextFrom(['The talks, which began in March, will resume on Thursday.'], at), null, 'the subject sits in a clause of its own');
  });

  test('the validator keeps only a date the source writes for a step ahead, and the presenter must say it', () => {
    const src = 'Campaigners accused the minister. The matter is due to be discussed in the assembly on Monday.';
    const sents = sentencesIn(src);
    assert.deepEqual(normalizeNext({ when: 'MONDAY', what: 'The matter is due to be discussed in the assembly' }, src, sents, at), { when: 'MONDAY', date: '2026-10-12', what: 'The matter is due to be discussed in the assembly' });
    assert.equal(normalizeNext({ when: 'TUESDAY', what: 'The matter is due to be discussed in the assembly' }, src, sents, at), null, 'a date the source does not give');
    assert.equal(normalizeNext({ when: 'MONDAY', what: 'The assembly will scrap the bill' }, src, sents, at), null, 'words the source does not write');
    assert.equal(saysWhen('The Budget will take place on 28 October.', '28 OCTOBER'), true);
    assert.equal(saysWhen('The Budget lands on October 28th.', '28 OCTOBER'), true);
    assert.equal(saysWhen('The Budget lands on 8 October.', '28 OCTOBER'), false);
    assert.equal(saysWhen('Talks resume next week.', 'NEXT WEEK'), true);
  });
});

describe("WHO'S WHO", () => {
  test('people in public life with the roles the story gives them (real news, 12 Oct)', () => {
    const text =
      'Interior Minister Laurent Nuñez visited the school. Japan’s Deputy Defense Minister Takashi Koyari said two missiles were detected. ' +
      '"So that is why." Vatican spokesperson Matteo Bruni said the operation went well. Pope Leo XIV will rest. ' +
      'Supporters of former Prime Minister Imran Khan’s party gathered. It came as U.S. President Donald Trump and Chinese President Xi Jinping met. ' +
      'Satya Nadella, the chief executive of Microsoft, spoke. The talks included JD Vance, the US vice-president.';
    assert.deepEqual(peopleWithRoles(text), [
      { name: 'Laurent Nuñez', role: 'INTERIOR MINISTER' },
      { name: 'Takashi Koyari', role: 'DEPUTY DEFENSE MINISTER' },
      { name: 'Matteo Bruni', role: 'VATICAN SPOKESPERSON' },
      { name: 'Leo XIV', role: 'POPE' },
      { name: 'Imran Khan', role: 'FORMER PRIME MINISTER' },
      { name: 'Donald Trump', role: 'U.S. PRESIDENT' },
      { name: 'Xi Jinping', role: 'CHINESE PRESIDENT' },
      { name: 'Satya Nadella', role: 'CHIEF EXECUTIVE OF MICROSOFT' },
      { name: 'JD Vance', role: 'US VICE-PRESIDENT' },
    ]);
  });

  test('never a role cut short, a vague one, a place named after someone, or a private person', () => {
    assert.deepEqual(peopleWithRoles('Bouches-du-Rhône departmental council president Martine Vassal told reporters.'), [], 'a regional president is no PRESIDENT');
    assert.deepEqual(peopleWithRoles('Flights left King Khalid International Airport.'), []);
    assert.deepEqual(peopleWithRoles('Party founder Abhijeet Dipke emerged.'), [], 'which party?');
    assert.deepEqual(peopleWithRoles('Its executive director Fatih Birol wrote to governments.'), [], 'director of what?');
    assert.deepEqual(peopleWithRoles('Ratna Singh, the movement’s legal director, spoke.'), [], 'leans on a noun said before');
    assert.deepEqual(peopleWithRoles('Jane Smith, a mother of three, said she was afraid.'), []);
    assert.deepEqual(peopleWithRoles('The late President John Magufuli was honoured.'), []);
    assert.equal(whoFrom('Interior Minister Laurent Nuñez visited.'), null, 'one person is no board');
  });

  test('the validator takes the source\'s role, and the presenter must name each person', () => {
    const src = 'Interior Minister Laurent Nuñez visited the school. Aubagne mayor Gérard Gazay spoke. Prime Minister Sébastien Lecornu called for calm.';
    assert.deepEqual(normalizeWho([{ name: 'Laurent Nuñez', role: 'France’s police chief' }, { name: 'Sébastien Lecornu', role: 'PM' }, { name: 'Emmanuel Macron', role: 'PRESIDENT' }], src), [
      { name: 'Laurent Nuñez', role: 'INTERIOR MINISTER' },
      { name: 'Sébastien Lecornu', role: 'PRIME MINISTER' },
    ]);
    assert.equal(normalizeWho([{ name: 'Laurent Nuñez', role: 'INTERIOR MINISTER' }], src), null);
    assert.equal(saysPerson('Mr Nuñez said security would be reviewed.', 'Laurent Nuñez'), true);
    assert.equal(saysPerson('The minister said security would be reviewed.', 'Laurent Nuñez'), false);
  });
});

describe('the three boards through the writer', () => {
  const CHANNEL = loadChannel();
  const WN = { id: 'world-now', ...CHANNEL.programs['world-now'] };
  const DUO = { A: { id: 'paco', ...CHANNEL.presenters.paco }, B: { id: 'lola', ...CHANNEL.presenters.lola } };
  const SUMMARY =
    'Interior Minister Laurent Nuñez visited the school in Aubagne on Monday. Prime Minister Sébastien Lecornu called for calm. ' +
    'About 65 percent of teachers in the region have asked for more security. The matter is due to be discussed in parliament on 28 October.';
  const STORY = { id: 'f1', title: 'Teachers shot at French school', summary: SUMMARY, source: 'Ledger Line', category: 'world', image: null, published: Date.now() };
  const boards = {
    share: { value: '65 percent', lead: '', label: 'of teachers in the region have asked for more security' },
    next: { when: '28 OCTOBER', what: 'The matter is due to be discussed in parliament' },
    who: [{ name: 'Laurent Nuñez', role: 'INTERIOR MINISTER' }, { name: 'Sébastien Lecornu', role: 'PRIME MINISTER' }],
  };
  const run = (text) =>
    normalizeBulletin(
      { title: 'T', segments: [{ type: 'story', storyId: 'f1', anchor: 'A', emotion: 'neutral', headline: STORY.title, text, shot: 'wide', ...boards }] },
      [STORY],
      { program: WN, presenters: DUO, maxStories: 14 }
    ).segments.find((s) => s.storyId === 'f1');

  test('each airs when the presenter says its share, its date and its people', () => {
    const seg = run('Interior Minister Laurent Nuñez visited the school in Aubagne on Monday, and Prime Minister Sébastien Lecornu called for calm. About 65 percent of teachers in the region have asked for more security. The matter is due to be discussed in parliament on 28 October.');
    assert.equal(seg.share?.value, '65%');
    assert.equal(seg.share?.qualifier, 'ABOUT');
    assert.deepEqual(seg.next, { when: '28 OCTOBER', date: seg.next?.date, what: 'The matter is due to be discussed in parliament' });
    assert.deepEqual(seg.who?.map((p) => p.name), ['Laurent Nuñez', 'Sébastien Lecornu']);
  });

  test('none airs when the presenter does not say it', () => {
    const seg = run('Interior Minister Laurent Nuñez visited the school in Aubagne on Monday. Teachers in the region have asked for more security.');
    assert.equal(seg.share, undefined);
    assert.equal(seg.next, undefined);
    assert.equal(seg.who, undefined, 'only one of the two people is named');
  });
});
