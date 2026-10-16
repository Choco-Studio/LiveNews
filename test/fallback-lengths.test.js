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
    assert.equal(k('Julie Inman Grant may be able to limit Australians seeing a livestreamed US execution', 'Australia’s online safety regulator has a few levers.'), 'REGULATION');
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
