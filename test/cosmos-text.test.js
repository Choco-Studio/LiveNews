// What COSMOS DESK's first real-news episodes aired wrong (5 Oct, the mock writer on the live feeds), each case taken
// from the outlet's own text: a person by surname alone, a summary that goes on from its headline, the same news said
// twice in other words, two sentences opening the same way, a definition as the opener, a cut that leaves a clause
// open; and what the desk let through or misjudged (money advice, signed columns, cell biology as grave news).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockProvider } from '../server/providers/mock.js';
import { extractJson, trimClause } from '../server/writer.js';
import { isGrave } from '../server/facts.js';
import { notNews } from '../server/news.js';
import { topicOf } from '../server/topics.js';
import { loadChannel } from '../server/channel.js';
import { parseCues } from '../public/js/cues.js';

const spoken = (t) => parseCues(t).text;
const CAST = { A: { id: 'nova', name: 'Dr Nova Reyes' }, B: { id: 'unit8', name: 'UNIT-8' } };
const COSMOS = { id: 'cosmos', title: 'COSMOS DESK', stories: 3, maxChats: 0, intro: 'frame', targetSeconds: [360, 480] };
const st = (id, title, summary, body = '', extra = {}) => ({ id, title, summary, body, source: 'BBC Science', category: 'science', image: null, ...extra });
const FILLER = [
  st('f1', 'Meteor hit Oklahoma 100m years later than scientists thought', 'A meteor crater buried beneath Oklahoma has turned out to be nearly 100 million years younger than scientists thought.'),
  st('f2', 'Rare tree on Somerset clifftops being protected', "A rare tree, Fay's whitebeam, that is only found on cliffs in Somerset is being protected."),
];
const tell = async (story) => {
  const script = extractJson((await createMockProvider().generate({ stories: [...FILLER, story], channelName: 'TEST', presenters: CAST, program: COSMOS, count: COSMOS.stories })).text);
  const seg = script.segments.find((s) => s.storyId === story.id);
  assert.ok(seg, `${story.id} aired`);
  return spoken(seg.text);
};

