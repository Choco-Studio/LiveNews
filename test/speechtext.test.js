import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEXICON, PAUSES, PERSONAS, addPronunciations, estimateDuration, normalizeForSpeech, planProsody, planSpeech,
  remapCues, speakable, spellLetters, toOriginal, toSpoken,
} from '../public/js/voice/speechtext.js';
import { parseCues } from '../public/js/cues.js';

// public/js/voice/speechtext.js rewrites news copy into what a presenter says
// and plans the phrasing. It has no DOM, so it is tested here directly.

const us = (t) => speakable(t, { lang: 'en-US' });
const gb = (t) => speakable(t, { lang: 'en-GB' });
const es = (t) => speakable(t, { lang: 'es-ES' });

// Each row: [input, expected spoken text]. Every row is its own test so a
// failure names the exact case.
function table(name, fn, rows) {
  describe(name, () => {
    for (const [input, expected] of rows) test(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => assert.equal(fn(input), expected));
  });
}

table('numbers (American English)', us, [
  ['Brent crude dropped 2 percent to 71 dollars a barrel.', 'Brent crude dropped two percent to seventy-one dollars a barrel.'],
  ['At least 40,000 people fled.', 'At least forty thousand people fled.'],
  ['A 7.1 magnitude quake struck.', 'A seven point one magnitude quake struck.'],
  ['The vote passed 52 to 48.', 'The vote passed fifty-two to forty-eight.'],
  ['Expect 3-4 storms.', 'Expect three to four storms.'],
  ['It costs 1,099 a seat, up from 120.', 'It costs one thousand ninety-nine a seat, up from one hundred twenty.'],
  ['The index fell -2.5 points.', 'The index fell minus two point five points.'],
  ['A 1,234,567 strong crowd.', 'A one million two hundred thirty-four thousand five hundred sixty-seven strong crowd.'],
  ['Agent 007 returns.', 'Agent zero zero seven returns.'],
  ['The planet is 120 light years away.', 'The planet is one hundred twenty light years away.'],
]);

table('numbers (British English)', gb, [
  ['It rose 120 points.', 'It rose one hundred and twenty points.'],
  ['In 2005 there were 2,005 of them.', 'In two thousand and five there were two thousand and five of them.'],
  ['Inflation fell to 0.5 per cent.', 'Inflation fell to nought point five per cent.'],
  ['MPs voted 312-290 to back the bill.', "M-P's voted three hundred and twelve to two hundred and ninety to back the bill."],
]);

table('money', us, [
  ['The IMF lent $2bn.', 'The I-M-F lent two billion dollars.'],
  ['A deal worth €1.5-2bn.', 'A deal worth one point five to two billion euros.'],
  ['It raised US$1.7bn.', 'It raised one point seven billion US dollars.'],
  ['Shoppers spent £1.2m.', 'Shoppers spent one point two million pounds.'],
  ['A coffee is now £3.50, or 50p more.', 'A coffee is now three pounds fifty, or fifty pence more.'],
  ['Prices start at $799 and $0.99 apps.', 'Prices start at seven hundred ninety-nine dollars and ninety-nine cents apps.'],
  ['It costs $1 today.', 'It costs one dollar today.'],
  ['Tokyo raised ¥100bn and India ₹5,000.', 'Tokyo raised one hundred billion yen and India five thousand rupees.'],
  ['The fund holds 5 USD and CHF 20.', 'The fund holds five US dollars and twenty Swiss francs.'],
  ['A $5tn economy.', 'A five trillion dollars economy.'],
]);

table('percentages', us, [
  ['Sales rose 18%.', 'Sales rose eighteen percent.'],
  ['Rates are 5.25%-5.5%, down from 6%.', 'Rates are five point two five to five point five percent, down from six percent.'],
  ['Unemployment hit 10-15% in places.', 'Unemployment hit ten to fifteen percent in places.'],
  ['Shares fell -3% after hours.', 'Shares fell minus three percent after hours.'],
  ['Prices rose by 2.3pc, or 15bps.', 'Prices rose by two point three percent, or fifteen basis points.'],
]);

