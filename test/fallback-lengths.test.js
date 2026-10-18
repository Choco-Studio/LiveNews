// The fallback writer at the programme's length on real news, with real content only (docs/roadmap/critique/
// fallback-lengths.md): the air as it will play (server/airtime.js), the producer's depth loop (a short telling written
// again deeper, never padded), a long sentence shortened as a broadcast writer would and never into something else, and
// the faults real news showed on the way (a view stated as the channel's, a surname nobody introduced, a feature's
// headline read as news, a kicker from a stray word).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { voicedAir, speechOf } from '../server/airtime.js';
import { voicedLength } from '../tools/lengths/voiced.mjs';
import { compressSentence, trimClause, extractJson, normalizeBulletin } from '../server/writer.js';
import { outletView } from '../server/facts.js';
import { createMockProvider, spokenTitle, study } from '../server/providers/mock.js';
import { topicOf } from '../server/topics.js';
import { followLine } from '../server/correspondents.js';
import { Producer } from '../server/producer.js';
import { loadChannel, castOf } from '../server/channel.js';

const DUO = { A: { id: 'paco', name: 'Paco Pixel' }, B: { id: 'lola', name: 'Lola Byte' } };
const words = (t) => String(t).replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;
const st = (id, title, summary, extra = {}) => ({ id, title, summary, source: 'Pixelburg Post', category: 'world', image: null, link: `https://example.test/${id}`, ...extra });
const write = async (stories, program, extra = {}) => extractJson((await createMockProvider().generate({ stories, channelName: 'TEST', presenters: DUO, program, count: program.stories, ...extra })).text);

// A long article of plain, standing sentences (each one a different fact), for a story the writer can tell at depth.
const FACTS = [
  (p, i) => `${p} officials said repairs would cost about ${i + 3} million euros.`,
  (p) => `Engineers began a full survey of the structure on Monday morning.`,
  (p) => `The ${p} city council will meet next week to approve emergency funding.`,
  (p, i) => `About ${(i + 2) * 1000} commuters use the route every day, according to transport data.`,
  (p) => `Local businesses near the site reported a sharp fall in customers.`,
  (p) => `The national rail operator added extra trains to carry stranded passengers.`,
  (p) => `A spokesperson for the mayor of ${p} said public safety came first.`,
  (p, i) => `Inspectors first raised concerns about corrosion in ${2010 + i}.`,
  (p) => `Residents living nearby were offered free bus passes for a month.`,
  (p) => `The work is expected to finish before the end of the year.`,
  (p) => `Opposition councillors called for an independent review of maintenance budgets.`,
  (p) => `Traffic in the old town was diverted along the river road.`,
];
const article = (subject, n) => FACTS.slice(0, n).map((f, i) => f(subject, i)).join(' ');

