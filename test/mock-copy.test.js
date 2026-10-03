// Copy quality of the offline writer (editorial-2 round 3): stories open with
// a sentence, not headline-ese; nothing opens on a word that points back at a
// sentence the listener never heard; round-up items say the news with the
// place first; UNIT-8's restatements are a character, not a tic.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockProvider } from '../server/providers/mock.js';
import { extractJson } from '../server/writer.js';
import { leansOnPrevious } from '../server/facts.js';
import { parseCues } from '../public/js/cues.js';

const spoken = (t) => parseCues(t).text;
const DUO = { A: { id: 'paco', name: 'Paco Pixel' }, B: { id: 'lola', name: 'Lola Byte' } };
const COSMOS_CAST = { A: { id: 'nova', name: 'Dr Nova Reyes' }, B: { id: 'unit8', name: 'UNIT-8' } };
const write = async (stories, program, presenters = DUO, extra = {}) =>
  extractJson((await createMockProvider().generate({ stories, channelName: 'TEST', presenters, program, count: program.stories, ...extra })).text);
const storySegs = (script) => script.segments.filter((s) => s.type === 'story');
const st = (id, title, summary, extra = {}) => ({ id, title, summary, source: 'Pixelburg Post', category: 'world', image: null, ...extra });

describe('leansOnPrevious', () => {
  test('pronouns and definite back-references lean on the sentence before', () => {
    for (const t of ['It runs along the river.', 'They say the line is ready.', 'The canal authority says about 30 ships are waiting.', 'Astronomers say the shadow will cross Bilbao.', 'Officials say the backlog should clear.', '[nod] The company wants to process 2 million phones.']) {
      assert.equal(leansOnPrevious(t), true, t);
    }
  });
  test('sentences that stand on their own do not', () => {
    for (const t of ['The Panama Canal has reopened.', 'The city of Paris has announced plans to plant trees.', 'A carmaker has confirmed it will close its plant.', 'Researchers at a battery firm say a new design could help.', 'Scientists say lava is flowing away from nearby towns.', 'There are 30 ships waiting.', 'Thousands of people have moved to relief camps.']) {
      assert.equal(leansOnPrevious(t), false, t);
    }
  });
});

describe('mock: openings', () => {
  const PROGRAM = { id: 'tech-bytes', title: 'TECH BYTES', stories: 3, maxChats: 0, intro: 'frame' };
  test('a story opens with its summary\'s first sentence, not with the headline read aloud', async () => {
    const stories = [
      st('a', 'Rail strike halts most trains across Germany', 'Most long-distance trains in Germany stopped on Thursday as rail workers began a strike over pay. Unions say talks have stalled.'),
      st('b', 'Smartphone battery breakthrough promises a week of use', 'Researchers at a battery firm say a new silicon design could let phones last a week between charges. The company hopes to start production in 2027.', { category: 'tech' }),
    ];
    for (const seg of storySegs(await write(stories, PROGRAM))) {
      const title = stories.find((x) => x.id === seg.storyId).title;
      assert.ok(!spoken(seg.text).includes(title), `headline-ese read aloud: ${seg.text}`);
    }
  });
  test('when the summary\'s first sentence leans on something, the headline opens instead', async () => {
    const stories = [st('c', 'Startup launches satellite internet service for farms', 'It says the service reaches speeds of 100 megabits per second. Farmers in remote areas can sign up now.', { category: 'tech' })];
    const seg = storySegs(await write(stories, { ...PROGRAM, stories: 1 }))[0];
    assert.match(spoken(seg.text), /^Startup launches satellite internet service for farms/);
  });
  test('the lead after the headlines keeps the restating sentence the next one leans on', async () => {
    const stories = [st('p', 'BREAKING: Panama Canal reopens after a day-long closure', 'The Panama Canal has reopened to ships after fog closed it for a day. The canal authority says about 30 ships are waiting to cross.', { category: 'business' })];
    const script = await write(stories, { id: 'world-now', title: 'WORLD NOW', stories: 1, maxChats: 0, intro: 'headlines' });
    const lead = storySegs(script)[0];
    assert.match(spoken(lead.text), /The Panama Canal has reopened/);
    assert.ok(!/^(?:Breaking news\. )?The canal authority/.test(spoken(lead.text)), lead.text);
  });
});