table('dates, times, years and ordinals (American)', us, [
  ['It opens on 2 October.', 'It opens on October second.'],
  ['It opens on Oct. 2nd, 2026.', 'It opens on October second, twenty twenty-six.'],
  ['The talks start at 14:30 local time.', 'The talks start at fourteen thirty local time.'],
  ['Doors open at 9am and close at 9:05 p.m. sharp.', 'Doors open at nine A-M and close at nine oh five P-M sharp.'],
  ['The fastest growth since 1999.', 'The fastest growth since nineteen ninety-nine.'],
  ['He was born in 1905.', 'He was born in nineteen oh five.'],
  ['In 2026 the firm hired 2026 workers.', 'In twenty twenty-six the firm hired two thousand twenty-six workers.'],
  ['About 1500 people and 2000 staff.', 'About one thousand five hundred people and two thousand staff.'],
  ['Music from the 1990s and the 80s.', 'Music from the nineteen nineties and the eighties.'],
  ['She is the 1st woman and the 101st person.', 'She is the first woman and the one hundred first person.'],
  ['Sales again in 2026-27.', 'Sales again in twenty twenty-six to twenty-seven.'],
  ['A plan for October 2026.', 'A plan for October twenty twenty-six.'],
]);

table('dates and times (British)', gb, [
  ['The IMF lent $2bn on 2 October 2026.', 'The I-M-F lent two billion dollars on the second of October, twenty twenty-six.'],
  ['He was born on October 3rd, 1905.', 'He was born on October the third, nineteen oh five.'],
  ['The 2026/27 season starts on 14/08/2026 at 12:00.', "The twenty twenty-six twenty-seven season starts on the fourteenth of August, twenty twenty-six at twelve o'clock."],
  ['Strikes at 0600 GMT and 2:15pm.', 'Strikes at oh six hundred GMT and two fifteen P-M.'],
]);

table('units', us, [
  ['Temperatures hit 45°C.', 'Temperatures hit forty-five degrees Celsius.'],
  ['Winds reached 120 km/h (75 mph).', 'Winds reached one hundred twenty kilometres per hour, seventy-five miles per hour.'],
  ['The 100m sprint and a 10-km race.', 'The one hundred metres sprint and a ten-kilometre race.'],
  ['5m people watched.', 'Five million people watched.'],
  ['It weighs 1 kg and stores 128GB.', 'It weighs one kilogram and stores one hundred twenty-eight gigabytes.'],
  ['A 500 MW plant using 3x less water.', 'A five hundred megawatts plant using three times less water.'],
  ['Mapped 50,000 sq km of sea floor.', 'Mapped fifty thousand square kilometres of sea floor.'],
  ['The temperature fell to -5°C overnight.', 'The temperature fell to minus five degrees Celsius overnight.'],
  ['A 10k bonus and a 10k run.', 'A ten thousand bonus and a ten K run.'],
]);

table('codes, fractions, scores and symbols', us, [
  ['The G7 met at COP29 after the F-35 deal.', 'The G seven met at Cop twenty-nine after the F thirty-five deal.'],
  ['Flight MH370 and the 4K screen.', 'Flight M-H three seventy and the four K screen.'],
  ['UNICEF said COVID-19 cases rose.', 'Unicef said Covid nineteen cases rose.'],
  ['Turnout fell by 1/3 and 2 1/2 points; it is 24/7 news.', 'Turnout fell by one third and two and a half points; it is twenty-four seven news.'],
  ['A ½ point and ¾ of voters.', 'A one half point and three quarters of voters.'],
  ['Arsenal won 3-1; it was a 2-0 win.', 'Arsenal won three one; it was a two nothing win.'],
  ['Q&A with Tom & Jerry, #1 in the charts.', 'Q and A with Tom and Jerry, number one in the charts.'],
  ['Disney+ and the 50+ group.', 'Disney plus and the fifty plus group.'],
  ['Israel/Gaza talks and/or a $5/month fee.', 'Israel or Gaza talks and or a five dollars a month fee.'],
]);

test('British football scores say nil and all', () => {
  assert.equal(gb('Spurs lost 0-1 after a 2-2 draw.'), 'Spurs lost nil one after a two all draw.');
});