describe('the air as it will play', () => {
  test('voicedAir is the director’s own timeline, to a second', async () => {
    const channel = loadChannel();
    const program = { id: 'world-now', ...channel.programs['world-now'] };
    const stories = [
      st('a', 'Bridge in Lisbon closed after inspectors find cracks', 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck. Engineers say repairs could take six weeks.', { body: article('Lisbon', 8) }),
      st('b', 'Floods in Nairobi cut off two districts', 'Heavy rain in Nairobi has cut off two districts, the city says. Rescue teams are using boats to reach families.', { body: article('Nairobi', 6) }),
      st('c', 'Chile votes on a new water law', 'Chile’s parliament has passed a new water law. Farmers say it will help them plan for drought.'),
    ];
    const ep = await write(stories, program);
    ep.program = { id: 'world-now' };
    ep.cast = castOf(channel, 'world-now');
    const est = voicedAir(ep);
    const { seconds } = await voicedLength(ep);
    assert.ok(Math.abs(est - seconds) <= 1, `voicedAir ${est.toFixed(1)} s, the director ${seconds.toFixed(1)} s`);
    assert.ok(speechOf(ep, ep.segments[0]) > 0);
  });

  test('a recorded clip counts as it is; a line without one at its voice’s measured rate', () => {
    const ep = { program: { id: 'cosmos' }, cast: { A: 'nova', B: 'unit8' }, segments: [] };
    assert.equal(speechOf(ep, { anchor: 'A', text: 'one two three', audio: { duration: 7.5 } }), 7.5);
    const t = speechOf(ep, { anchor: 'A', text: 'one two three four five six seven eight nine ten' });
    assert.ok(t > 2 && t < 6, `ten words in ${t} s`);
  });
});

describe('the producer’s depth loop', () => {
  const channel = loadChannel();
  /** A producer whose writer is the mock and whose desk is not needed: write() alone. */
  const producerWith = (provider) => new Producer({ config: { reviewPass: false }, newsDesk: { stories: new Map() }, chain: { providers: [provider], generate: async (req, validate) => ({ provider: provider.name, value: validate((await provider.generate(req)).text) }) }, log: { info() {}, warn() {}, error() {} } });
  const ctxFor = (id, candidates) => ({ channelName: 'GLOBIT 24', program: { id, ...channel.programs[id] }, presenters: DUO, cast: castOf(channel, id), candidates, experts: [] });
  // sixteen different stories in sixteen places (never one event twice: the writer would tell it once)
  const PLACES = ['Lisbon', 'Nairobi', 'Lima', 'Oslo', 'Hanoi', 'Accra', 'Quito', 'Riga', 'Manila', 'Dakar', 'Bogotá', 'Tbilisi', 'Perth', 'Tunis', 'Montreal', 'Seville'];
  const WHAT = ['bridge', 'tunnel', 'stadium', 'dam', 'port', 'airport', 'museum', 'hospital', 'market', 'school', 'library', 'station', 'pier', 'tower', 'theatre', 'harbour'];
  const VERB = ['closes', 'reopens', 'inspects', 'repairs', 'expands', 'sells', 'rebuilds', 'opens', 'shuts', 'renames', 'insures', 'floods', 'audits', 'restores', 'demolishes', 'moves'];
  const OUTLETS = ['Pixelburg Post', 'Ledger Line', 'Harbour Herald', 'Valley Times'];
  const many = PLACES.map((p, i) =>
    st(`s${i}`, `${p} ${VERB[i]} its ${WHAT[i]} after a ${['storm', 'fire', 'audit', 'vote', 'strike', 'survey', 'flood', 'ruling'][i % 8]}`, `Officials in ${p} say the ${WHAT[i]} work follows a ${['storm', 'fire', 'audit', 'vote', 'strike', 'survey', 'flood', 'ruling'][i % 8]} last month. Residents were told on ${['Monday', 'Tuesday', 'Friday'][i % 3]}.`, { body: article(p, 10), category: i % 2 ? 'business' : 'world', source: OUTLETS[i % 4] })
  );

  test('a telling short of the target is written again deeper, and the deeper one is kept', async () => {
    const mock = createMockProvider();
    const depths = [];
    const spy = { ...mock, name: mock.name, depths: mock.depths, generate: (req) => (depths.push(req.depth || 0), mock.generate(req)) };
    const producer = producerWith(spy);
    const ctx = ctxFor('world-now', many);
    producer.normalizer = () => (text) => extractJson(text);
    const out = await producer.write(ctx);
    assert.ok(depths.length >= 2, `written ${depths.length} times`);
    assert.deepEqual(depths.slice(0, 2), [0, 1], 'one depth at a time');
    assert.ok(out.depth >= 1 && Number.isFinite(out.air), JSON.stringify(out));
  });

  test('a deeper telling far past the top is told with fewer stories before a shorter one is kept', async () => {
    // depth 0-2: eight stories of about 110 words (short of 540 s); depth 3: fourteen of about 175 (far past 600 s, further
    // off than depth 2); with fewer stories depth 3 comes nearer than depth 2
    const story = (i, n) => ({ type: 'story', anchor: i % 2 ? 'B' : 'A', storyId: `s${i}`, emotion: 'neutral', text: Array.from({ length: Math.round(n / 10) }, (_, j) => `The district council approved plan number ${j + 1} for the old harbour.`).join(' ') });
    const script = (n, words) => ({ title: 'T', segments: [{ type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening.' }, ...Array.from({ length: n }, (_, i) => story(i, words)), { type: 'outro', anchor: 'A', emotion: 'neutral', text: 'Goodbye.' }] });
    const calls = [];
    const fake = { name: 'mock', depths: 3, generate: async ({ depth = 0, count, program }) => (calls.push([depth, count ?? null]), { text: JSON.stringify(depth < 3 ? script(8, 100) : script((count ?? program.stories) + (Number(program.moreStories) || 0), 160)) }) };
    const producer = producerWith(fake);
    producer.normalizer = () => (text) => extractJson(text);
    const ctx = ctxFor('world-now', many);
    const airOf = (ep) => voicedAir({ ...ep, program: { id: 'world-now' }, cast: ctx.cast });
    const [two, three] = [airOf(script(8, 100)), airOf(script(14, 160))];
    const off = (a) => (a < 540 ? 540 - a : a > 600 ? a - 600 : 0);
    assert.ok(off(two) < off(three), `the premise: depth 2 (${Math.round(two)} s) nearer than depth 3 (${Math.round(three)} s)`);
    const out = await producer.write(ctx);
    assert.equal(out.depth, 3, JSON.stringify({ ...out, episode: undefined }));
    assert.ok(out.fewer >= 1 && off(out.air) < off(two), `${Math.round(out.air)} s with ${out.fewer} fewer`);
    assert.ok(calls.some(([d, c]) => d === 3 && c !== null), 'depth 3 told again with fewer stories');
  });

  test('a writer with no depths (an AI writer) is never rewritten; a programme timed to the second neither', async () => {
    let calls = 0;
    const ai = { name: 'ai', generate: async (req) => (calls++, createMockProvider().generate(req)) };
    const producer = producerWith(ai);
    producer.normalizer = () => (text) => extractJson(text);
    await producer.write(ctxFor('world-now', many));
    assert.equal(calls, 1);
    const mock = createMockProvider();
    let n = 0;
    const timed = producerWith({ ...mock, name: mock.name, depths: mock.depths, generate: (req) => (n++, mock.generate(req)) });
    timed.normalizer = () => (text) => extractJson(text);
    await timed.write(ctxFor('news-60', many));
    assert.equal(n, 1, 'NEWS IN 60 is fitted to its minute, not deepened');
  });
});

describe('a long sentence shortened as a broadcast writer would', () => {
  test('an aside, a frame or the time after who said it goes; the rest is the sentence as written', () => {
    assert.deepEqual(compressSentence('The FSB, the main successor to the Soviet KGB, said it arrested the man on Sakhalin Island as he was preparing to leave Russia.', 20), ['The FSB said it arrested the man on Sakhalin Island as he was preparing to leave Russia.']);
    assert.deepEqual(compressSentence('In Kharkiv, Ukraine’s second-largest city, a strike on a grocery store killed three people, the regional governor said on Sunday.', 18), ['In Kharkiv, a strike on a grocery store killed three people, the regional governor said on Sunday.'], 'the least lost first');
    assert.deepEqual(compressSentence('In Kharkiv, Ukraine’s second-largest city, a strike on a grocery store killed three people, the regional governor said on Sunday.', 15), ['In Kharkiv, a strike on a grocery store killed three people, the regional governor said.']);
    assert.deepEqual(compressSentence('“We were overwhelmed with the gunshot patients,” Teran Madit, a clinical officer, told The Associated Press by telephone Monday.', 16), ['“We were overwhelmed with the gunshot patients,” Teran Madit, a clinical officer, told The Associated Press.']);
  });

  test('never who says it, never the other side, never a condition, never part of a list', () => {
    for (const s of [
      'Uneven caring responsibilities combined with a lack of flexible work options have prevented women from staying in senior positions, research suggests.',
      'Pope Leo XIV has been diagnosed with lung cancer but had successful surgery to remove a lower lobe of his right lung, the Vatican has said in a medical bulletin.',
      'He received some messages from the suspect in January 2024 but ignored them, blocked his contact number and deleted their text message conversation, the court heard.',
      'A “window of opportunity” exists to establish a formal transition mechanism for loyalist and republican groups, provided certain conditions are met, it said.',
    ]) {
      const out = compressSentence(s, 20, { min: 8 });
      if (!out) continue;
      const said = out.join(' ');
      if (/research suggests/.test(s)) assert.match(said, /research suggests/, said);
      if (/\bbut\b/.test(s)) assert.match(said, /\bbut\b/, said);
      if (/provided/.test(s)) assert.match(said, /provided certain conditions/, said);
    }
    assert.equal(trimClause('Brand has pleaded not guilty to three counts of rape, three counts of sexual assault and one count of indecent assault.', 12), null, 'a defendant’s charges stay together');
    assert.notEqual(compressSentence('The 71-year-old pontiff is due to travel to Uruguay, Argentina and Peru on November 6, though the Vatican has not confirmed the operation date.', 20)?.join(' '), 'The 71-year-old pontiff is due to travel to Uruguay though the Vatican has not confirmed the operation date.');
  });

  test('every part it returns is a whole sentence of at most the length asked', () => {
    const s = 'Officials said the river rose two metres in a night, as rescue teams in boats reached families stranded on rooftops in the north.';
    const out = compressSentence(s, 14, { min: 6 });
    assert.ok(out, 'split at its joint');
    for (const p of out) {
      assert.ok(words(p) <= 14, p);
      assert.match(p, /^[A-Z“"]/, p);
      assert.match(p, /[.!?”"]$/, p);
    }
  });
});

describe('what real news showed on the way', () => {
  test('a view nobody is said to hold is never the channel’s; an attributed one or a rule is', () => {
    assert.equal(outletView('The reckless missile attack on the airport left travellers stranded.'), true);
    assert.equal(outletView('Backing the case must be followed by concrete action.'), true);
    assert.equal(outletView('Always keep a timeline of interactions with a company.'), true, 'advice to the reader');
    assert.equal(outletView('The minister said the attack was reckless.'), false);
    assert.equal(outletView('If the fourth attempt fails, a snap election must be called.'), false);
  });

  test('a headline with two participles: the second is the news', () => {
    const info = (t) => ({ s: { title: t, summary: 'A cryptocurrency exchange founded by Ben Delo is being sued.', body: '' } });
    const t = 'Cryptocurrency exchange founded by Reform donor Ben Delo sued for £20m';
    assert.equal(spokenTitle(t, info(t)), 'A cryptocurrency exchange founded by Reform donor Ben Delo has been sued for £20m');
    const u = 'Man arrested in Leeds charged with murder';
    assert.equal(spokenTitle(u, { s: { title: u, summary: 'A man was charged.', body: '' } }), 'A man arrested in Leeds has been charged with murder');
  });

  test('a topic label before a colon is not read: what follows it is the news', () => {
    const t = 'Fuel prices: Sébastien Lecornu promises €10 cut per fill-up';
    assert.ok(!/^Fuel prices:/.test(spokenTitle(t, { s: { title: t, summary: 'The government has promised a cut.', body: '' } })));
  });

  test('kickers come from what the story is about, not a stray word', () => {
    assert.notEqual(topicOf({ title: 'The fight to kill the Church of England’s £100m slavery fund', summary: 'Campaigners against reparations for the slave trade have lobbied ministers.', category: 'business' }), 'TRADE');
    assert.notEqual(topicOf({ title: 'Pope Leo undergoes surgery to remove growth on lung', summary: 'The Vatican said the operation went well.', category: 'world' }), 'ECONOMY');
    assert.notEqual(topicOf({ title: 'Cost of living struggles inspire social supermarket', summary: 'A shop sells surplus food at cost.', category: 'business' }), 'MARKETS');
    assert.equal(topicOf({ title: 'Former coach jailed over indecent assaults', summary: 'He was sentenced on Monday.', category: 'world' }), 'JUSTICE');
    assert.equal(topicOf({ title: 'Immigration agent fatally shot man during arrest, family says', summary: 'The museum where he worked held a vigil.', category: 'world' }), 'CRIME');
  });

  test('a correspondent’s second question is never the first one again', () => {
    const c = { first: 'Rhea' };
    for (let i = 0; i < 20; i++) {
      const first = 'Rhea, what else do we know?';
      assert.notEqual(followLine(c, `seed${i}`, 'Talks resume on Monday.', first).toLowerCase(), first.toLowerCase());
      assert.ok(!/what else do we know/i.test(followLine(c, `seed${i}`, 'The bridge was closed.', first)));
    }
  });

  test('a person known only by a surname is introduced from the article, or the sentence is not aired', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 0 };
    const body = 'Helen Barber, a software engineer, says the exchange mis-sold products. Barber’s claim is against HDR Global Trading Limited, the exchange’s owner. The company denies the claim and says it will defend it.';
    const seg = (await write([st('x', 'Cryptocurrency exchange sued for £20m over mis-selling claims', 'A cryptocurrency exchange is being sued for £20m over claims it mis-sold products to investors in the UK.', { body })], program)).segments.find((s) => s.type === 'story');
    assert.ok(!/(?<!Helen )Barber’s claim/.test(seg.text), seg.text);
    const body2 = 'Ms Barber said she lost money. Barber’s claim is against HDR Global Trading Limited, the exchange’s owner. The company denies the claim and says it will defend it.';
    const seg2 = (await write([st('y', 'Cryptocurrency exchange sued for £20m over mis-selling claims', 'A cryptocurrency exchange is being sued for £20m over claims it mis-sold products to investors in the UK.', { body: body2 })], program)).segments.find((s) => s.type === 'story');
    assert.ok(!/Barber’s claim/.test(seg2.text), `nobody told us who Barber is: ${seg2.text}`);
  });

  test('a reader’s letter or a feature’s headline goes after the news; security and the military are never "And finally"', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 3, maxChats: 0, features: ['lighter'] };
    const stories = [
      st('l', 'BT charged me for more than a year despite landline being dead', 'A reader writes about a dead landline that was billed for a year.', { category: 'business' }),
      st('f', 'Lobbying, lawyers and a media blitz: the fight to kill a slavery fund', 'A long read on the campaign against a church fund.'),
      st('a', 'Lisbon closes a road bridge after cracks found', 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.'),
      st('b', 'Nairobi floods cut off two districts', 'Heavy rain in Nairobi has cut off two districts, the city says.'),
      st('c', '‘Super app’ aimed at students uses servers owned by Chinese firm on US military blacklist', 'A new messaging app marketed at students uses servers owned by a company on a US military blacklist.', { category: 'tech' }),
    ];
    const ep = await write(stories, program);
    const ids = ep.segments.filter((s) => s.type === 'story').map((s) => s.storyId);
    assert.ok(!ids.includes('l') && !ids.includes('f'), `aired ${ids.join(', ')}`);
    assert.ok(!ep.segments.some((s) => s.storyId === 'c' && s.feature === 'lighter'), 'never the lighter');
  });

  test('a lead with something to tell: a one-sentence caption does not lead over a story with an article', () => {
    const thin = study(st('t', 'Huge explosion captured on CCTV after deadly strike hits store – video', 'Footage released by prosecutors captured the moment of the strike.'));
    const rich = study(st('r', 'Missile strike sets fire to oil compound', 'A missile strike set fire to an oil compound on Tuesday, officials said.', { body: article('Energy', 8) }));
    assert.ok(thin.sentences.length < 3 && rich.sentences.length >= 5);
  });
});

describe('what the third reading showed', () => {
  test('"As … put it" names a speaker the viewer has heard of, or their whole name from the article, or is not read', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 0, targetSeconds: [540, 600] };
    const summary = 'Democratic leaders have condemned a federal search of a congresswoman’s home in Minnesota. The search was part of a fraud investigation, officials said. Agents left the house after four hours.';
    const tellOf = async (body) => (await write([st('k', 'Democrats rebuke federal search of congresswoman’s home', summary, { body })], program, { depth: 2 })).segments.find((s) => s.type === 'story').text;
    const a = await tellOf('Representative Sydney Kamlager-Dove spoke outside the Capitol on Monday. “This is an unadulterated abuse of power,” Kamlager-Dove said.');
    assert.ok(!/As Kamlager-Dove put it/.test(a), a);
    const b = await tellOf('“This is an unadulterated abuse of power,” Kamlager-Dove said. Agents searched the house for four hours.');
    assert.ok(!/Kamlager-Dove put it/.test(b), `nobody told us who Kamlager-Dove is: ${b}`);
  });

  test('a sentence that names with "that" what the one before introduced does not open the story', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 0 };
    const summary = 'Fox News reported that the search concerned her immigration paperwork. Her late father filled out that paperwork when she was a child. Democratic leaders called the search of the congresswoman’s home an abuse of power.';
    const seg = (await write([st('o', 'Democrats rebuke federal search of congresswoman’s home', summary)], program)).segments.find((s) => s.type === 'story');
    assert.ok(!/^(?:\[[^\]]*\]\s*)*Her late father filled out that paperwork/.test(seg.text), seg.text);
  });

  test('the intro reads a column’s headline without its label', async () => {
    const program = { id: 'cosmos', title: 'COSMOS DESK', stories: 3, maxChats: 0 };
    const stories = [
      st('a', 'Starwatch: Mars signposts the Beehive cluster this week', 'Mars passes close to the Beehive star cluster this week, visible in the east before dawn. Binoculars show dozens of stars.', { category: 'science' }),
      st('b', 'Lisbon closes a road bridge after cracks found', 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.', { category: 'science' }),
      st('c', 'Nairobi floods cut off two districts', 'Heavy rain in Nairobi has cut off two districts, the city says.', { category: 'science' }),
    ];
    const ep = await write(stories, program);
    const intro = ep.segments.find((s) => s.type === 'intro').text;
    assert.ok(/Mars signposts/.test(intro) && !/Starwatch/.test(intro), intro);
  });

  test('the number of the day is a figure the story says, and it is said', async () => {
    const program = { id: 'money-minute', title: 'MONEY MINUTE', stories: 4, maxChats: 0, features: ['number'], targetSeconds: [240, 360] };
    const stories = [
      st('d', 'Central bank raises interest rates to 5% as inflation climbs', 'The central bank raised its main interest rate to 5% on Thursday. Inflation rose for a third month in a row. Mortgage lenders are expected to follow.', { category: 'business' }),
      st('a', 'Lisbon closes a road bridge after cracks found', 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck. Repairs will take months, the city said.', { category: 'business' }),
      st('b', 'Dating app bought for $1.3bn by an investment firm', 'A dating app has been bought for $1.3bn by an investment firm. The firm said it would keep the app’s staff. The deal closes next month.', { category: 'business' }),
      // a figure in no sentence the story can tell (a fragment) is never the number of the day
      st('e', 'Holiday meals bill: £20m a year', 'Cost: £20m a year. Campaigners say a minister is trying to undermine a bill on holiday meals. The minister denies it.', { category: 'business' }),
    ];
    const ep = await write(stories, program, { depth: 1 });
    const number = ep.segments.find((s) => /Our number of the day/.test(s.text || ''));
    assert.ok(number, ep.segments.map((s) => s.text).join('\n'));
    assert.notEqual(number.storyId, 'e');
    const said = number.text.match(/Our number of the day: ([^.]*(?:\.\d[^.]*)?)\./)[1];
    const core = said.match(/\d[\d.,]*/)[0];
    const after = number.text.slice(number.text.indexOf(said) + said.length);
    assert.ok(after.includes(core), `the figure is said in the story: ${number.text}`);
  });

  test('a question never airs without its answer: a reply gone as aired lately takes its question with it', () => {
    const STORY = { id: 'g1', title: 'Rail strike halts most trains across Germany', summary: 'Stations across Germany were almost empty on Thursday as rail workers began a strike over pay. The operator says only one in five long-distance trains is running.', source: 'Ledger Line', category: 'business', image: null };
    const OTHER = { id: 'g2', title: 'Lisbon closes a road bridge after cracks found', summary: 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.', source: 'Ledger Line', category: 'business', image: null };
    const reply = 'The operator says only one in five long-distance trains is running.';
    const raw = (recent) =>
      normalizeBulletin(
        {
          title: 'T',
          segments: [
            { type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening.' },
            { type: 'story', storyId: 'g1', anchor: 'A', emotion: 'neutral', headline: STORY.title, text: 'Stations across Germany were almost empty on Thursday as rail workers began a strike over pay.' },
            { type: 'chat', anchor: 'A', emotion: 'neutral', text: 'So what is the catch?' },
            { type: 'chat', anchor: 'B', emotion: 'neutral', text: reply },
            { type: 'story', storyId: 'g2', anchor: 'B', emotion: 'neutral', headline: OTHER.title, text: 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.' },
            { type: 'outro', anchor: 'A', emotion: 'neutral', text: "That's TECH BYTES." },
          ],
        },
        [STORY, OTHER],
        { program: { id: 'tech-bytes', title: 'TECH BYTES', stories: 2 }, presenters: DUO, maxStories: 5, recent }
      ).segments;
    assert.ok(raw(null).some((s) => /catch\?/.test(s.text)), 'with its answer it airs');
    const gone = raw(new Set([reply.toLowerCase(), reply.toLowerCase().replace(/\.$/, '')]));
    assert.ok(!gone.some((s) => /catch\?/.test(s.text)), gone.map((s) => `${s.type}: ${s.text}`).join('\n'));
  });

  test('kickers: a capsized boat is ACCIDENTS (an alarm word the outlet must use never names a topic), teachers shot is CRIME', () => {
    assert.equal(topicOf({ title: 'Boat capsizes on lake, dozens missing', summary: 'A passenger boat capsized on the lake on Sunday.', category: 'world' }), 'ACCIDENTS');
    assert.equal(topicOf({ title: 'Pupil arrested after two teachers shot at French school', summary: 'A pupil was arrested after two teachers were shot at a school in southern France.', category: 'world' }), 'CRIME');
  });

  test('the deepest telling of WORLD NOW keeps three map items and tells the read articles in full', async () => {
    const PLACES = ['Lisbon', 'Nairobi', 'Lima', 'Oslo', 'Hanoi', 'Accra', 'Quito', 'Riga', 'Manila', 'Dakar', 'Bogotá', 'Tbilisi', 'Perth', 'Tunis', 'Montreal', 'Seville'];
    const WHAT = ['bridge', 'tunnel', 'stadium', 'dam', 'port', 'airport', 'museum', 'hospital', 'market', 'school', 'library', 'station', 'pier', 'tower', 'theatre', 'harbour'];
    const VERB = ['closes', 'reopens', 'inspects', 'repairs', 'expands', 'sells', 'rebuilds', 'opens', 'shuts', 'renames', 'insures', 'floods', 'audits', 'restores', 'demolishes', 'moves'];
    const many = PLACES.map((p, i) => st(`s${i}`, `${p} ${VERB[i]} its ${WHAT[i]} after a ${['storm', 'fire', 'audit', 'vote'][i % 4]}`, `Officials in ${p} say the ${WHAT[i]} work follows a ${['storm', 'fire', 'audit', 'vote'][i % 4]} last month. Residents were told on Monday.`, { body: article(p, 10), category: 'world' }));
    const channel = loadChannel();
    const program = { id: 'world-now', ...channel.programs['world-now'], moreStories: 0 };
    const items = async (depth) => (await write(many, program, { depth })).segments.filter((s) => s.feature === 'roundup').length;
    const [two, three] = [await items(2), await items(3)];
    assert.ok(three <= 3 && three >= (program.roundup.min || 2), `depth 3: ${three} map items`);
    assert.ok(two > three, `depth 2: ${two}, depth 3: ${three}`);
  });
});

describe('what the fourth reading showed', () => {
  test('kickers: armed forces, a rescue, a regulator, a detention, the EU, and a sports star who is no star of the sky', () => {
    const k = (title, summary = '') => topicOf({ title, summary, category: 'world' });
    assert.equal(k('Ethiopian forces enter strategic Tigray town of Adwa, witnesses say', 'Ethiopian Airlines resumed flights to Tigray’s capital.'), 'CONFLICT');
    assert.equal(k('Saudi airport passenger terminal is struck again, a day after 12 were killed'), 'CONFLICT');
    assert.equal(k('Man rescued from cave on Sardinia after being trapped by rockslide for 26 hours'), 'RESCUE');
    // (the regulator's levers over an execution: either is what the story is about, never CONFLICT or SOFTWARE)
    assert.ok(['REGULATION', 'JUSTICE'].includes(k('Julie Inman Grant may be able to limit Australians seeing a livestreamed US execution', 'Australia’s online safety regulator has a few levers.')));
    assert.equal(k('Australian democracy campaigner detained in Vietnam on alleged terrorism offences'), 'JUSTICE');
    assert.equal(k('Andy Burnham promises ‘serious dialogue’ over UK’s relationship with EU'), 'POLITICS');
    assert.notEqual(k('F1 champion Norris revs up with stake in premium tickets platform', 'Lando Norris has become the latest sports star to join the share register.'), 'ASTRONOMY');
    assert.equal(k('Astronomers watch a new star forming'), 'ASTRONOMY');
    // in the summary, the topic of its first words
    assert.equal(k('Burnham says ‘public will be the boss’', 'The prime minister said any closer relationship with the EU would be put to voters, as hospitals face winter pressure.'), 'POLITICS');
  });

  test('a wire roundup’s tail is not part of the headline', async () => {
    const { plainTitle } = await import('../server/news.js');
    assert.equal(plainTitle('Iran calls latest US response to proposal insufficient, and other Mideast developments'), 'Iran calls latest US response to proposal insufficient');
    assert.equal(plainTitle('Floods and other hazards close schools'), 'Floods and other hazards close schools');
  });

  test('openers never lean: "added that", "the first covers", "denied the accusations", a "their" with nobody before it', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 0 };
    const opener = async (title, summary) => {
      const seg = (await write([st('x', title, summary)], program)).segments.find((s) => s.type === 'story');
      return seg.text.replace(/\[[^\]]*\]\s*/g, '');
    };
    assert.ok(!/^Mohsen Rezaei added/.test(await opener('Iran calls US response to proposal insufficient', 'Mohsen Rezaei added that Iran is no longer responding to the US. Iran has called the latest US response to its proposal insufficient, officials said.')));
    assert.ok(!/^The first covers/.test(await opener('Portugal budget measures change family budgets', 'The first covers annual taxable income of up to 8,666 euros. Portugal’s 2027 budget contains several measures that will affect household incomes, the government said.')));
    assert.ok(!/^Egyptian authorities denied the accusations/.test(await opener('Egypt’s press union chief rejects pressure over detained journalists', 'Egyptian authorities denied the accusations, while commentators criticised the union. The head of Egypt’s journalists’ union has insisted it will keep defending six detained journalists.')));
    assert.ok(!/^Laura Mendoza comes downstairs/.test(await opener('Cubans turn to free community pharmacies as medicines grow scarce', 'Laura Mendoza comes downstairs, checks their names against a list and hands out medicine. Cubans are turning to free community pharmacies as medicines grow scarce on the island, volunteers say.')));
  });

  test('the expert’s first question is one any of the story’s sentences answers', async () => {
    const { EXPERT_DESKS, GRAVE_ASK } = await import('../server/experts.js');
    const promises = /\b(?:how rare|how big|how worried|how unusual|how significant|why now|who does this affect|what happens now|what did the court)\b/i;
    for (const [desk, d] of Object.entries(EXPERT_DESKS)) for (const q of d.ask) assert.ok(!promises.test(q), `${desk}: ${q}`);
    for (const q of GRAVE_ASK) assert.ok(!promises.test(q), q);
  });

  test('a story with nothing to tell (a caption for a title, no sentence) airs only when there is nothing else', async () => {
    const program = { id: 'cosmos', title: 'COSMOS DESK', stories: 2, maxChats: 0 };
    const stories = [
      st('n', 'Transporter-18 SmallSats Encapsulation', '', { category: 'science' }),
      st('a', 'Lisbon closes a road bridge after cracks found', 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.', { category: 'science' }),
      st('b', 'Nairobi floods cut off two districts', 'Heavy rain in Nairobi has cut off two districts, the city says.', { category: 'science' }),
    ];
    const ids = (await write(stories, program)).segments.filter((s) => s.type === 'story').map((s) => s.storyId);
    assert.ok(!ids.includes('n'), ids.join(', '));
  });

  test('a place keeps its capital with its possessive in a signpost', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 8, maxChats: 2, targetSeconds: [540, 600] };
    const PLACES = ['Lisbon', 'Nairobi', 'Lima', 'Oslo', 'Hanoi', 'Accra', 'Quito'];
    const stories = [
      ...PLACES.map((p, i) => st(`p${i}`, `${p} closes its old bridge after a storm`, `Officials in ${p} say the bridge will stay shut for a month. Engineers will inspect it on Monday.`, { body: article(p, 8) })),
      st('i', 'India’s protest leaders freed, vow to continue demonstrations', 'Leaders of an Indian youth movement were freed and vowed to continue protests. The movement wants the election chief to resign.', { body: article('Delhi', 8) }),
    ];
    const ep = await write(stories, program, { depth: 2 });
    for (const s of ep.segments) assert.ok(!/\bindia’s\b/.test(s.text || ''), s.text);
  });
});

describe('what the fourth reading showed (2)', () => {
  test('a lead phrase is never kept alone: the method goes, the finding stays', () => {
    const t = 'By combining machine learning with advanced computer simulations, researchers at the Indian Institute of Science identified 9,389 individual reactions occurring on a copper catalyst, revealing unexpected chemical pathways that conventional models had missed.';
    const out = compressSentence(t, 22, { min: 8 });
    assert.ok(out && out.every((x) => !/^By combining/.test(x)), JSON.stringify(out));
    assert.ok(out.join(' ').includes('identified 9,389 individual reactions'), JSON.stringify(out));
    assert.equal(trimClause('In a remote valley near the border, rescuers found two climbers who had been missing for a week after a storm.', 8, 4), null);
  });

  test('THE CATCH is never answered by a speaker nobody named; trade secrets are no TRADE story', async () => {
    const program = { id: 'tech-bytes', title: 'TECH BYTES', stories: 1, maxChats: 3, chats: { after: ['lead'] } };
    const summary = 'A startup has built sensors that keep wildlife away from runways. “We have taught machines to be brilliant, but only inside the environments we engineered for them,” she said. The devices cost $5,000 each.';
    const ep = await write([st('w', 'Startup builds sensors to keep wildlife off runways', summary, { category: 'tech' })], program);
    assert.ok(!ep.segments.some((s) => s.type === 'chat' && /she said/.test(s.text)), ep.segments.map((s) => s.text).join('\n'));
    assert.notEqual(topicOf({ title: 'Judge orders OpenAI to turn over hiring records', summary: 'Apple accuses former employees of taking trade secrets.', category: 'tech' }), 'TRADE');
  });

  test('"All three are…" never opens a story', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 0 };
    const seg = (await write([st('a', 'Judge orders OpenAI to turn over hiring records', 'All three are former Apple employees. A federal judge ruled that Apple can see OpenAI’s interview records for three of its former staff.', { category: 'tech' })], program)).segments.find((s) => s.type === 'story');
    assert.ok(!/^(?:\[[^\]]*\]\s*)*All three/.test(seg.text), seg.text);
  });
});