describe('COSMOS on real news: who is speaking, and what the story opens on', () => {
  test('a person is named whole the first time, as the article gives the name ("Justin Scully said", BBC 5 Oct)', async () => {
    const text = await tell(
      st(
        'trust',
        "Trust warns of 'tangible' climate threat to heritage sites",
        'A National Trust manager says recent summers have "brought home" the impact of climate change.',
        [
          'Protecting all heritage sites from the impact of climate change "just may not be possible," according to a National Trust manager.',
          'Justin Scully, manager of Fountains Abbey and Studley Royal, said extreme heat, heavy rainfall and wildfire risk were already affecting gardens, moorland and historic structures.',
          'He said heavy rain could overwhelm drainage systems and penetrate walls, causing damp and erosion.',
          'Flooding could also undermine foundations, while hotter, dry conditions could increase the risk of subsidence and wildfires.',
          'Scully said the organisation may have to accept it cannot save everything as it is today.',
        ].join('\n')
      )
    );
    assert.match(text, /Justin Scully said/);
    assert.ok(text.indexOf('Justin Scully') <= text.indexOf('Scully'), `a bare "Scully" before the whole name: ${text}`);
    assert.ok(!/manager of Fountains Abbey/.test(text), 'the role the opener said ("A National Trust manager") goes when the sentence is over length');
  });

  test('when the sentence that names someone whole does not air, the first one that names them says it whole', async () => {
    const text = await tell(
      st(
        'trust2',
        "Trust warns of 'tangible' climate threat to heritage sites",
        'A National Trust manager says recent summers have "brought home" the impact of climate change.',
        [
          'Justin Scully, who looks after Fountains Abbey and Studley Royal for the trust in North Yorkshire, said extreme heat, heavy rainfall and wildfire risk were already affecting gardens, moorland and historic structures.',
          'Scully said the organisation may have to accept it cannot save everything as it is today.',
          'The trust is planning for more extreme weather over the next 40 years.',
        ].join('\n')
      )
    );
    assert.match(text, /Justin Scully said the organisation may have to accept/);
    assert.ok(!/who looks after/.test(text), 'the long sentence with a role the viewer has not heard is left out');
  });

  test('a summary that goes on from its headline does not open; a sentence that says who does ("The students will head...")', async () => {
    const text = await tell(
      st(
        'qub',
        'Students blast off to US for Nasa robotics competition',
        'The students will head to Florida to compete against university teams from Australia, India and the US.',
        [
          'Could a robot designed by young engineering students from Northern Ireland end up on the Moon?',
          "A team, from Queen's University Belfast (QUB), are heading to Florida later this month to take part in a Nasa 'lunabotics' competition.",
          'Lunabotics is a university-level competition for teams to use the Nasa systems engineering process to design, build, and operate a lunar robot.',
          'The robots will be expected to dig up lunar material, drive over obstacles and use the material to form a wall.',
        ].join('\n')
      )
    );
    assert.match(text, /^A team, from Queen's University Belfast, are heading to Florida/, 'the acronym in brackets is page furniture');
    assert.ok(!/^(?:Could|Lunabotics is)/.test(text), 'never a question, never a definition as the opener');
    assert.ok(!/will head to Florida/.test(text), '"heading to Florida" is not said twice');
  });

  test('a summary that tells the headline’s news itself still opens ("The central bank has kept interest rates...")', async () => {
    const text = await tell(st('cb', 'Central bank holds interest rates steady at 3.5 percent', 'The central bank has kept interest rates unchanged at 3.5 percent. Policymakers said inflation is easing.', '', { category: 'business' }));
    assert.match(text, /^The central bank has kept interest rates unchanged/);
  });
});

describe('COSMOS on real news: the same news never twice', () => {
  test('the standfirst and the first paragraph in other words: told once (ScienceDaily 5 Oct)', async () => {
    const text = await tell(
      st(
        'ecad',
        'The “glue” holding your cells together has a surprising second job',
        'Scientists have discovered that E-cadherin, a protein best known as the “glue” holding cells and tissues together, has a surprising second job: helping epithelial cells swallow nearby dead cells. Using live zebrafish and mouse embryos, researchers found that cells can dramatically reshape their lower surfaces to engulf cellular debris while keeping their upper surfaces stable, allowing protective barriers to remain sealed.',
        [
          'A protein best known for helping cells and tissues stay connected has another unexpected role. Researchers have found that it also helps epithelial cells, which form continuous sealed layers throughout the body, engulf nearby dead cells.',
          'The discovery could have implications for chronic inflammation. Debris from dying cells is a major contributor to inflammatory responses, so understanding how tissues remove that material may reveal new clues about what happens when the cleanup process fails.',
        ].join('\n'),
        { source: 'ScienceDaily' }
      )
    );
    assert.ok(!/another unexpected role/.test(text), '"a surprising second job" said again');
    assert.ok(!/it also helps epithelial cells/.test(text), 'a main clause already told, with only an aside of its own');
    assert.match(text, /chronic inflammation/, 'the next new fact is told instead');
  });

  test('two sentences in a row never open the same way ("The findings suggest... The findings offer...")', async () => {
    const text = await tell(
      st(
        'gut',
        'Your gut bacteria may reveal how fast your brain is aging',
        'A UCLA study links faster brain aging to specific gut bacteria and chemical byproducts, with older-looking brains also associated with poorer memory, focus, and mood. The findings suggest that biological signs of brain aging may appear decades before obvious symptoms and could eventually make the gut a target for prevention.',
        [
          'A new UCLA study suggests that the pace of brain aging may be connected to bacteria in the gut and the chemical compounds they produce. The findings offer a new look at biological changes that may begin long before noticeable problems with memory or thinking appear.',
          'Scientists have used brain scans for years to estimate a person\'s "brain age," which can differ from chronological age. Previous research has found that when the brain appears older than expected, that pattern can be associated with poorer memory, weaker thinking skills and changes in mood.',
        ].join('\n'),
        { source: 'ScienceDaily' }
      )
    );
    const openings = text.split(/(?<=[.!?”"])\s+(?=[A-Z])/).map((s) => s.split(/\s+/).slice(0, 2).join(' '));
    for (let i = 1; i < openings.length; i++) assert.notEqual(openings[i], openings[i - 1], text);
    assert.ok(!/when the brain appears older than expected\.$/.test(text), 'never a clause cut from its main clause');
  });
});

describe('a sentence cut to length keeps its sense (COSMOS, MONEY MINUTE, 5 Oct)', () => {
  test('the cuts that leave a clause or a phrase open are refused', () => {
    assert.equal(trimClause('Previous research has found that when the brain appears older than expected, that pattern can be associated with poorer memory, weaker thinking skills and changes in mood.', 14), null, 'a "that when" clause waits for its main clause');
    assert.equal(trimClause('While employers are within their rights to ask about the gap, recruiters have been warning candidates for years.', 12), null, 'a subordinate clause alone');
    assert.equal(trimClause('Six years ago, in an attempt to push local manufacturing, India doubled import duties on phones.', 10), null, 'no main verb once the infinitives are set aside');
    assert.equal(trimClause('Recruiters say prompt engineering is now one of the fast-growing, and best-paid, jobs in the technology sector across Britain.', 14), null, 'a compound adjective without its noun');
    assert.equal(trimClause('The government has promised to refocus on the economy, an area where voters say it has failed them for years.', 14), 'The government has promised to refocus on the economy.', 'an apposition goes whole, never cut from what defines it');
    assert.equal(trimClause('Officials said the river rose when heavy rain fell overnight, flooding hundreds of homes across the region.', 14), 'Officials said the river rose when heavy rain fell overnight.', 'a whole "when" clause stays');
  });
});

describe('the desk on real news (5 Oct): what is news, what is grave, which beat', () => {
  test('cells, microbes and stars die every day: biology and astronomy are not grave news', () => {
    for (const t of ['Scientists found that E-cadherin helps epithelial cells swallow nearby dead cells.', 'A vitamin D analog may make tumors more vulnerable to chemotherapy and immune attack.', 'A new drug kills cancer cells in mice.', 'The death of a star seeds new planets.']) assert.ok(!isGrave(t), t);
    for (const t of ['An attack on a market killed 12 people.', 'Two people died in the blast.']) assert.ok(isGrave(t), t);
  });

  test('money advice and signed columns are not reports; a report about investors is', () => {
    for (const t of ['Here’s what investors need to watch this week', 'These bond strategies can help you get a safe 5% return', 'The demands of Welsh devolution are simple | Will Hayward', 'The Guardian view on the budget: a test of nerve', 'How to save for retirement in your 30s', 'You don’t have to pick between growth and value']) assert.ok(notNews({ title: t }), t);
    for (const t of ['Investors brace for jobs report as markets wobble', 'Ministers explore how to cut energy bills', 'Bank of England holds rates at 4%']) assert.ok(!notNews({ title: t }), t);
  });

  test('a cancer drug is HEALTH, an immune attack is no war; neither is TECH BYTES’ (its science beat is tech)', () => {
    assert.equal(topicOf({ title: 'Vitamin D drug may help crack pancreatic cancer’s defenses', summary: '', category: 'science' }), 'HEALTH');
    assert.equal(topicOf({ title: 'Immune attack on tumours boosted by new vaccine', summary: '', category: 'science' }), 'HEALTH');
    assert.equal(topicOf({ title: 'Drone attacks hit Kyiv overnight', summary: '', category: 'world' }), 'CONFLICT');
    const beat = loadChannel().programs['tech-bytes'].beat.science;
    assert.ok(!beat.includes('HEALTH') && !beat.includes('CLIMATE'), 'medicine and climate science are COSMOS DESK’s');
    assert.ok(beat.includes('ENERGY') && beat.includes('SPACE'));
  });
});