table('acronyms', us, [
  ['NASA and NATO met the UN, the EU and the BBC.', 'Nasa and Nato met the UN, the EU and the BBC.'],
  ['The WHO said MPs and CEOs must act.', "The W-H-O said M-P's and C-E-O's must act."],
  ['The IAEA and the ECB agreed.', 'The I-eigh-E-eigh and the E-C-B agreed.'],
  ["The IMF's chief met OPEC.", "The I-M-F's chief met Opec."],
  ['Shares in ChatGPT maker OpenAI rose.', 'Shares in Chat G-P-T maker Open A-I rose.'],
  ['The U.S. economy grew.', 'The US economy grew.'],
  ['Talks with the U.S. The meeting ended.', 'Talks with the US. The meeting ended.'],
  ['TSMC and HSBC beat CERN.', 'T-S-M-C and H-S-B-C beat Cern.'],
  ['UNHCR and the OECD.', 'U-N-H-C-R and the OECD.'],
  ['It is OK, she said.', "It is okay, she said."],
]);

table('shouting is de-shouted but acronyms survive', us, [
  ['BREAKING: HUGE STORM HITS THE UK COAST', 'Breaking: Huge storm hits the UK coast.'],
  ['WATCH LIVE: THE WHO WARNS OF NEW VIRUS', 'Watch live: The W-H-O warns of new virus.'],
  ['JOIN US FOR THE BIG US ELECTION NIGHT', 'Join us for the big US election night.'],
  ['The minister said NO to the plan.', 'The minister said no to the plan.'],
]);

table('titles, abbreviations and Roman numerals', us, [
  ['Dr Smith lives on Downing St in St Albans.', 'Doctor Smith lives on Downing Street in Saint Albans.'],
  ['Mr. Jones, Mrs Brown and Ms Green agreed.', 'Mister Jones, Missus Brown and Miz Green agreed.'],
  ['Gen. Ivanov met Gen Z voters.', 'General Ivanov met Gen Z voters.'],
  ['King Charles III met Pope Leo XIV.', 'King Charles the third met Pope Leo the fourteenth.'],
  ['World War II veterans and Phase III trials.', 'World War two veterans and Phase three trials.'],
  ["Elizabeth II's heir and Henry VIII.", "Elizabeth the second's heir and Henry the eighth."],
  ['Fruit, e.g. apples, i.e. food, etc.', 'Fruit, for example apples, that is food, et cetera.'],
  ['Arsenal v Chelsea and Biden vs. Trump.', 'Arsenal versus Chelsea and Biden versus Trump.'],
  ['He lives at No. 10 with John F. Kennedy Jr.', 'He lives at number ten with John F Kennedy Junior.'],
  ['Apple Inc. and Microsoft Corp. met Acme Ltd.', 'Apple Inc and Microsoft Corporation met Acme Limited.'],
  ['Open Mon-Fri, approx. 9 hrs.', 'Open Monday to Friday, approximately nine hours.'],
  ['Mt Everest is 8,849m high.', 'Mount Everest is eight thousand eight hundred forty-nine metres high.'],
]);

table('punctuation, quotes, web junk and emoji', us, [
  ['He called it "a disgrace" — then left.', 'He called it a disgrace, then left.'],
  ['"We will not give up," the minister said.', 'We will not give up, the minister said.'],
  ['The minister said "We will fight on" today.', 'The minister said, We will fight on today.'],
  ["PM says 'no deal' is off the table.", 'PM says no deal is off the table.'],
  ['The IMF (International Monetary Fund) said no.', 'The I-M-F, International Monetary Fund, said no.'],
  ['Watch at https://example.com/live now 🔥🔥', 'Watch now.'],
  ['Follow @globit24 for more #ClimateWeek', 'Follow for more Climate Week.'],
  ['Visit Booking.com today.', 'Visit Booking dot com today.'],
  ['What?! Really??? Wow!!!', 'What? Really? Wow!'],
  ['Good evening [wave] and welcome. [B:nod]', 'Good evening and welcome.'],
  ['Prices &amp; wages rose&nbsp;3%.', 'Prices and wages rose three percent.'],
  ['Line one\n\nLine two', 'Line one. Line two.'],
]);