describe('WORLD WEATHER at its length on real data', () => {
  test('a third GDACS warning is said; without the moving sky the strongest gusts go to their own zone', async () => {
    const { WeatherDesk } = await import('../server/weather.js');
    const { writeWeather } = await import('../server/weatherwriter.js');
    const report = await new WeatherDesk({ source: 'fixture', log: { info() {}, warn() {}, error() {} } }).report();
    const w0 = report.warnings[0] || { id: 'w0', type: 'flood', label: 'FLOOD', level: 'orange', lat: 10, lon: 10, country: 'Chad', countries: ['Chad'] };
    const warnings = [0, 1, 2].map((i) => ({ ...w0, id: `w${i}`, type: 'flood', name: null, country: ['Chad', 'Niger', 'Mali'][i], countries: [['Chad', 'Niger', 'Mali'][i]], level: 'orange' }));
    const city = report.zones[0].cities[0];
    const zones = report.zones.map((z, k) => (k ? z : { ...z, cities: z.cities.map((c) => (c === city ? { ...c, today: { ...c.today, gust: 72 } } : c)) }));
    const ep = writeWeather({ ...report, sky: null, warnings, zones }, { seed: 'g' });
    assert.equal(ep.segments.filter((s) => s.kind === 'warning').length, 3);
    const zone = ep.segments.find((s) => s.kind === 'zone' && s.zone === report.zones[0].id);
    assert.ok(new RegExp(`${city.say}[^.]*gust|gust[^.]*72`).test(zone.text) && /72 kilometres an hour/.test(zone.text), zone.text);
    const words = ep.segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
    assert.ok(words < 780, `${words} words`);
  });
});

describe('what the fourth reading showed (3)', () => {
  test('the number of the day is never a unit of a ratio, nor a figure only a sentence too long to say carries', async () => {
    const program = { id: 'money-minute', title: 'MONEY MINUTE', stories: 3, maxChats: 0, features: ['number'], targetSeconds: [240, 360] };
    const stories = [
      st('l', 'Bank of Canada holds rates at 3.5 percent', 'The Bank of Canada has kept its main interest rate unchanged at 3.5 percent.', { category: 'business' }),
      st('r', 'More part-time bosses could narrow the pay gap', 'For every $1 a man makes, a woman in a senior role makes 88 cents, the study found. More part-time bosses could keep women in leadership.', { category: 'business' }),
      st('m', 'Motor finance scandal pushes auction towards Startline', 'One of Britain’s biggest independent car finance providers is being put up for sale as the industry awaits the outcome of appeals against the City watchdog’s £9bn compensation scheme.', { category: 'business' }),
    ];
    const ep = await write(stories, program, { depth: 1 });
    const num = ep.segments.find((s) => /Our number of the day/.test(s.text || ''));
    if (num) {
      assert.ok(!/Our number of the day: \$1\./.test(num.text), num.text);
      const said = num.text.match(/Our number of the day: ([^.]*(?:\.\d[^.]*)?)\./)[1].match(/\d[\d.,]*/)[0];
      assert.ok(num.text.slice(num.text.indexOf('Our number of the day') + 25).includes(said), num.text);
    }
  });

  test('a quotation’s speaker is a name, never a title alone', () => {
    const info = study(st('q', 'Physicists find a property of light', 'Researchers found that light can develop handed patterns. “Our work shows that light can naturally develop this handed behavior all on its own,” said Dr.'));
    assert.ok(!info.quote || !/^(?:the\s+)?Dr\.?$/i.test(info.quote.by), JSON.stringify(info.quote));
  });
});

describe('IN THEIR WORDS names its speaker cleanly', () => {
  test('a role never carries the words before the title; a courtesy title and a surname is a name', async () => {
    const { speakerProfile, provenanceLine } = await import('../server/guests/restage.js');
    const li = speakerProfile('Stella Li', 'Shares rose. According to vice-president Stella Li, the firm will grow.');
    assert.equal(li.role, 'vice-president');
    const rutte = speakerProfile('Mark Rutte', 'NATO allies agreed, according to secretary general Mark Rutte, who spoke on Monday.');
    assert.equal(rutte.role, 'secretary general');
    assert.equal(speakerProfile('Alexus Grynkewich', 'Air Force General Alexus Grynkewich said Russia would fail.').role, 'Air Force General');
    const dr = speakerProfile('Dr Hausfather', 'Dr Hausfather said the data was clear.');
    assert.equal(dr.name, 'Dr Hausfather');
    assert.ok(!/the Dr/.test(provenanceLine({ id: 'x', name: dr.name, role: dr.role }, 'BBC News', 's')));
  });
});