describe('mock: round-up items', () => {
  const NEWS60 = { id: 'news-60', title: 'NEWS IN 60', stories: 5, maxChats: 0, intro: 'frame', features: ['roundup'], roundup: { opener: 'Around the world.', min: 2, max: 3, timed: false } };
  const WORLD = { id: 'world-now', title: 'WORLD NOW', stories: 6, maxChats: 0, intro: 'frame', features: ['roundup'], roundup: { opener: 'Now, around the world in 30 seconds.', min: 2, max: 4 } };
  const slate = [
    st('lead', 'Hurricane cuts power to a million homes in Mexico', 'A hurricane has cut power to about one million homes in Mexico. Repair crews are waiting for the winds to drop.'),
    st('main', 'Court orders Amsterdam airport to cut night flights', 'A court in the Netherlands has ordered Amsterdam airport to cut night flights by a third. The airport says it will appeal.'),
    st('swe', 'Swedish recycling plant recovers gold from old phones', 'A recycling plant in Sweden has started recovering gold from old phones. The company wants to process 2 million phones a year.', { category: 'tech' }),
    st('rwa', 'Medicine-carrying drones expand across Rwanda', 'Drones now deliver medicine to 400 health centres across Rwanda, the operator says. The average flight takes about 30 minutes.', { category: 'tech' }),
    st('par', 'Paris unveils plans to plant 170,000 trees by 2030', 'The city of Paris has announced plans to plant 170,000 trees by 2030 to cool the city in summer. The city says shade can make streets several degrees cooler.'),
  ];
  test('each item says the news, with its place first, and never opens on a word that points back', async () => {
    for (const program of [NEWS60, WORLD]) {
      const items = storySegs(await write(slate, program, { A: { id: 'sam', name: 'Sam Night' } })).filter((s) => s.feature === 'roundup');
      assert.ok(items.length >= 2, `${program.id}: ${items.length} items`);
      for (const it of items) {
        const lines = spoken(it.text).split(/(?<=[.!?])\s+/).filter((l) => !/^(?:Around the world|Now, around the world|First,|Now to)\b/.test(l));
        assert.equal(lines.length, 1, it.text);
        assert.ok(!leansOnPrevious(lines[0]), `leans on nothing: ${it.text}`);
        assert.ok(!/the company wants|shade can make/i.test(lines[0]), `a later detail instead of the news: ${it.text}`);
      }
    }
  });
  test('NEWS IN 60 (place in the first three words): "A plant in Sweden has started..." becomes "In Sweden, a plant has started..."', async () => {
    const items = storySegs(await write(slate, NEWS60, { A: { id: 'sam', name: 'Sam Night' } })).filter((s) => s.feature === 'roundup');
    const swe = items.find((s) => s.storyId === 'swe');
    if (swe) assert.match(spoken(swe.text), /In Sweden, a recycling plant has started recovering gold from old phones/);
    const rwa = items.find((s) => s.storyId === 'rwa');
    if (rwa) assert.match(spoken(rwa.text), /In Rwanda, drones now deliver medicine to 400 health centres/);
    assert.ok(swe || rwa, 'one of them is a round-up item');
  });
});

describe('mock: COSMOS DESK, UNIT-8 as a character, not a tic', () => {
  const COSMOS = { id: 'cosmos', title: 'COSMOS DESK', stories: 7, maxChats: 6, categories: ['science', 'tech'], targetSeconds: [360, 480], features: ['number', 'lighter'], numberSlot: 'second', chats: { after: ['lead', 'story', 'lighter'] } };
  const science = [
    st('e', 'Solar eclipse to be visible across northern Spain next August', 'A total solar eclipse will be visible across northern Spain next August. Astronomers say the shadow will cross Bilbao and Valencia. Hotels report that many rooms are booked.', { category: 'science' }),
    st('o', 'Scientists map the ocean floor near Antarctica in new detail', 'A research ship has mapped 50,000 square kilometres of sea floor near Antarctica. The maps reveal underwater canyons.', { category: 'science' }),
    st('t', 'Study finds city trees cut summer temperatures by 2 degrees', 'A study of 90 European cities found that streets with many trees were about 2 degrees cooler in summer. Researchers say parks also reduced heat-related illness.', { category: 'science' }),
    st('g', 'Glacier in the Alps shrinks by 3 percent in one summer', 'Measurements show a large glacier in the Alps lost 3 percent of its volume this summer. Scientists say the ice is now thinner than ever. A lake has formed at its foot.', { category: 'science' }),
    st('r', 'Rover finds layered rocks in an ancient lake bed on Mars', 'A Mars rover has photographed layered rocks in what scientists believe was an ancient lake bed. The rover will drill a sample next month. The layers could hold clues about water.', { category: 'science' }),
    st('m', 'Astronauts grow tomatoes on the space station', 'Astronauts on the space station have harvested 12 tomatoes grown in a small greenhouse. Scientists want to learn how to feed crews on long missions.', { category: 'science' }),
    st('c', 'Comet will pass close enough to see with binoculars this week', 'A comet discovered last year will pass close to Earth this week. It will not return for about 6,000 years.', { category: 'science' }),
  ];
  test('restatements: at most two per episode, each in its own words, never about his own story; "And finally" is Nova\'s', async () => {
    const script = await write(science, COSMOS, COSMOS_CAST);
    const segs = script.segments;
    const restates = segs.filter((s, i) => s.type === 'chat' && s.anchor === 'B' && segs[i - 1]?.type === 'story' && !/Still to come/.test(s.text) && s !== segs.at(-2));
    assert.ok(restates.length >= 1 && restates.length <= 2, `${restates.length}: ${restates.map((r) => r.text).join(' | ')}`);
    const tails = restates.map((r) => spoken(r.text).split(/(?<=\.)\s+/).slice(1).join(' '));
    assert.equal(new Set(tails).size, tails.length, `the same shape twice: ${tails.join(' | ')}`);
    segs.forEach((s, i) => {
      if (s.type === 'chat' && s.anchor === 'B' && segs[i - 1]?.type === 'story') assert.notEqual(segs[i - 1].anchor, 'B', `UNIT-8 comments on his own story: ${s.text}`);
    });
    const lighter = storySegs(script).find((s) => s.feature === 'lighter');
    if (lighter) assert.equal(lighter.anchor, 'A');
  });
  test('Nova hands over the number of the day in different words across episodes', async () => {
    const handover = (script) => script.segments.find((s) => s.type === 'chat' && /number of the day/.test(s.text))?.text;
    const first = await write(science, COSMOS, COSMOS_CAST);
    const recent = first.segments.filter((s) => s.type === 'chat').flatMap((s) => spoken(s.text).split(/(?<=[.!?])\s+/));
    const second = await write(science, COSMOS, COSMOS_CAST, { recent });
    if (handover(first) && handover(second)) assert.notEqual(handover(first), handover(second));
  });
});