table('pronunciation lexicon', us, [
  ['Xi Jinping met Guterres in Qingdao.', 'Shee Jinping met Goo-terresh in Ching-dow.'],
  ['Putin spoke in Kyiv and Lviv.', 'Pootin spoke in Keev and Luh-veev.'],
  ['The FTSE 100 rose.', 'The Footsie one hundred rose.'],
  ['UNIT-8 joins GLOBIT 24 with Dr Nova Reyes.', 'Unit Eight joins Globit twenty-four with Doctor Nova Rayess.'],
  ['QATAR AND NIGER SIGN DEAL', 'Qatar and neezhair sign deal.'],
]);

table('Spanish', es, [
  ['El FMI prestó 2.000 millones de dólares el 2 de octubre de 2026.', 'El F-M-I prestó dos mil millones de dólares el dos de octubre de dos mil veintiséis.'],
  ['La inflación bajó al 3,5%.', 'La inflación bajó al tres coma cinco por ciento.'],
  ['El Sr. García llegó a las 14:30 a EE.UU.', 'El señor García llegó a las catorce treinta a Estados Unidos.'],
  ['Murieron 1.500 personas y hubo 21 heridos.', 'Murieron mil quinientas personas y hubo veintiún heridos.'],
  ['El 1º de mayo costó 5 €.', 'El primero de mayo costó cinco euros.'],
  ['La OTAN y la ONU.', 'La Otan y la Onu.'],
]);

describe('lexicon hooks', () => {
  test('a call can pass its own respellings, which win over the defaults', () => {
    assert.equal(speakable('Kyiv and Paco.', { lexicon: { Kyiv: 'Kee-iv', Paco: 'Pahco' } }), 'Kee-iv and Pahco.');
  });

  test('addPronunciations extends the lexicon for every later call', () => {
    addPronunciations({ Zorblax: 'Zorr-blacks' });
    assert.equal(us('Zorblax wins.'), 'Zorr-blacks wins.');
  });

  test('lexicon entries match whole words only, also before a possessive', () => {
    assert.equal(us("Putin's plan, not Putinism."), "Pootin's plan, not Putinism.");
  });

  test('respellings are plain words so later rules leave them alone', () => {
    for (const v of Object.values(LEXICON)) {
      assert.doesNotMatch(v, /\d/, v);
      assert.doesNotMatch(v, /[A-Z]{2,}/, v);
    }
  });
});

describe('spellLetters', () => {
  test('hyphen-spells letters and writes an inner A as "eigh"', () => {
    assert.equal(spellLetters('IMF'), 'I-M-F');
    assert.equal(spellLetters('UAE'), 'U-eigh-E');
    assert.equal(spellLetters('AFP'), 'A-F-P');
  });
});