describe('what the last reading showed', () => {
  test('a headline with its verb is never given another; Roman Abramovich is no HISTORY, TV networks no GADGETS', () => {
    const info = study(st('f', 'Father was asked for DNA test to get a passport for his daughter', 'A father was asked for a DNA test to get his daughter a passport.'));
    assert.ok(!/was have been|was has been/.test(spokenTitle(info.s.title, info)), spokenTitle(info.s.title, info));
    assert.notEqual(topicOf({ title: 'Roman Abramovich aides falsified paperwork to disguise assets', summary: '', category: 'world' }), 'HISTORY');
    assert.equal(topicOf({ title: 'Roman fort found in Wales', summary: '', category: 'science' }), 'HISTORY');
    assert.notEqual(topicOf({ title: 'Justice Department investigates TV networks', summary: '', category: 'business' }), 'GADGETS');
  });

  test('a subordinate clause alone is no sentence, whatever list its dashes hold', () => {
    const info = study(st('w', 'Justice Department investigates TV networks', 'The Justice Department is reviewing a decision by five networks. While the five networks — ABC, CBS, CNN, NBC and Fox News — did not comment. The administration stripped passes from 70 journalists.'));
    assert.ok(!info.sentences.some((t) => /^While the five networks/.test(t)), info.sentences.join(' | '));
  });
});

describe('what the last reading showed (2)', () => {
  test('a title-case headline is never made a future; entities are characters; an ancient wreck is history; a university is no school', async () => {
    const { decodeEntities } = await import('../server/providers/mock.js');
    const nasa = study(st('n', 'NASA Develops Batteries to Power Humanity’s Return to Moon', 'A team of NASA researchers is working on batteries for the Moon.', { category: 'science' }));
    assert.ok(!/ are to | is to /.test(spokenTitle(nasa.s.title, nasa)), spokenTitle(nasa.s.title, nasa));
    assert.equal(decodeEntities('amyloid beta (A&beta;) and R&amp;D'), 'amyloid beta (A beta) and R&D');
    assert.notEqual(topicOf({ title: "World's oldest shipwreck found off coast of Turkey", summary: 'Archaeologists say the wreck is up to 4,700 years old.', category: 'science' }), 'ACCIDENTS');
    assert.notEqual(topicOf({ title: 'Cornell scientists identify rare genetic disorder in cats', summary: 'Researchers at Cornell University found two cats with Marfan syndrome.', category: 'science' }), 'EDUCATION');
  });

  test('"Though it remained offshore, the storm…" never opens a story', async () => {
    const program = { id: 'cosmos', title: 'COSMOS DESK', stories: 1, maxChats: 0 };
    const seg = (await write([st('h', 'Hurricane Simon passes close to the Mexican coast', 'Though it remained offshore, the storm lashed coastal areas with high winds. Hurricane Simon passed close to the Mexican coast as a category 4 storm on October 11, NASA said.', { category: 'science' })], program)).segments.find((s) => s.type === 'story');
    assert.ok(!/^(?:\[[^\]]*\]\s*)*Though it/.test(seg.text), seg.text);
  });
});

describe('what the last reading showed (3)', () => {
  test('a place is never given a first name; a sentence’s first words are no one’s name; a WHAT WE KNOW point has a subject', async () => {
    const { knownPoints } = await import('../server/providers/mock.js');
    const program = { id: 'cosmos', title: 'COSMOS DESK', stories: 1, maxChats: 0 };
    const body = 'Natural Resources Wales said it was concerned by long-range forecasts. Wales has seen a series of major floods in recent years. Friends Malcolm Butcher, 82, and Jim Tyler, 81, said they had never seen anything like it. “It was absolutely raging,” Malcolm said.';
    const seg = (await write([st('w', 'Prepare for the unthinkable warning over autumn flooding', 'People are being told to prepare for the unthinkable as flood teams warn of a heightened risk this autumn.', { body, category: 'science' })], program, { depth: 2 })).segments.find((s) => s.type === 'story');
    assert.ok(!/Resources Wales has seen|Friends Malcolm/.test(seg.text), seg.text);
    const pts = knownPoints(['Those living in flood-hit areas say they are worried, and have started preparing.', 'Those living in flood-hit areas told BBC Wales they were worried, and had started preparing.', 'More than 274,500 homes are at risk of flooding.']);
    assert.ok(!pts.some((p) => /^(?:Have|Had) started/.test(p)), JSON.stringify(pts));
    assert.equal(topicOf({ title: 'Orangutans released back into Borneo forest after devastating fires', summary: 'Eight orangutans were rescued from fires.', category: 'science' }), 'WILDLIFE');
  });
});

describe('a quotation is said by whoever the source says said it', () => {
  test('a quotation that ends its sentence is not given to the speaker of the next one', async () => {
    const { quotesIn } = await import('../server/facts.js');
    const text = 'The following day, the Times quoted a government source as saying: “Andrew Bailey needs to focus on doing his job.”\nMiller said the Treasury adopting an assumption risked the chancellor’s credibility.';
    assert.equal(quotesIn(text)[0].by, null);
    assert.equal(quotesIn('“We waited ten years for this line,” the mayor said.')[0].by, 'the mayor');
    const info = study(st('q', 'Budget will be a work of fiction without a clear plan, says IFS', 'The IFS said the budget needed a plan.', { body: text }));
    assert.ok(!info.quote || info.quote.by !== 'Miller', JSON.stringify(info.quote));
  });
});

describe('one correspondent, one link', () => {
  test('a third cross never gives a correspondent a second link in the same edition', async () => {
    const channel = loadChannel();
    const program = { id: 'world-now', ...channel.programs['world-now'], moreStories: 0 };
    const presenters = { A: { id: 'paco', name: 'Paco Pixel' }, B: { id: 'lola', name: 'Lola Byte' }, ...Object.fromEntries(['rhea', 'vic', 'mika'].map((id) => [id, { id, ...channel.presenters[id] }])) };
    const PLACES = ['Lisbon', 'Nairobi', 'Madrid', 'Lagos', 'Paris', 'Accra', 'Berlin', 'Dakar', 'Rome', 'Tunis', 'Vienna', 'Cairo', 'Oslo', 'Athens'];
    const WHAT = ['bridge', 'tunnel', 'stadium', 'dam', 'port', 'airport', 'museum', 'hospital', 'market', 'school', 'library', 'station', 'pier', 'tower'];
    const VERB = ['closes', 'reopens', 'inspects', 'repairs', 'expands', 'sells', 'rebuilds', 'opens', 'shuts', 'renames', 'insures', 'audits', 'restores', 'moves'];
    const many = PLACES.map((p, i) => st(`e${i}`, `${p} ${VERB[i]} its ${WHAT[i]} after a ${['storm', 'fire', 'audit', 'vote'][i % 4]}`, `Officials in ${p} say the ${WHAT[i]} work follows a ${['storm', 'fire', 'audit', 'vote'][i % 4]} last month. Residents were told on Monday.`, { body: article(p, 10), category: 'world' }));
    const ep = extractJson((await createMockProvider().generate({ stories: many, channelName: 'TEST', presenters, program, count: program.stories, depth: 3 })).text);
    // (every place is on the Europe and Africa desk: one correspondent, so two links at most, never a third)
    const linked = ep.segments.filter((s) => s.type === 'story' && s.cross);
    assert.ok(linked.length >= 1 && linked.length <= 2, `${linked.length} links`);
  });
});

describe('a live page only to keep a programme at its fewest stories', () => {
  test('with enough other stories, a live page’s unquoted speech never airs in the presenter’s voice', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 6, minStories: 4, maxChats: 0 };
    const stories = [
      st('lv', 'Burnham to urge MPs to embrace closer ties with EU – live', 'Zia Yusuf is speaking now. This is a moral outrage, and it is a direct result of decisions made by Tory and Labour governments.', { live: true }),
      st('a', 'Lisbon closes a road bridge after cracks found', 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.'),
      st('b', 'Nairobi floods cut off two districts', 'Heavy rain in Nairobi has cut off two districts, the city says.'),
      st('c', 'Lima opens a new metro line', 'Lima has opened a new metro line linking the airport to the centre.'),
      st('d', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'),
      st('e', 'Hanoi plants ten thousand trees', 'Hanoi has planted ten thousand trees along its river, the city says.'),
    ];
    const ep = await write(stories, program);
    assert.ok(!ep.segments.some((s) => /moral outrage/.test(s.text || '')), ep.segments.map((s) => s.text).join('\n'));
  });
});

describe('a question about what came before never opens; war drones are no "And finally"', () => {
  test('"How many have been killed is unclear…" never opens a story; drones on a battlefield are CONFLICT', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 0 };
    const summary = 'How many have been killed is unclear, but experts have warned the toll is likely to be huge. Indonesia is among the countries worst affected by fire in El Niño years, the government says.';
    const seg = (await write([st('w', 'Indonesia wildfire razes almost 300 homes', summary)], program)).segments.find((s) => s.type === 'story');
    assert.ok(!/^(?:\[[^\]]*\]\s*)*How many have been killed/.test(seg.text), seg.text);
    assert.equal(topicOf({ title: 'Both Russia, Ukraine are using AI-powered drones', summary: '', category: 'world' }), 'CONFLICT');
  });
});

describe('the last two from the final reading', () => {
  test('a speaker is never a clause’s words; a verb anywhere before "to" keeps a headline from becoming a future', async () => {
    const { quotesIn } = await import('../server/facts.js');
    assert.equal(quotesIn('The minister described it as a threat but said: “One would hope that Interpol wouldn’t necessarily take action.”')[0].by, null);
    const info = study(st('i', 'UK asks Interpol to reject Argentina’s ‘politically motivated’ requests for Falklands oil arrests', 'The UK has asked Interpol to reject the requests.'));
    assert.ok(!/ is to reject/.test(spokenTitle(info.s.title, info)), spokenTitle(info.s.title, info));
    const plain = study(st('j', 'UK to strengthen cyber defences as minister calls for safety', 'The UK will strengthen its cyber defences.'));
    assert.match(spokenTitle(plain.s.title, plain), /^(?:The )?UK is to strengthen/);
  });
});

describe('a quotation of several sentences stays the speaker’s', () => {
  test('the sentences after a quotation’s first are never told as the outlet’s, and a paragraph starts outside any quotation', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 0 };
    const body = [
      'At a rally on Tuesday, the governor hailed the plan to buy gas from the pipeline.',
      '“The city has just agreed to buy 30% of the gas for the next 20 years,” the governor said. “That guarantees success. It is one of the biggest commitments in history for anything. It is one of the biggest deals ever made.”',
      'State engineers expect construction of the 800 miles of line to take seven years.',
    ].join('\n');
    const story = st('q', 'Juneau plans to buy gas from the Alaska pipeline', 'Juneau plans to buy gas from the Alaska pipeline project, the governor says.', { body });
    const ep = await write([story], program, { depth: 3 });
    const told = ep.segments.map((s) => String(s.text || '').replace(/“[^”]*”/g, '')).join('\n');
    assert.ok(!/biggest (?:commitments|deals)|guarantees success/.test(told), told);
    assert.ok(!study(story, { cap: 30 }).sentences.some((t) => /biggest|guarantees/.test(t)));
    assert.ok(study(story, { cap: 30 }).sentences.some((t) => /800 miles/.test(t)));
    // (a quotation whose closing mark the page lost ends with its paragraph)
    const lost = { ...story, body: body.replace('ever made.”', 'ever made.') };
    assert.ok(study(lost, { cap: 30 }).sentences.some((t) => /800 miles/.test(t)));
    assert.ok(!study(lost, { cap: 30 }).sentences.some((t) => /biggest/.test(t)));
  });
});