describe('mock: edge cases found on the offline rotation', () => {
  const MONEY = { id: 'money-minute', title: 'MONEY MINUTE', stories: 2, maxChats: 0, intro: 'frame' };
  const SOLO = { A: { id: 'penny', name: 'Penny Sterling' } };
  test('the summary\'s own first sentence opens even when it starts "The central bank..." (nothing comes before it)', async () => {
    const stories = [
      st('cb', 'Central bank holds interest rates steady at 3.5 percent', 'The central bank has kept interest rates unchanged at 3.5 percent. Policymakers said inflation is easing but they want more evidence before cutting.', { category: 'business' }),
      st('oil', 'Oil prices slide as global demand cools', 'Oil prices fell for a third day as traders expect weaker demand this winter. Brent crude dropped 2 percent.', { category: 'business' }),
    ];
    const seg = storySegs(await write(stories, MONEY, SOLO)).find((s) => s.storyId === 'cb');
    assert.match(spoken(seg.text), /^The central bank has kept interest rates unchanged/);
  });
  test('"in Brazil and Vietnam" is a list: the place is never pulled out of it', async () => {
    const WORLD = { id: 'world-now', title: 'WORLD NOW', stories: 4, maxChats: 0, intro: 'frame', features: ['roundup'], roundup: { opener: 'Now, around the world.', min: 2, max: 3 } };
    const stories = [
      st('l', 'Hurricane cuts power to a million homes in Mexico', 'A hurricane has cut power to about one million homes in Mexico. Repair crews are waiting.'),
      st('c', 'Coffee futures reach a ten-year high after poor harvests', 'Coffee prices have climbed to their highest level in ten years after poor harvests in Brazil and Vietnam. Roasters warn shop prices may rise.', { category: 'business' }),
      st('k', 'Kenya switches on its largest solar farm near Nairobi', 'A solar farm north of Nairobi has started supplying power to the national grid.'),
      st('v', 'Venice raises its sea barriers in a test', 'Venice has raised its sea barriers for a test ahead of the autumn high tides.'),
    ];
    for (const seg of storySegs(await write(stories, WORLD))) assert.ok(!/harvests and Vietnam/.test(seg.text), seg.text);
  });
  test('a headline ending without a full stop does not make the next word look like a name ("Still to come: astronauts...")', async () => {
    const COSMOS = { id: 'cosmos', title: 'COSMOS DESK', stories: 3, maxChats: 0, intro: 'teaser', features: ['lighter'] };
    const stories = [
      st('a', 'Rocket launches a probe to study the Sun', 'A rocket has launched a probe to study the Sun.', { category: 'science' }),
      st('b', 'Rover finds layered rocks on Mars', 'A rover has found layered rocks on Mars.', { category: 'science' }),
      st('t', 'Astronauts grow tomatoes on the space station', 'Astronauts on the International Space Station have harvested tomatoes grown in a small greenhouse.', { category: 'science' }),
    ];
    const script = await write(stories, COSMOS, COSMOS_CAST);
    const lighter = storySegs(script).find((s) => s.feature === 'lighter');
    if (lighter?.storyId === 't') assert.match(spoken(lighter.text), /And finally: astronauts/);
    assert.ok(!/(?:coming up|Later in the programme|And later): Astronauts/.test(spoken(script.segments[0].text)), script.segments[0].text);
  });
});