describe('character map', () => {
  const samples = [
    'The IMF lent $2bn to Kenya on 2 October.',
    'BREAKING: HUGE STORM HITS THE UK COAST',
    'Watch at https://example.com/live now 🔥 (really) — "yes" 3-4% at 14:30, King Charles III.',
    'El FMI prestó 2.000 millones de dólares.',
  ];
  for (const text of samples) {
    test(`is monotonic and one entry longer than the spoken text: ${text.slice(0, 30)}`, () => {
      const { spoken, map } = normalizeForSpeech(text, { lang: text.startsWith('El') ? 'es' : 'en-GB' });
      assert.equal(map.length, spoken.length + 1);
      for (let i = 1; i < map.length; i++) assert.ok(map[i] >= map[i - 1], `map goes back at ${i}`);
      assert.ok(map.every((x) => x >= 0 && x <= text.length));
      assert.equal(map[map.length - 1], text.length);
    });
  }

  test('untouched words map onto themselves', () => {
    const text = 'Oil prices fell for a third day.';
    const { spoken, map } = normalizeForSpeech(text);
    assert.equal(spoken, text);
    assert.deepEqual(map, [...Array(text.length + 1).keys()]);
  });

  test('every spoken word of an expansion points at the start of its source token', () => {
    const text = 'Paid $2bn today.';
    const { spoken, map } = normalizeForSpeech(text);
    assert.equal(spoken, 'Paid two billion dollars today.');
    const at = (w) => toOriginal(map, spoken.indexOf(w));
    assert.equal(at('two'), 5);
    assert.equal(at('dollars'), 5);
    assert.equal(at('today'), text.indexOf('today'));
  });

  test('a range maps each side to its own number', () => {
    const text = 'Expect 3-4 storms.';
    const { spoken, map } = normalizeForSpeech(text);
    assert.equal(toOriginal(map, spoken.indexOf('three')), 7);
    assert.equal(toOriginal(map, spoken.indexOf('four')), 9);
  });

  test('toSpoken is the inverse of toOriginal at word starts', () => {
    const text = 'On 2 October the IMF lent $2bn to Kenya.';
    const { spoken, map } = normalizeForSpeech(text, { lang: 'en-GB' });
    assert.equal(spoken.slice(toSpoken(map, text.indexOf('Kenya'))), 'Kenya.');
    assert.equal(spoken.slice(toSpoken(map, text.indexOf('$2bn')), toSpoken(map, text.indexOf('$2bn')) + 3), 'two');
  });

  test('remapCues moves parseCues offsets onto the spoken text', () => {
    const { text, cues } = parseCues('The IMF lent $2bn [wow] to Kenya. [nod]');
    const { spoken, map } = normalizeForSpeech(text);
    const moved = remapCues(cues, map);
    assert.equal(spoken.slice(0, moved[0].char).trim(), 'The I-M-F lent two billion dollars');
    assert.equal(moved[1].char, spoken.length - 1);
  });

  test('empty and missing text give an empty result', () => {
    assert.deepEqual(normalizeForSpeech(''), { spoken: '', map: [0] });
    assert.deepEqual(normalizeForSpeech(null), { spoken: '', map: [0] });
  });

  test('terminal: false leaves the end alone', () => {
    assert.equal(speakable('Oil prices slide', { terminal: false }), 'Oil prices slide');
    assert.equal(speakable('Oil prices slide'), 'Oil prices slide.');
  });
});

// ------------------------------------------------------------------ prosody

const STORY = 'Good evening. Oil prices fell for a third day as traders expect weaker demand this winter; '
  + 'Brent crude dropped 2% to $71 a barrel. Meanwhile, the central bank held rates at 3.5%, saying inflation '
  + 'is easing — but not fast enough.';