describe('an outlet’s promotion, a podcast and a verdict', () => {
  test('"Get our breaking news email…" is page furniture and never opens a story; a podcast’s title and a headline’s verdict are features', async () => {
    const { dropPageFurniture } = await import('../server/transcript.js');
    const promo = 'Study authors say the rise has several causes. Get our breaking news email , free app or daily news podcast. The sexual assault of children has risen sharply since the pandemic.';
    assert.ok(!/Get our/.test(dropPageFurniture(promo)), dropPageFurniture(promo));
    assert.match(dropPageFurniture(promo), /sexual assault of children/);
    const STORY = { id: 'p1', title: 'Museum theft suspects freed on bail', summary: 'Get our breaking news email , free app or daily news podcast.', source: 'Ledger Line', category: 'world', image: null };
    const OTHER = { id: 'p2', title: 'Lisbon closes a road bridge after cracks found', summary: 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.', source: 'Ledger Line', category: 'world', image: null };
    const ep = normalizeBulletin(
      {
        title: 'T',
        segments: [
          { type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening.' },
          { type: 'story', storyId: 'p1', anchor: 'A', emotion: 'neutral', headline: STORY.title, text: 'They were released on bail a day later.' },
          { type: 'story', storyId: 'p2', anchor: 'B', emotion: 'neutral', headline: OTHER.title, text: 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.' },
          { type: 'outro', anchor: 'A', emotion: 'neutral', text: "That's WORLD NOW." },
        ],
      },
      [STORY, OTHER],
      { program: { id: 'world-now', title: 'WORLD NOW', stories: 1 }, presenters: DUO, maxStories: 5 }
    );
    assert.ok(!ep.segments.some((s) => /Get our|newsletter|free app/.test(s.text || '')), ep.segments.map((s) => s.text).join('\n'));
    const program = { id: 'money-minute', title: 'MONEY MINUTE', stories: 4, maxChats: 0 };
    const stories = [
      st('a', 'Trump rewards Putin and betrays Ukraine with Russia diesel deal - The Latest', 'Donald Trump’s deal to buy Russian diesel has been met with fury from Volodymyr Zelenskyy.'),
      st('b', 'Hegseth’s dubious low-T screening may flag up to 25 percent of the Army', 'Medical experts recommend against blanket screenings.'),
      st('c', 'Lisbon closes a road bridge after cracks found', 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.'),
      st('d', 'Nairobi floods cut off two districts', 'Heavy rain in Nairobi has cut off two districts, the city says.'),
      st('e', 'Lima opens a new metro line', 'Lima has opened a new metro line linking the airport to the centre.'),
      st('f', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'),
    ];
    const told = (await write(stories, program)).segments.map((s) => s.text || '').join('\n');
    assert.ok(!/betrays Ukraine|dubious/.test(told), told);
    assert.deepEqual(stories.map((x) => !!study(x).column), [true, true, false, false, false, false]);
  });
});

describe('the lint hears a speaker’s words told as ours', () => {
  test('a sentence from inside a quotation of several sentences, told in a presenter’s voice, is flagged; the same words in IN THEIR WORDS are not', async () => {
    const { lintEdition, quoteInterior } = await import('../tools/lengths/lint.mjs');
    const body = 'At a rally, Trump hailed the deal.\n“Taiwan has just agreed to buy 30% of the gas,” Trump said. “That guarantees success. It’s one of the biggest commitments in history for anything. It’s one of the biggest deals ever made.”\nThe ministry said talks would go on.';
    const inside = quoteInterior(body);
    assert.equal(inside.length, 2);
    const ep = (type, extra = {}) => ({ program: { id: 'world-now' }, segments: [{ type: 'intro', text: 'Hello.' }, { type, storyId: 'x', text: 'Taiwan plans to buy gas from Alaska. It’s one of the biggest commitments in history for anything, ABC News reports.', ...extra }] });
    assert.ok(lintEdition(ep('story'), () => null, inside).some((f) => f.cls === 'speaker-words'));
    assert.ok(!lintEdition(ep('cross', { kind: 'restage' }), () => null, inside).some((f) => f.cls === 'speaker-words'));
    // (read with its marks, a quotation of several sentences is the speaker's, not ours)
    const quoted = { program: { id: 'world-now' }, segments: [{ type: 'intro', text: 'Hello.' }, { type: 'story', storyId: 'x', text: 'As Trump put it: “That guarantees success. It’s one of the biggest commitments in history for anything.” The ministry said talks would go on.' }] };
    assert.ok(!lintEdition(quoted, () => null, inside).some((f) => f.cls === 'speaker-words'));
  });
});

describe('a re-staged quotation of several sentences', () => {
  test('all of it leaves the presenter’s text, to its closing mark', async () => {
    const Q = 'This line will change how people move around the old town. It is the biggest project in the city’s history';
    const text = `The city opened a new tram line on Monday. “${Q},” the mayor said. Trams run every ten minutes.`;
    const stories = new Map([['t1', { id: 't1', title: 'New tram line opens in the old town', summary: text }]]);
    const episode = {
      segments: [
        { type: 'intro', anchor: 'A', text: 'Hello.' },
        { type: 'story', anchor: 'A', emotion: 'neutral', storyId: 't1', headline: stories.get('t1').title, source: 'Pixelburg Post', category: 'world', hasImage: false, cues: [], quote: { text: Q, by: 'the mayor' }, text },
        { type: 'outro', anchor: 'A', text: 'Goodbye.' },
      ],
      correspondents: { R1: 'rhea' },
      storyIds: ['t1'],
    };
    const producer = new Producer({ config: { restage: true }, newsDesk: { get: (id) => stories.get(id) }, chain: null, audit: () => {}, log: { info() {}, warn() {}, error() {} } });
    const ctx = { program: { id: 'world-now', restage: 1 }, presenters: { A: { id: 'paco' } }, episode };
    assert.equal((await producer.guests(ctx)).restaged, 1);
    const story = ctx.episode.segments.find((s) => s.type === 'story');
    assert.ok(!/biggest project|old town/.test(story.text), story.text);
    assert.match(story.text, /Trams run every ten minutes\. .*Pixelburg Post/);
    // (and one whose first sentence is shorter than five words, read with "As … put it:")
    const Q2 = 'It opens today. It is the biggest project in the city’s history';
    const text2 = `The city opened a new tram line on Monday. As the mayor put it: “${Q2}.” Trams run every ten minutes.`;
    stories.set('t1', { ...stories.get('t1'), summary: text2 });
    const ctx2 = { program: { id: 'world-now', restage: 1 }, presenters: { A: { id: 'paco' } }, episode: { ...episode, segments: episode.segments.map((s) => (s.type === 'story' ? { ...s, text: text2, quote: { text: Q2, by: 'the mayor' }, link: undefined, linkKind: undefined } : s.type === 'cross' ? null : s)).filter(Boolean), correspondents: { R1: 'rhea' } } };
    assert.equal((await producer.guests(ctx2)).restaged, 1);
    const story2 = ctx2.episode.segments.find((s) => s.type === 'story');
    assert.ok(!/biggest project|opens today/.test(story2.text), story2.text);
  });
});

describe('a headline that addresses its reader is news', () => {
  test('"your" and "you" make no column; "I" and "we" in the outlet’s voice do, and "we" after "says" is the speaker’s', async () => {
    const { columnVoice } = await import('../server/providers/mock.js');
    for (const t of ['Google wants to host your personal vibe-coded apps in the Play Store', 'Former Plaud exec raises $26M for AI app that listens to you in the background', 'Facebook will let you customize your feed algorithm using AI', 'Cerebras CEO says we’re nearing a future where everyone has a personal AI assistant at home', 'US trade office raises tariffs on steel']) {
      assert.equal(columnVoice(t), false, t);
      assert.equal(!!study(st('x', t, 'A short summary of the news.')).column, false, t);
    }
    for (const t of ['I don’t miss the camera on the Ray-Ban Meta Audio glasses', 'We tried the new Pixel and it is fast', 'Here’s why the new tablet matters', 'My week with a folding phone']) assert.equal(columnVoice(t), true, t);
  });
});

describe('cards that mislead', () => {
  test('no card for the count of a ratio, a model number before "not", or a name after an age', async () => {
    const { extractFigures } = await import('../server/facts.js');
    const facts = (t) => extractFigures(t, 5).map((f) => f.fact);
    assert.ok(!facts('One in 10 scams reported to Citizens Advice relate to fraudsters charging for work not done.').some((f) => /10 SCAMS/.test(f)));
    assert.ok(!facts('The Maia 300 not only sold well but won an award.').some((f) => /NOT/.test(f)));
    assert.ok(!facts('Police identified the victim as 42-year-old Hassan Jihad Ibn Kariem of Atlanta.').some((f) => /HASSAN/.test(f)));
    assert.ok(facts('In the year to August the service received 9,000 complaints about roofing work.').some((f) => /9,000 COMPLAINTS/.test(f)));
  });
});

describe('kickers from what a story is about, round 4', () => {
  test('hospitality, operations, a rescue bid, a firing squad, a diesel deal and sexual violence', () => {
    const k = (title, summary = '', category = 'world') => topicOf({ title, summary, category });
    assert.notEqual(k('F1 champion Norris revs up with stake in premium tickets platform Seat Unique', 'Lando Norris has joined the share register of Seat Unique, the premium ticketing and hospitality platform.', 'business'), 'HEALTH');
    assert.notEqual(k('MI5 chief warns of threats to UK from Russia', 'Sir Ken McCallum says operations to tackle terrorism and state threats are now of an equal scale.'), 'CULTURE');
    assert.notEqual(k('Poundstretcher owner withdraws rescue bid for rival Poundland', '', 'business'), 'RESCUE');
    assert.equal(k('Man rescued from cave on Sardinia after being trapped by rockslide'), 'RESCUE');
    assert.equal(k('Archbishop of US military condemns Pentagon plans to livestream execution'), 'JUSTICE');
    assert.equal(k('Trump rewards Putin and betrays Ukraine with Russia diesel deal', '', 'business'), 'ENERGY');
    assert.equal(k('Family and sexual violence rates against Australian children rise sharply'), 'CRIME');
    assert.equal(k('Citroën unveils electric version of its classic 2CV car'), 'MOTORING');
  });
});

describe('what reading the last replay showed', () => {
  test('deals and offers are promotions; a teaser and "I Am…" are features; "has to do" keeps its verb', async () => {
    for (const title of ['$15 gets you Psychonauts 2, the latest Like a Dragon game, and more', 'Save 50% on your TechCrunch Disrupt 2026 ticket and join last two days', 'Nothing Headphone A are half off today']) {
      const program = { id: 'tech-bytes', title: 'TECH BYTES', stories: 3, maxChats: 0 };
      const told = (await write([st('p', title, 'There are several offers this week.'), st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'), st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'), st('c', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.')], program)).segments.map((s) => s.text || '').join(' ');
      assert.ok(!/gets you|Save 50%|half off|several offers/.test(told), told);
    }
    assert.equal(!!study(st('t', 'They war-gamed dimming the Sun. It went even worse than you think.', 'A simulation.')).column, true);
    assert.equal(!!study(st('i', 'I Am Artemis: Allison Mjoen', 'A profile.')).column, true);
    const info = study(st('n', "What ice cream has to do with this year's Nobel Prize", 'The prize was announced on Monday.'));
    assert.ok(!/has are/.test(spokenTitle(info.s.title, info)), spokenTitle(info.s.title, info));
  });

  test('an ask with no answer after it never airs', () => {
    const A = { id: 'w1', title: 'Fitbit Edge goes on sale with a brighter screen', summary: 'Google is releasing its second Fitbit tracker of the year. The Edge has a brighter screen than the Charge 6.', source: 'Ledger Line', category: 'tech', image: null };
    const B = { id: 'w2', title: 'Lisbon closes a road bridge after cracks found', summary: 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.', source: 'Ledger Line', category: 'tech', image: null };
    const ep = normalizeBulletin(
      {
        title: 'T',
        segments: [
          { type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening.' },
          { type: 'story', storyId: 'w1', anchor: 'A', emotion: 'neutral', headline: A.title, text: 'Google is releasing its second Fitbit tracker of the year.' },
          { type: 'chat', anchor: 'B', emotion: 'neutral', text: 'Walk me through how it works.' },
          { type: 'story', storyId: 'w2', anchor: 'B', emotion: 'neutral', headline: B.title, text: 'Lisbon has closed a major road bridge after inspectors found cracks in its steel deck.' },
          { type: 'outro', anchor: 'A', emotion: 'neutral', text: "That's TECH BYTES." },
        ],
      },
      [A, B],
      { program: { id: 'tech-bytes', title: 'TECH BYTES', stories: 2 }, presenters: DUO, maxStories: 5 }
    );
    assert.ok(!ep.segments.some((s) => /Walk me through/.test(s.text || '')), ep.segments.map((s) => `${s.type}: ${s.text}`).join('\n'));
  });
});

describe('round 5: the coherence gate', () => {
  test('a lifted sentence that leans on what was never said is caught, by rule; one that stands is not', async () => {
    const { untold } = await import('../server/coherence.js');
    // (the real lines of WORLD NOW 14 Oct 07:10 and others, with what the programme had said of their story)
    assert.equal(untold('the department did not directly answer those questions.', 'Video recording device found in cabin of HMAS Leeuwin navy ship. The department confirmed a device had been found.'), 'demonstrative');
    assert.equal(untold('The temporary shutdown disrupted oil exports and increased risks for the energy markets.', 'Saudi Arabia is under pressure. Drones severely damaged the Saudi East-West oil pipeline.'), 'definite');
    assert.equal(untold('In a second attack on Sunday, the militia killed another civilian and injured 11 others.', 'Houthi attacks on airports and energy facilities are putting Saudi Arabia under pressure.'), 'sequel');
    assert.equal(untold('In early September, drones also severely damaged the Saudi East-West oil pipeline.', 'Saudi Arabia is under pressure from Houthi attacks.'), 'also');
    assert.equal(untold('Many residents here raise sheep and goats beside homes made from corrugated metal.', 'Palestinians in the West Bank.'), 'here');
    assert.equal(untold('The last stint was in 2018, The Guardian reports.', 'Man who died was a father and educator.'), 'sequel');
    assert.equal(untold('The two were unharmed in the incident.', 'Kariem and his daughter survived a car fire.'), 'definite');
    assert.equal(untold('The incident was captured in souvenir photos, the witness added.', 'One person has died on a rollercoaster.'), 'definite');
    assert.equal(untold('The girl’s body was swelling and she needed medical help.', 'A Thai court case.'), 'person');
    // (said before, in its own order, or a count that carries its own first: no lean)
    assert.equal(untold('The government asked these questions in parliament.', 'MPs asked questions about the device.'), null);
    assert.equal(untold('Russian ballistic missiles struck Kyiv for a second consecutive day without advance warning.', 'Kyiv hit by Russian ballistic missiles'), null);
    assert.equal(untold('Atletico and Man United are set to clash for only the fifth time in history.', 'Atletico host Man United'), null);
    assert.equal(untold('The government will also consider using the bill for AI safety rules.', 'The government plans a cyber security law.'), null);
    assert.equal(untold('In a second attack on Sunday, the militia killed another civilian.', '', { prevSaid: true }), null);
    assert.equal(untold('Few phones have been more anticipated than a foldable iPhone, but it is finally here.', ''), null);
    assert.equal(untold('Officials condemned the suspension of the provincial government.', 'Pakistan politics'), null);
  });

  test('the writer never lifts a leaning sentence: not in a story, not in a correspondent’s piece, not as the line kept for an exchange', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 2, crosses: 0 };
    const body = [
      'Houthi attacks on airports and energy facilities are putting Saudi Arabia under pressure.',
      'Saudi Energy Minister Prince Abdulaziz bin Salman Al Saud warned of the consequences for energy security.',
      // (each leaning line follows one the writer never tells, a sentence with brackets: its own order is not heard)
      'Officials (speaking anonymously) gave few details.',
      'In a second attack on Sunday, the militia killed another civilian and injured 11 others.',
      'Officials (speaking anonymously) gave no figures.',
      'The temporary shutdown disrupted oil exports and increased risks for the energy markets.',
      'Many residents here say they no longer feel safe at the airport.',
      'Saudi Arabia is targeting Houthi missile launch pads, according to a report by a US think tank.',
      'Reporters (from several outlets) asked about the cost.',
      'The department did not directly answer those questions.',
      'The kingdom has asked its allies for more air defence systems to protect its cities and oil fields.',
    ].join('\n');
    for (const depth of [0, 3]) {
      const ep = await write([st('h', 'Saudi Arabia’s military struggle against Houthi attacks', 'Houthi attacks on airports and energy facilities are putting Saudi Arabia under pressure.', { body })], program, { depth });
      const told = ep.segments.map((s) => s.text || '').join('\n');
      assert.ok(!/second attack|temporary shutdown|residents here|those questions/.test(told), told);
    }
  });

  test('a surname with its particle is introduced by the whole name the article gives, or the sentence goes', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 0 };
    const body = [
      'Palestinians in the occupied West Bank see little prospect that the election will change their lives.',
      '“They treat us like something that doesn’t exist,” said Atallah al-Jahalin, the community’s representative.',
      'Residents face constant pressure from soldiers and settlers, al-Jahalin said, on top of repeated demolitions.',
    ].join('\n');
    const ep = await write([st('w', '‘Like we don’t exist’: Palestinians in West Bank denied say', 'Palestinians in the occupied West Bank see little prospect that the election will change their lives.', { body })], program, { depth: 3 });
    const told = ep.segments.map((s) => s.text || '').join('\n');
    assert.ok(!/(?<!Atallah )al-Jahalin/.test(told), told);
  });
});

describe('round 5: name cards', () => {
  test('a name is never cut and a role is never two roles glued; a quote card keeps its speaker’s name whole', async () => {
    const { peopleWithRoles } = await import('../server/boards.js');
    const people = peopleWithRoles('Houthi attacks are putting Saudi Arabia under pressure. Saudi Energy Minister Prince Abdulaziz bin Salman Al Saud warned of the consequences. US President Donald Trump said talks would go on.');
    assert.deepEqual(people, [{ name: 'Abdulaziz bin Salman Al Saud', role: 'SAUDI ENERGY MINISTER' }, { name: 'Donald Trump', role: 'US PRESIDENT' }]);
    assert.deepEqual(peopleWithRoles('King Charles met Prime Minister Keir Starmer on Tuesday.'), [{ name: 'Charles', role: 'KING' }, { name: 'Keir Starmer', role: 'PRIME MINISTER' }]);
    const { clipSpeaker } = await import('../server/writer.js');
    assert.equal(clipSpeaker('NASA Administrator Jared Isaacman', 32), 'Administrator Jared Isaacman');
    assert.equal(clipSpeaker('Porsche Chairman Michael Leiters', 32), 'Porsche Chairman Michael Leiters');
  });
});

describe('round 5: the clock with editions as long as the news allows', () => {
  test('a run before a mark is planned halfway between a programme’s estimate and the longest of its recent editions: NEWS IN 60 is never more than 300 s off its mark', async () => {
    const { Station, episodeAir, breakAir, localTime } = await import('../server/station.js');
    const channel = loadChannel();
    // (the lengths the final replay of round 4 made, in its order: a thin desk's TECH BYTES of 127 s next to full ones of 430 s)
    const LENGTHS = {
      'tech-bytes': [302, 325, 127, 404, 191, 432, 215, 435, 398, 458, 417, 409, 444, 416, 309, 395],
      cosmos: [290, 343, 315, 346, 479, 422, 416, 416, 403, 408, 401, 299, 404, 391, 420, 404],
      'world-now': [465, 548, 574, 573, 571, 496, 468, 488, 335, 595, 510, 603, 579, 534, 581, 587],
      'money-minute': [225, 227, 217, 278, 301, 264, 310, 264, 239, 281, 259, 207, 285, 298, 305, 196],
      'news-60': [74, 70, 59, 68, 61, 67, 65, 59, 63, 60, 58, 56, 58, 60, 62, 63],
    };
    const n = {};
    const producer = {
      canProduce: () => true,
      async produce(ch, id) {
        const list = LENGTHS[id];
        const [lo, hi] = ch.programs[id].targetSeconds || [300, 300];
        const air = list ? list[(n[id] = ((n[id] ?? -1) + 1)) % list.length] : (lo + hi) / 2;
        return { kind: 'episode', id: `${id}-${n[id] ?? 0}`, program: { id, title: ch.programs[id].title }, segments: [{ audio: { duration: air - 12 } }] };
      },
    };
    const start = Date.parse('2026-10-12T05:00:00+01:00');
    let now = start;
    const station = new Station({ config: { queueSize: 2, clock: true, now: () => now }, newsDesk: { stories: new Map(), uncovered: () => [], feedStatus: {}, lastRefresh: 0 }, producer, chain: { status: () => [] }, channel: () => channel, log: { info() {}, warn() {}, error() {} } });
    await station.fill();
    const offs = [];
    while (now < start + 24 * 3600_000) {
      const item = station.next();
      assert.ok(item);
      if (item.kind === 'episode' && item.program?.id === 'news-60' && !item.replay) {
        const { minute, second } = localTime(now, 'Europe/London');
        const s = (minute % 30) * 60 + second;
        offs.push(s > 900 ? s - 1800 : s);
      }
      now += (item.kind === 'episode' ? episodeAir(item) : breakAir(item)) * 1000;
      for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
    }
    assert.ok(offs.length >= 46, `${offs.length} bulletins`);
    // (192 s before 18 Oct. The channel's ident before every programme, 6 s each, moves this day's plans: its worst
    // bulletin is now 288 s late, a 485 s COSMOS DESK planned as a shorter one before 08:30. Over 18 simulated days the
    // bulletins more than 192 s off went from 0.8 % to 2.3 %, while those right on the mark went from 30 % to 35 %.)
    assert.ok(Math.max(...offs.map(Math.abs)) <= 300, `worst ${Math.max(...offs.map(Math.abs))} s: ${offs.join(' ')}`);
    assert.ok(offs.filter((x) => Math.abs(x) > 192).length <= 2, `at most two past 192 s: ${offs.join(' ')}`);
  });
});

describe('round 5: the open faults of round 4', () => {
  test('cards: an "about" from another sentence, "20 others"; a France 24 blurb keeps only its first item', async () => {
    const { extractFigures, sourceQualifier } = await import('../server/facts.js');
    const src = 'Scientists may have solved a 2.3-billion-year-old mystery about how Earth kept its oxygen. About 2.3 billion years ago, Earth experienced the Great Oxidation Event.';
    assert.equal(sourceQualifier('2.3-BILLION', src, 'YEAR-OLD MYSTERY'), null);
    assert.equal(sourceQualifier('2.3 BILLION', src, 'YEARS AGO'), 'ABOUT');
    assert.deepEqual(extractFigures('A strike on a grocery store killed three people and injured 20 others, including two children.').map((f) => f.fact).filter((f) => /OTHERS/.test(f)), []);
    const info = study(st('k', 'Kabila launches new coalition with M23', "In tonight's edition, Joseph Kabila has been named leader of a new rebel coalition, vowing to topple the government. Also, Africa's largest ever IPO has been extended. And Formula 1 will return to Africa once a new circuit is built in Rwanda."));
    assert.equal(info.s.summary, 'Joseph Kabila has been named leader of a new rebel coalition, vowing to topple the government.');
  });

  test('page furniture, promotions and features: a hand-over, a start time, a picture described, a job listing, the outlet’s own event, a podcast’s week', async () => {
    const program = { id: 'cosmos', title: 'COSMOS DESK', stories: 1, maxChats: 0 };
    const body = [
      'Hurricane Simon strengthened off the Mexican coast on Saturday, forecasters said.',
      'This nighttime image, acquired with VIIRS on the NOAA-21 satellite, shows atmospheric gravity waves radiating from the hurricane.',
      'Opaque white areas indicate the thickest clouds.',
      'Coverage begins at 9:15 a.m. EDT on NASA+.',
      'Claire Paccalin has the latest.',
      'The hurricane is expected to bring heavy rain to the Mexican coast on Monday, forecasters said.',
    ].join('\n');
    const told = (await write([st('h', 'Hurricane Simon lurks off the Mexican coast', 'Hurricane Simon strengthened off the Mexican coast on Saturday, forecasters said.', { body })], program, { depth: 3 })).segments.map((s) => s.text || '').join(' ');
    assert.ok(!/image|Opaque|Coverage begins|has the latest/.test(told), told);
    assert.match(told, /heavy rain/);
    for (const title of ['Job opportunities: NASA office of general counsel', 'TechCrunch Disrupt 2026 officially kicks off today']) {
      const p2 = { id: 'tech-bytes', title: 'TECH BYTES', stories: 3, maxChats: 0 };
      const out = (await write([st('p', title, 'Apply now for the roles.'), st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'), st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'), st('c', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.')], p2)).segments.map((s) => s.text || '').join(' ');
      assert.ok(!/Job opportunities|Disrupt|Apply now/.test(out), out);
    }
    for (const title of ['This week in science: sea monsters, long COVID patients’ microbiome, elephant carcasses', "'Frankly shocking' risk-taking by motorists uncovered by AI-powered cameras", 'Ocarina of Time remake feels remarkably modern']) assert.equal(!!study(st('f', title, 'A summary.')).column, true, title);
  });

  test('kickers from what a story is about: a cyber-attack, cancer research, a tax fight, Amazon’s Bee, an election as a date, a game’s port, strikes at sea', () => {
    const k = (title, summary = '', category = 'world') => topicOf({ title, summary, category });
    assert.equal(k('French supermarket director apologises', 'A cyber-attack caused refrigeration temperatures to soar. At Intermarché, the attack caused fridge temperatures to reach 27C.', 'business'), 'SECURITY');
    assert.notEqual(k('Protein that fuels cancer could also be key', 'Scientists have found a key to fighting it.', 'science'), 'CONFLICT');
    assert.notEqual(k('Ultra-rich are spending 1m dollars a day fighting California’s proposed billionaire tax', '', 'business'), 'CONFLICT');
    assert.notEqual(k('Amazon’s Bee launches two personal AI devices', 'Amazon-owned Bee has launched its first new AI devices.', 'tech'), 'WILDLIFE');
    assert.notEqual(k('US inflation rises more than expected ahead of midterm elections', 'US inflation rose by more than expected.', 'business'), 'ELECTIONS');
    assert.notEqual(k('Long-lost horror gaming cult classic P.T. gets much-needed PC port', '', 'tech'), 'TRADE');
    assert.equal(k('Bulgaria says Russia likely behind Black Sea strikes as rescue operations continue'), 'CONFLICT');
    assert.equal(k('Heavy fighting in Sudan as RSF advances'), 'CONFLICT');
  });

  test('questions fitted to their answers: a price, who it is for, the catch, what comes next, when we will know more', async () => {
    const { followLine } = await import('../server/experts.js');
    const e = { first: 'Clara', name: 'Clara Meridian' };
    for (let seed = 0; seed < 12; seed++) {
      assert.ok(!/comes next|happens next|watch for|comes after|happens now|know more/.test(followLine(e, `s${seed}`, '“We will, in short, ensure any attack proves futile,” Grynkewich said.', seed)));
      assert.ok(!/know more/.test(followLine(e, `t${seed}`, 'Officials will review the plan.', seed)));
    }
    const program = { id: 'tech-bytes', title: 'TECH BYTES', stories: 2, maxChats: 4 };
    const s1 = st('o', 'Meta launches open-weight AI model that runs on Macs', 'Meta has launched what it calls the most capable open-weight model in the United States. Open-weight models can be significantly more cost-efficient and offer transparency that closed models do not. The model was designed to work with Macs.', { category: 'tech' });
    const s2 = st('n', 'Netflix is laying off around 1,000 employees', 'Netflix is laying off around 1,000 employees. Netflix’s revenue increased to $45.2 billion in 2025 from 325 million subscribers. Most cuts are in product and tech.', { category: 'tech' });
    const told = (await write([s1, s2], program)).segments.map((s) => s.text || '').join('\n');
    assert.ok(!/what will all this cost\?[^\n]*\n[^\n]*cost-efficient/i.test(told), told);
    assert.ok(!/Who is this for, exactly\?[^\n]*\n[^\n]*revenue/i.test(told), told);
  });

  test('names keep their capitals mid-sentence; a toss of two words goes before a hand-over; one company’s news from two outlets is one story; an aside that heads a list stays', async () => {
    const program = { id: 'tech-bytes', title: 'TECH BYTES', stories: 3, maxChats: 0 };
    const stories = [
      st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'),
      st('c', 'Cerebras CEO pushes back on AI doomsday warnings', 'Cerebras Systems CEO Andrew Feldman thinks the doomer narrative is not helping the industry.', { source: 'TechCrunch' }),
      st('f', 'Faisal Islam: What surprise praise for UK economy tells us about the Budget', 'Top IMF officials have praised UK plans to reduce borrowing.', { source: 'BBC Business' }),
      st('d', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'),
    ];
    const intro = (await write(stories, program)).segments.find((s) => s.type === 'intro').text;
    assert.ok(!/\bcerebras CEO|\bfaisal Islam/.test(intro), intro);
    const p2 = { id: 'tech-bytes', title: 'TECH BYTES', stories: 4, maxChats: 0 };
    const pair = [
      st('n1', 'Netflix is laying off around 1,000 employees', 'Netflix is laying off around 1,000 employees, The Verge has learned.', { source: 'The Verge', category: 'tech' }),
      st('n2', 'Netflix to lay off 1,000 staff', 'Netflix is laying off about 6% of its employee base, or close to 1,000 staff.', { source: 'TechCrunch', category: 'tech' }),
      st('x', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'),
      st('y', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'),
      st('z', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.'),
    ];
    const ids = new Set((await write(pair, p2)).segments.filter((s) => s.storyId).map((s) => s.storyId));
    assert.ok(!(ids.has('n1') && ids.has('n2')), [...ids].join(' '));
  });
});

describe('round 5: what reading the round-5 replay showed', () => {
  test('a cut never leaves what someone said without its verb; a quote card is never signed by the end of a sentence', async () => {
    const cut = trimClause("Poland's Prime Minister Donald Tusk said a man accused of plotting an assassination attack against him and his defence minister has been detained.", 16, 6);
    assert.ok(cut === null || /detained/.test(cut), cut);
    const { quotesIn } = await import('../server/facts.js');
    assert.equal(quotesIn('"It is clear that Putin does not read Truth Social," Zelensky noted wryly on Monday. He added: "This winter, if Russia does not agree to an energy ceasefire, we will respond."').at(-1).by, null);
    const { untold } = await import('../server/coherence.js');
    assert.equal(untold('Two others were arrested later, including a British-Iranian national.', 'UK blames Iran for airbase plot.'), 'sequel');
    assert.equal(untold('The men were later released without charge on police bail.', 'UK blames Iran for airbase plot.'), 'person');
    assert.equal(untold('The men were later released without charge on police bail.', 'Three men were arrested near the base.'), null);
  });

  test('"that decision", "something similar", "most were", "the problem": each leans on what was never said', async () => {
    const { untold } = await import('../server/coherence.js');
    assert.equal(untold('The department did not answer questions about that decision.', 'Justice Department sues TV networks'), 'demonstrative');
    assert.equal(untold('The department did not answer questions about that decision.', 'The department announced its decision on Monday.'), null);
    assert.equal(untold('Something similar happened in 2019.', 'Floods hit the valley'), 'sequel');
    assert.equal(untold('Most were female and aged under 30.', 'Clinic sees rise in patients'), 'sequel');
    assert.equal(untold('Older single-glazed windows allow more heat loss, which exacerbates the problem.', 'Energy bills through the roof'), 'definite');
    assert.equal(untold('It is the first such case in a decade.', 'Court jails smuggler'), null);
  });

  test('an advice column’s imperative, an email address and a technical bulletin never air; a story’s plot is no WHAT WE KNOW', async () => {
    const { ownVoice } = await import('../server/providers/mock.js');
    assert.ok(ownVoice('Pick a day when there is a good breeze, and heat the house to its usual temperature.'));
    assert.ok(!ownVoice('Close to 1,000 staff will lose their jobs.'));
    assert.ok(!ownVoice('Start-ups raised more money this quarter.'));
    const program = { id: 'cosmos', title: 'COSMOS DESK', stories: 3, maxChats: 0 };
    const stories = [
      st('tb', 'TB 25-03 Wind tunnel results for the X-66 wing', 'Sills, Langley Research Center, joel.w.sills@nasa.gov Download the PDF version of this bulletin.', { category: 'science', source: 'NASA' }),
      st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.', { category: 'science' }),
      st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.', { category: 'science' }),
      st('c', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.', { category: 'science' }),
    ];
    const told = (await write(stories, program)).segments.map((s) => `${s.headline || ''} ${s.text || ''}`).join('\n');
    assert.ok(!/@|PDF|TB 25-03/.test(told), told);
    const news = { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 0, boards: ['known'] };
    const plot = 'War reduced Japan to zero. Two years have passed since the bombing, and the survivors rebuild Tokyo. A giant monster rises from the sea and attacks the city. The film opens in cinemas in November.';
    const seg = (await write([st('g', 'Godzilla Minus Zero gets its first trailer', 'War reduced Japan to zero, and a giant monster rises from the sea.', { body: plot, category: 'world' })], news, { depth: 2 })).segments.find((s) => s.type === 'story');
    assert.ok(!seg?.known, JSON.stringify(seg?.known));
  });

  test('an acronym keeps its capitals after the outlet’s article; a name’s number with its possessive is no card; deportations are migration', async () => {
    const title = 'UK economy to grow more than expected - but households face sharper rise in inflation, IMF says';
    const s = st('uk', title, 'The International Monetary Fund says the UK economy will grow by 1.3% this year.', { category: 'business' });
    assert.match(spokenTitle(title, study(s)), /^The UK economy is to grow/);
    const { extractFigures } = await import('../server/facts.js');
    assert.ok(!extractFigures("France 24's correspondent in Kyiv said 40 drones were shot down overnight.").some((f) => /^24\b/.test(String(f.value))));
    assert.equal(topicOf({ title: 'Deportees describe their first days back in Guatemala', summary: 'More than 120 people arrived on Tuesday.', category: 'world' }), 'MIGRATION');
  });
});

describe('round 5: the last of the open faults', () => {
  test('a headline that quotes words without saying whose, or holds the outlet’s view of a motive, is never said as ours', async () => {
    const { unsignedTitle } = await import('../server/providers/mock.js');
    assert.ok(unsignedTitle('British and Irish governments ‘should negotiate paramilitary disbandment’'));
    assert.ok(unsignedTitle('Ken Paxton stirs vaccines skpeticism to ingratiate himself with Maha movement'));
    assert.ok(!unsignedTitle('Starmer says Iran plot ‘likely coordinated’'));
    assert.ok(!unsignedTitle('IFS: budget will be ‘work of fiction’ without tax rises'));
    assert.ok(!unsignedTitle("Netflix's new show is a hit"));
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 3, maxChats: 0 };
    const stories = [
      st('q', 'British and Irish governments ‘should negotiate paramilitary disbandment’', 'The British and Irish governments should begin talks on disbanding paramilitary groups, a report by an independent commission has said. The commission said the talks should start within a year.'),
      st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'),
      st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'),
    ];
    const told = (await write(stories, program)).segments.map((s) => s.text || '').join('\n');
    assert.ok(!/governments should negotiate paramilitary disbandment/i.test(told), told);
  });

  test('a sentence that says what figures show takes no outlet’s credit too; an acronym takes the article its outlet gives it', async () => {
    const program = { id: 'money-minute', title: 'MONEY MINUTE', stories: 3, maxChats: 0 };
    const stories = [
      st('v', 'UK van drivers face extra £2.5bn in diesel costs', 'UK van drivers face an extra £2.5bn in diesel costs this year, figures show. Prices at the pump have risen for six weeks.', { source: 'Guardian Business', category: 'business' }),
      st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.', { category: 'business' }),
      st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.', { category: 'business' }),
    ];
    const told = (await write(stories, program)).segments.map((s) => s.text || '').join('\n');
    assert.ok(!/figures show, Guardian Business reports/.test(told), told);
    const iea = st('i', 'IEA warns of oil glut next year', 'The IEA said supply would outpace demand. The IEA expects prices to fall.', { category: 'business' });
    assert.match(spokenTitle(iea.title, study(iea)), /^The IEA has warned/);
    const nasa = st('n', 'NASA launches new weather satellite', 'NASA said the satellite reached orbit. The NASA mission will last ten years.', { category: 'science' });
    assert.match(spokenTitle(nasa.title, study(nasa)), /^NASA has launched/);
    const saudi = st('s', 'Saudi national charged with planting listening device at OpenAI offices', 'A Saudi national has been charged with planting a listening device at OpenAI offices in San Francisco.', { category: 'tech' });
    assert.match(spokenTitle(saudi.title, study(saudi)), /^A Saudi national has been charged/);
  });

  test('a cut never ends on a word that cannot end a clause', () => {
    const t = "The building that houses London's oldest restaurant has been donated to Europe's biggest conservation charity, a move that will, it is hoped, secure one of the U.K. capital's go-to eateries for centuries to come.";
    for (const n of [16, 20, 24]) assert.ok(!/\bwill\.$/.test(trimClause(t, n, 6) || ''), trimClause(t, n, 6));
  });

  test('NEWS IN 60 past its window at its fewest stories says one sentence less: never an item’s first, its credit or its card’s figure; never under the window', () => {
    const producer = new Producer({ config: {}, newsDesk: {}, chain: {}, log: { info() {}, warn() {}, error() {}, debug() {} } });
    const sentence = (n, end = '.') => `Word ${Array.from({ length: n - 2 }, () => 'word').join(' ')} word${end}`;
    const seg = (type, text, extra = {}) => ({ type, anchor: 'A', text, ...extra });
    const ctx = (segments) => ({
      program: { timing: { target: 60, wpm: 170, gap: 0.7, minStories: 3, accept: [55, 62] } },
      episode: { segments, rundown: segments.filter((s) => s.storyId).map((s) => ({ storyId: s.storyId })), storyIds: segments.filter((s) => s.storyId).map((s) => s.storyId) },
    });
    const three = [sentence(20), sentence(20), sentence(20)].join(' ');
    const over = ctx([seg('intro', sentence(8)), seg('story', three, { storyId: 'a' }), seg('story', `${sentence(25)} ${sentence(25)}`, { storyId: 'b' }), seg('story', sentence(50), { storyId: 'c' }), seg('outro', sentence(8))]);
    const note = producer.fit(over);
    assert.deepEqual(over.episode.storyIds, ['a', 'b', 'c']);
    assert.equal(note.trimmed, 1);
    assert.equal(over.episode.segments[1].text, [sentence(20), sentence(20)].join(' '));
    assert.ok(note.estimate >= 55 && note.estimate <= 62, JSON.stringify(note));
    const credited = ctx([seg('intro', sentence(8)), seg('story', `${sentence(20)} ${sentence(20)} ${sentence(16, ', Pixelburg Post reports.')}`, { storyId: 'a' }), seg('story', `${sentence(25)} ${sentence(25)}`, { storyId: 'b' }), seg('story', sentence(50), { storyId: 'c' }), seg('outro', sentence(8))]);
    producer.fit(credited);
    assert.match(credited.episode.segments[1].text, /Pixelburg Post reports\.$/);
    assert.equal(credited.episode.segments[2].text, sentence(25));
    const tight = ctx([seg('intro', sentence(8)), seg('story', `${sentence(30)} ${sentence(30)}`, { storyId: 'a' }), seg('story', sentence(50), { storyId: 'b' }), seg('story', sentence(50), { storyId: 'c' }), seg('outro', sentence(8))]);
    const before = tight.episode.segments.map((s) => s.text);
    producer.fit({ ...tight, program: { timing: { ...tight.program.timing, accept: [62, 64] } } });
    assert.deepEqual(tight.episode.segments.map((s) => s.text), before);
  });
});

describe('round 5: what reading the final16 replay showed', () => {
  test('a story whose news is told only in a sentence too long to tell opens on its headline; an earlier time never opens a story', async () => {
    const program = { id: 'news-60', title: 'NEWS IN 60', stories: 5, maxChats: 0 };
    const summary = 'Paris Fire Brigade images show flames ravaging the Marché Couvert des Enfants Rouges in the Marais district during the night between Sunday and Monday, October 12. Founded in 1615, the Enfants Rouges market is the oldest covered food market in Paris and is listed as a historic monument.';
    const stories = [
      st('m', 'Fire ravages oldest covered food market in Paris', summary, { source: 'France 24' }),
      st('d', 'Nairobi floods cut off two districts', 'Heavy rain in Nairobi has cut off two districts, the city says.'),
      st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'),
      st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'),
      st('c', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.'),
    ];
    const segs = (await write(stories, program, { presenters: { A: { id: 'sam', name: 'Sam Night' } } })).segments;
    const fire = segs.find((s) => s.storyId === 'm')?.text || '';
    assert.match(fire, /^(?:\[[^\]]*\]\s*)?Fire ravages/, fire);
    assert.match(segs.find((s) => s.storyId === 'd')?.text || '', /heavy rain/i);
    const mm = { id: 'money-minute', title: 'MONEY MINUTE', stories: 3, maxChats: 0 };
    const body = [
      'A British Airways flight en route to Portugal was forced to return to Gatwick Airport on Tuesday due to a minor technical issue, reported to be a cracked window.',
      'Last week, a BA flight bound for Chicago spent five hours circling over Ireland, before turning back and landing at London Heathrow, where it had taken off.',
      'And in August Serbian national Ljubisa Karović was injured on a Ryanair flight.',
      'Ryanair subsequently said the window may have been damaged by a foreign object.',
    ].join('\n');
    const ba = st('ba', 'BA flight forced to turn back over cracked window', 'British Airways said the plane landed safely at Gatwick and passengers were due to resume their journey.', { body, category: 'business' });
    const told = (await write([st('x', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'), ba, st('y', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.')], mm, { depth: 3 })).segments.find((s) => s.storyId === 'ba').text;
    assert.ok(!/^(?:\[[^\]]*\]\s*)?Last week/.test(told), told);
    assert.ok(!/Ryanair subsequently/.test(told), told);
  });

  test('an analysis is a feature; "Imagine…" is the outlet talking; "it looks like…" is a view; a connective, "two days later" and "subsequently" lean', async () => {
    const { ownVoice } = await import('../server/providers/mock.js');
    const { untold } = await import('../server/coherence.js');
    assert.ok(ownVoice('Imagine a universe where stars still shine, planets still form, and water exists.'));
    assert.ok(outletView('With the midterms coming up, it looks like Trump is turning overseas for help.'));
    assert.equal(untold('Two days later, Trump was back on his social media website.', 'Trump announces energy ceasefire'), 'sequel');
    assert.equal(untold('Ryanair subsequently said the window may have been damaged.', 'BA flight forced to turn back'), 'sequel');
    assert.equal(untold('Nor is Honeyjar trying to replace PR professionals.', 'Honeyjar offers AI tools to improve PR'), 'also');
    assert.equal(untold('However, in reality, that might not be the case.', 'Voice AI has not reached its moment'), 'also');
    assert.equal(untold('The company is now officially embracing the chaos of this new AI-powered era of game modding.', 'Xbox is officially embracing the chaos of AI-powered game ports'), null);
    assert.equal(untold('This latest move comes after months of pressure.', 'Xbox is officially embracing the chaos of AI-powered game ports'), 'demonstrative');
    // (the desk's label is checked as the outlet wrote it: the writer reads the title without "Analysis:")
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 5, maxChats: 0 };
    const stories = [
      st('an', "Analysis: Trump's global headaches worsen weeks before crucial elections", 'US President Donald Trump has had a whirlwind weekend, announcing a diesel deal with Russia.'),
      st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'),
      st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'),
      st('c', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.'),
      st('d', 'Nairobi floods cut off two districts', 'Heavy rain in Nairobi has cut off two districts, the city says.'),
    ];
    const ids = (await write(stories, program)).segments.map((s) => s.storyId).filter(Boolean);
    assert.ok(!ids.includes('an') && ids.includes('d'), ids.join(' '));
  });

  test('a strap’s whole name is said when a story opens on the surname; a cut never ends on a dash’s verbless clause; a role keeps no sentence capital', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 3, maxChats: 0 };
    const gold = st('g', 'Israeli academic and Al Jazeera contributor Ori Goldberg dies', 'Goldberg was a regular Al Jazeera contributor and died after a long battle with colon cancer, his family said.', { body: 'Israeli academic and independent analyst Ori Goldberg has died at the age of 50, his family has said.', source: 'Al Jazeera' });
    const told = (await write([st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'), gold, st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.')], program)).segments.find((s) => s.storyId === 'g').text;
    assert.ok(!/(?<!Ori )Goldberg was/.test(told), told);
    const cut = trimClause('Bedbugs causing travel chaos is not unusual - less than two weeks ago, several Southeastern train services in England were cancelled after drivers discovered the creepy-crawlies in their cabs.', 12, 4);
    assert.ok(cut === null || !/weeks ago\.$/.test(cut), cut);
    const { provenanceLine } = await import('../server/guests/restage.js');
    assert.ok(!/the Computer scientist/.test(provenanceLine({ id: 'rp_x', name: 'Raphael Wimmer', role: 'Computer scientist' }, 'The Verge', 's')));
    assert.match(provenanceLine({ id: 'rp_y', name: 'Olena Shevchenko', role: 'Ukrainian president' }, 'BBC', 's'), /Ukrainian president/);
  });

  test('a first sentence that shares no word with its headline never stands for it; a live page’s "is speaking now" is no news line', async () => {
    const program = { id: 'news-60', title: 'NEWS IN 60', stories: 5, maxChats: 0 };
    const stories = [
      st('e', 'Crew searching for Amelia Earhart arrives at remote island', 'Coconut crabs, also known as Robber crabs, emerge at night to hunt for small mammals and seabirds.', { category: 'science' }),
      st('d', 'Nairobi floods cut off two districts', 'Heavy rain in Nairobi has cut off two districts, the city says.'),
      st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'),
      st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'),
      st('c', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.'),
    ];
    const segs = (await write(stories, program, { presenters: { A: { id: 'sam', name: 'Sam Night' } } })).segments;
    const crew = segs.find((s) => s.storyId === 'e')?.text || '';
    assert.match(crew, /Amelia Earhart/, crew);
    assert.ok(!study(st('l', 'Burnham says public will be boss', 'Zia Yusuf, Reform UK’s home affairs spokesperson, is speaking now. Burnham will urge MPs to embrace closer ties with the EU.')).sentences.some((t) => /speaking now/.test(t)));
    // (a headline whose predicate is a "not" is never made a passive: it says the opposite)
    const kenya = 'Mourners killed by Kenya police at ex-PM\'s national farewell not part of violence';
    assert.ok(!/have been killed/.test(spokenTitle(kenya, study(st('k', kenya, 'A BBC investigation found that none of those killed had been involved in violence.')))));
    // (and NEWS IN 60 never airs a live page: its item would be a sentence of someone's speech without its marks)
    const live = st('lv', 'Burnham says ‘public will be boss’ – live', 'Burnham will urge MPs to embrace closer ties with the EU. That’s 300 people a week, 300 lives destroyed, 300 families devastated.', { live: true });
    const four = stories.slice(1);
    const ids = (await write([live, ...four], program, { presenters: { A: { id: 'sam', name: 'Sam Night' } } })).segments.map((s) => s.storyId).filter(Boolean);
    assert.ok(!ids.includes('lv'), ids.join(' '));
  });

  test('a war is never "And finally", curiosity or not; a name keeps its capital with its possessive after "And finally:"', async () => {
    const program = { id: 'world-now', title: 'WORLD NOW', stories: 5, maxChats: 2, features: ['lighter'], chats: { after: ['lighter'] } };
    const drones = st('dr', 'Both Russia and Ukraine are using AI-powered drones on the battlefield', 'A Ukrainian company that got rich making smartphone-controlled cameras to watch pets at home now outfits first-person-view drones with an image recognition system powered by artificial intelligence.', { source: 'NPR' });
    const stories = [
      st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.'),
      st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.'),
      st('c', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.'),
      st('d', 'Nairobi floods cut off two districts', 'Heavy rain in Nairobi has cut off two districts, the city says.'),
      drones,
    ];
    const segs = (await write(stories, program)).segments;
    assert.ok(!segs.some((s) => s.storyId === 'dr' && s.feature === 'lighter'), segs.map((s) => `${s.storyId} ${s.feature || ''}`).join(' | '));
    const { study: studyOf } = await import('../server/providers/mock.js');
    const rivian = st('rv', 'Rivian’s startup Mind Robotics has hired former Ford EV chief Doug Field', 'Mind Robotics, the startup spun out of Rivian last year, has hired Doug Field. The robots will run on foundation models, Rivian said.', { category: 'tech' });
    const tb = { id: 'tech-bytes', title: 'TECH BYTES', stories: 4, maxChats: 0, features: ['lighter'] };
    const told = (await write([st('x', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.', { category: 'tech' }), st('y', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.', { category: 'tech' }), st('z', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.', { category: 'tech' }), rivian], tb)).segments.map((s) => s.text || '').join('\n');
    assert.ok(!/\brivian’s/.test(told), told);
    assert.ok(studyOf(rivian));
    // (and a famine's "food crisis monitor" is no gadget: GADGETS once headed Sudan's famine warning, WORLD NOW 14 Oct)
    assert.notEqual(topicOf({ title: 'Conflict, drought increasing risk of famine in Sudan: Monitor', summary: 'Conflict and drought are increasing the risk of famine across Sudan’s Darfur and West Kordofan regions, warns a global food crisis monitor.', category: 'world' }), 'GADGETS');
    assert.equal(topicOf({ title: 'Samsung unveils a curved gaming monitor', summary: 'The new OLED monitor has a 240Hz panel.', category: 'tech' }), 'GADGETS');
  });

  test('of two reports of one event the one with more to tell airs; UNIT-8 restates only what a story said, a note with nothing to restate only after the lead', async () => {
    const program = { id: 'tech-bytes', title: 'TECH BYTES', stories: 4, maxChats: 0 };
    const stories = [
      st('v', 'Google makes it easier to launch your vibe-coded apps', '', { source: 'The Verge', category: 'tech' }),
      st('t', 'Google Play now lets anyone build private, vibe-coded apps that run on Android', 'Google Play now lets anyone build private, vibe-coded apps that run on Android. The feature will be available to users in the U.S., age 18 and up.', { source: 'TechCrunch', category: 'tech' }),
      st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.', { category: 'tech' }),
      st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.', { category: 'tech' }),
      st('c', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.', { category: 'tech' }),
    ];
    const ids = (await write(stories, program)).segments.map((s) => s.storyId).filter(Boolean);
    assert.ok(ids.includes('t'), ids.join(' '));
    // (an appeal already dismissed is no next step: "And from here?" once heard the news again)
    const tb = { id: 'tech-bytes', title: 'TECH BYTES', stories: 3, maxChats: 4, chats: { after: ['lead', 'lighter', 'story'] } };
    const appeal = st('ap', 'Appeal for energy storage system rejected', 'Plans for a battery site near the Devon-Dorset border have been dismissed again. Proposals to install a major battery energy storage system have been rejected after an appeal by the developer was dismissed.', { category: 'tech' });
    const told = (await write([appeal, stories[2], stories[3]], tb)).segments.map((s) => s.text || '').join('\n');
    assert.ok(!/(?:from here|what happens now|what comes next)\?[^\n]*\n[^\n]*appeal by the developer was dismissed/i.test(told), told);
    const cosmos = { id: 'cosmos', title: 'COSMOS DESK', stories: 3, maxChats: 10, chats: { after: ['lead', 'lighter', 'story'], max: { lead: 2, lighter: 1, story: 2 } } };
    const UNIT = { A: { id: 'nova', name: 'Dr Nova Reyes' }, B: { id: 'unit8', name: 'UNIT-8' } };
    const science = [
      st('l', 'Scientists find why mushrooms glow', 'Scientists have found why some mushrooms glow in the dark, a study says.', { category: 'science' }),
      st('a', 'Lisbon opens a new metro line', 'Lisbon has opened a new metro line linking the airport to the centre.', { category: 'science' }),
      st('b', 'Oslo bans cars from its old town', 'Oslo has banned private cars from its old town from next month.', { category: 'science' }),
      st('c', 'Lima plants ten thousand trees', 'Lima has planted ten thousand trees along its river, the city says.', { category: 'science' }),
    ];
    const segs = (await write(science, { ...cosmos, stories: 4 }, { presenters: UNIT, depth: 3 })).segments;
    const notes = segs.filter((s, i) => s.type === 'chat' && /Entered in the record|Filed under remarkable|Logged, Dr Reyes\.$|thinking about that one|Understood, Dr Reyes/.test(s.text || '') && segs.slice(0, i).filter((x) => x.type === 'story').length > 1);
    assert.deepEqual(notes, [], segs.map((s) => s.text).join('\n'));
  });
});