describe('planProsody', () => {
  test('phrases cover the original text in order, each a real slice of it', () => {
    const phrases = planProsody(STORY, { persona: 'paco' });
    let cursor = 0;
    for (const p of phrases) {
      assert.equal(STORY.slice(p.start, p.end), p.text);
      assert.ok(p.start >= cursor);
      assert.equal(STORY.slice(cursor, p.start).trim(), '');
      cursor = p.end;
    }
    assert.equal(cursor, STORY.length);
  });

  test('the spoken phrases join up into the normalised text', () => {
    const { spoken, phrases } = planSpeech(STORY, { persona: 'lola' });
    assert.equal(phrases.map((p) => p.spoken).join(' '), spoken);
    for (const p of phrases) assert.equal(spoken.slice(p.spokenStart, p.spokenEnd), p.spoken);
  });

  test('phrases split at clause boundaries and keep their punctuation', () => {
    const phrases = planProsody(STORY, { persona: 'ada' });
    assert.deepEqual(phrases.map((p) => p.boundary), ['stop', 'semicolon', 'stop', 'intro', 'comma', 'dash', 'end']);
    assert.equal(phrases[1].spoken, 'Oil prices fell for a third day as traders expect weaker demand this winter;');
    assert.equal(phrases[2].spoken, 'Brent crude dropped two percent to seventy-one dollars a barrel.');
  });

  test('pauses follow punctuation: comma < semicolon < full stop < hand-over', () => {
    const p = planProsody(STORY, { persona: 'ada', seed: 1 });
    const pause = (kind) => p.find((x) => x.boundary === kind).pauseAfter;
    assert.ok(pause('comma') > 0.12 && pause('comma') < 0.26, `comma ${pause('comma')}`);
    assert.ok(pause('semicolon') > pause('comma'));
    assert.ok(pause('stop') >= 0.33 && pause('stop') <= 0.6, `stop ${pause('stop')}`);
    assert.ok(p[p.length - 1].pauseAfter > pause('stop'));
  });

  test('a paragraph break pauses longer than a full stop', () => {
    const p = planProsody('First line here.\n\nSecond line here. Third.', { persona: 'ada', seed: 3 });
    assert.equal(p[0].boundary, 'paragraph');
    assert.ok(p[0].pauseAfter > p[1].pauseAfter);
  });

  test('presenters have their own pace: Sam fastest, Paco measured', () => {
    const avg = (persona) => {
      const ph = planProsody(STORY, { persona });
      return ph.reduce((s, p) => s + p.speedFactor, 0) / ph.length;
    };
    assert.ok(avg('sam') > avg('lola'));
    assert.ok(avg('lola') > avg('ada'));
    assert.ok(avg('ada') > avg('paco'));
    assert.ok(avg('sam') - avg('paco') > 0.08);
  });

  test('Paco leaves longer silences than Sam', () => {
    const total = (persona) => planProsody(STORY, { persona }).reduce((s, p) => s + p.pauseAfter, 0);
    assert.ok(total('paco') > total('sam') * 1.2);
  });

  test('grave stories are slower with longer pauses, happy ones a touch brighter', () => {
    const speed = (o) => planProsody(STORY, { persona: 'lola', ...o }).reduce((s, p) => s + p.speedFactor, 0);
    const pauses = (o) => planProsody(STORY, { persona: 'lola', ...o }).reduce((s, p) => s + p.pauseAfter, 0);
    assert.ok(speed({ emotion: 'serious' }) < speed({}));
    assert.ok(speed({ grave: true }) < speed({}));
    assert.ok(speed({ emotion: 'sad' }) < speed({ emotion: 'serious' }) + 0.05);
    assert.ok(speed({ emotion: 'happy' }) > speed({}));
    assert.ok(pauses({ emotion: 'serious' }) > pauses({}));
  });

  test('the same line always gets the same plan; a new seed varies it', () => {
    assert.deepEqual(planProsody(STORY, { persona: 'max' }), planProsody(STORY, { persona: 'max' }));
    assert.notDeepEqual(planProsody(STORY, { persona: 'max', seed: 1 }), planProsody(STORY, { persona: 'max', seed: 2 }));
  });

  test('no robotic uniformity: commas in one story differ a little', () => {
    const text = 'Rain, wind, snow, hail, fog and frost are coming, the forecasters say, so stay warm, stay dry, stay in.';
    const pauses = planProsody(text, { persona: 'lola' }).filter((p) => p.boundary !== 'end').map((p) => p.pauseAfter);
    assert.ok(new Set(pauses).size >= 3, pauses.join(' '));
  });

  test('UNIT-8 is even and precise: equal clause pauses, steady pace', () => {
    const p = planProsody(STORY, { persona: 'unit8' });
    const clauses = p.filter((x) => ['comma', 'semicolon', 'intro', 'dash'].includes(x.boundary)).map((x) => x.pauseAfter);
    assert.ok(clauses.every((x) => x === 0.2), clauses.join(' '));
    assert.ok(p.filter((x) => x.boundary === 'stop').every((x) => x.pauseAfter === 0.4));
    assert.ok(p.every((x) => x.speedFactor >= 0.97 && x.speedFactor <= 1.0));
  });

  test('a robot presenter config gets the UNIT-8 style', () => {
    const p = planProsody(STORY, { persona: { voice: { gender: 'robot' } } });
    assert.ok(p.filter((x) => x.boundary === 'comma').every((x) => x.pauseAfter === 0.2));
  });

  test('Nova takes a breath of wonder before a big reveal', () => {
    const p = planProsody('The planet is about twice the size of Earth.', { persona: 'nova', seed: 0 });
    assert.equal(p[0].boundary, 'wonder');
    assert.equal(p[0].spoken, 'The planet is');
    assert.equal(p[1].spoken, 'about twice the size of Earth.');
    assert.ok(p[1].speedFactor < p[0].speedFactor);
    assert.ok(!planProsody('The planet is about twice the size of Earth.', { persona: 'ada' }).some((x) => x.boundary === 'wonder'));
  });

  test('Penny reads figures with care', () => {
    const p = planProsody('Sales rose 4% last month. Shoppers were cheerful.', { persona: 'penny' });
    assert.ok(p[0].speedFactor < p[1].speedFactor);
  });

  test('a long sentence without commas gets a breath at a conjunction', () => {
    const text = 'The company that employs thousands of people in twelve countries has been operating for years and it said today it would cut hundreds of jobs in the spring.';
    const p = planProsody(text, { persona: 'ada' });
    assert.equal(p[0].boundary, 'breath');
    assert.ok(p[0].pauseAfter < 0.12);
    assert.match(p[1].spoken, /^and /);
  });

  test('lists pause less than clauses; a discourse marker gets an intro pause', () => {
    const p = planProsody('However, apples, pears, plums and figs rose in price, the report says.', { persona: 'ada', seed: 5 });
    assert.equal(p[0].boundary, 'intro');
    assert.equal(p[1].boundary, 'list');
    assert.ok(p[1].pauseAfter < PAUSES.comma * 1.15);
  });

  test('segment types set the hand-over pause', () => {
    const end = (segmentType) => planProsody('Thanks for watching.', { persona: 'ada', segmentType }).at(-1).pauseAfter;
    assert.ok(end('outro') > end('story'));
    assert.ok(end('story') > end('chat'));
    assert.equal(planProsody('Over to you.', { persona: 'ada', final: 0 }).at(-1).pauseAfter, 0);
  });

  test('chat segments run quicker than stories', () => {
    const s = (segmentType) => planProsody('Well, that is quite a story, Paco.', { persona: 'lola', segmentType })[0].speedFactor;
    assert.ok(s('chat') > s('story'));
  });

  test('emotion cues change the mood from their offset on', () => {
    const { text, cues } = parseCues('Markets cheered the news. [sad] But thousands lost their homes.');
    const p = planProsody(text, { persona: 'lola', cues });
    assert.equal(p[0].emotion, 'neutral');
    assert.equal(p[1].emotion, 'sad');
    assert.ok(p[1].speedFactor < p[0].speedFactor);
  });

  test('emphasis marks figures, superlatives and negations', () => {
    const p = planProsody('Coffee hit a record high of $5 a pound. It will not fall soon.', { persona: 'penny' });
    assert.deepEqual(p[0].emphasis.map((e) => e.word), ['record', '$5']);
    assert.deepEqual(p[1].emphasis.map((e) => e.word), ['not']);
    const e = p[0].emphasis[1];
    assert.equal('Coffee hit a record high of $5 a pound.'.slice(e.start, e.end), '$5');
  });

  test('a quoted exclamation that runs into its attribution pauses briefly', () => {
    const p = planProsody('"Yes!" he replied. Then he left.', { persona: 'ada', seed: 2 });
    assert.equal(p[0].boundary, 'quote');
    assert.ok(p[0].pauseAfter < 0.25);
  });

  test('brackets and dashes are classified as such', () => {
    const p = planProsody('The IMF (the global lender) said rates — for now — will hold.', { persona: 'ada' });
    assert.deepEqual(p.map((x) => x.boundary), ['paren', 'paren', 'dash', 'dash', 'end']);
  });

  test('speed factors and pauses stay in a safe range for every persona and mood', () => {
    for (const persona of Object.keys(PERSONAS)) {
      for (const emotion of ['neutral', 'happy', 'serious', 'sad', 'surprised', 'thinking']) {
        for (const p of planProsody(STORY, { persona, emotion, segmentType: 'chat' })) {
          assert.ok(p.speedFactor >= 0.8 && p.speedFactor <= 1.2, `${persona} ${emotion} ${p.speedFactor}`);
          assert.ok(p.pauseAfter >= 0 && p.pauseAfter <= 2.5);
        }
      }
    }
  });

  test('estimateDuration grows with the text and with slower pacing', () => {
    const short = planSpeech('Good evening.', { persona: 'sam' }).duration;
    const long = planSpeech(STORY, { persona: 'sam' }).duration;
    assert.ok(long > short * 4);
    assert.ok(planSpeech(STORY, { persona: 'paco' }).duration > long);
    assert.equal(estimateDuration([]), 0);
  });

  test('an empty text plans nothing', () => {
    assert.deepEqual(planProsody(''), []);
  });
});
