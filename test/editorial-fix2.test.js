// Editorial-2 fix round 2 (critics r2): what aired broken on the offline
// channel, and the accuracy checks that dropped good broadcast copy. Each case
// here is one that reached the screen or the voice in a 28-slot rotation.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBulletin, trimClause } from '../server/writer.js';
import { inventedClaim, leansOnPrevious, numbersGrounded } from '../server/facts.js';
import { createMockProvider } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const channel = loadChannel(path.join(ROOT, 'config', 'channel.json'));
const programOf = (id) => ({ id, ...channel.programs[id] });

const FOOTPRINTS = {
  id: 's0000000014',
  title: 'Ancient footprints found on a beach in Wales',
  summary:
    'Storms have uncovered footprints left on a beach in Wales about 7,000 years ago. Researchers say adults and children walked there together. The prints are preserved in a layer of hardened mud that is usually covered by sand.',
  source: 'Starfield Journal',
  category: 'science',
  link: 'https://fixtures.globit.invalid/science/14',
  published: Date.now(),
};
const REEF = {
  id: 's0000000011',
  title: 'Coral reef off Queensland shows signs of recovery',
  summary:
    'Scientists surveying a section of reef off Queensland, Australia, say coral cover has increased for the third year in a row. The survey team says fast-growing branching corals account for most of the gain. Marine heatwaves remain the main threat to the reef.',
  source: 'Starfield Journal',
  category: 'science',
  link: 'https://fixtures.globit.invalid/science/11',
  published: Date.now(),
};
const QUAKE = {
  id: 's0000000002',
  title: 'Earthquake hits southern Turkey, 12 killed',
  summary: 'An earthquake of magnitude 6.1 hit southern Turkey, killing 12 people, officials say. Rescue teams are searching collapsed buildings.',
  source: 'Channel 4 News',
  category: 'world',
  link: 'https://x.test/quake',
  published: Date.now(),
};

const storiesOf = (out) => out.segments.filter((s) => s.type === 'story');
const bulletin = (story, text, program = programOf('news-60')) =>
  normalizeBulletin({ segments: [{ type: 'intro', text: 'This is the news.' }, { type: 'story', storyId: story.id, text }, { type: 'outro', text: 'Goodbye.' }] }, [story, QUAKE.id === story.id ? FOOTPRINTS : QUAKE], { program, solo: true });

describe('fix r2: sentences that aired broken', () => {
  test('trimClause never cuts between a place and its country, nor after an adverb, nor leaves a verbless head', () => {
    // "Scientists surveying a section of reef off Queensland, Australia." has no verb: no cut at all
    assert.equal(trimClause(REEF.summary.split('. ')[0], 18, 6), null);
    const comet = 'A comet discovered last year will pass close to Earth this week and should be visible with binoculars just after sunset.';
    const cut = trimClause(comet, 20, 6);
    assert.ok(cut && !/\bjust\.$/.test(cut), cut);
    assert.equal(cut, 'A comet discovered last year will pass close to Earth this week.');
    // an attribution keeps the verb of what it reports ("Officials said the old bridge over the river." is not a sentence)
    assert.equal(trimClause('Officials said the old bridge over the river, which opened in 1960, will close for repairs next month.', 12, 6), null);
    // a relative clause stays whole when the main clause is kept
    assert.equal(trimClause('The museum, which opened in 1960, will close for repairs next month after a flood damaged its basement.', 12, 6), 'The museum, which opened in 1960, will close for repairs next month.');
  });

  test('a story never airs on what is left after its opener was dropped', () => {
    // the writer's first sentence names a place the source does not: it goes, and the outlet's own opener comes back
    const out = bulletin(FOOTPRINTS, 'In France, storms have uncovered footprints on a beach. Researchers say adults and children walked there together.');
    const text = storiesOf(out)[0].text;
    assert.match(text, /^Storms have uncovered footprints left on a beach in Wales/);
    assert.match(text, /walked there together/);
    // a writer that opens on a sentence leaning on nothing gets the source's opener in front
    const lean = storiesOf(bulletin(FOOTPRINTS, 'Researchers say adults and children walked there together.'))[0].text;
    assert.match(lean, /^Storms have uncovered/);
    // a grave story reduced to its colour line gets its news back
    const grave = storiesOf(bulletin(QUAKE, 'A cyberattack caused an earthquake in southern Turkey. Rescue teams are searching collapsed buildings.', programOf('world-now')))[0].text;
    assert.match(grave, /^An earthquake of magnitude 6\.1 hit southern Turkey/);
    assert.ok(!/cyberattack/.test(grave));
  });

  test('"there" pointing back at a place leans on the sentence before; the existential one does not', () => {
    assert.equal(leansOnPrevious('Researchers say adults and children walked there together.'), true);
    assert.equal(leansOnPrevious('There are about 30 ships waiting to cross.'), false);
    assert.equal(leansOnPrevious('Rangers say there is hope for the species.'), false);
  });

  test('the offline writer fronts the source’s own place, never a parent country the source does not name', async () => {
    const mock = createMockProvider();
    const program = programOf('news-60');
    const presenters = { A: { id: 'sam', ...channel.presenters.sam } };
    const { text } = await mock.generate({ stage: 'write', stories: [FOOTPRINTS, REEF, QUAKE], channelName: channel.name, program, presenters, count: 3, now: new Date('2026-10-03T10:00:00Z') });
    const ep = JSON.parse(text);
    const fp = ep.segments.find((s) => s.storyId === FOOTPRINTS.id);
    assert.ok(fp, 'the footprints story airs');
    assert.ok(!/United Kingdom/.test(fp.text), fp.text);
    assert.equal(inventedClaim('In the United Kingdom, storms have uncovered footprints in Wales.', `${FOOTPRINTS.title}. ${FOOTPRINTS.summary}`), null, 'the country of a named place is no invented name');
    assert.match(inventedClaim('In France, storms have uncovered footprints.', `${FOOTPRINTS.title}. ${FOOTPRINTS.summary}`) || '', /place/);
  });
});

describe('fix r2: the figure check reads broadcast copy', () => {
  const src = 'An earthquake of magnitude 6.1 hit southern Turkey on Monday.';
  test('a verb after a figure counts nothing; quake ~ earthquake', () => {
    for (const ok of [
      'An earthquake of magnitude 6.1 has hit southern Turkey.',
      'An earthquake of magnitude 6.1 was felt in southern Turkey.',
      'An earthquake of magnitude 6.1 struck southern Turkey.',
      'A 6.1 magnitude earthquake has hit southern Turkey.',
      'A 6.1 quake hit southern Turkey.',
    ])
      assert.equal(numbersGrounded(ok, src, { words: true }), true, ok);
    for (const bad of ['A 6.1 storm hit southern Turkey.', 'An earthquake of magnitude 6.4 hit southern Turkey.', '6.1 people died in southern Turkey.'])
      assert.equal(numbersGrounded(bad, src, { words: true }), false, bad);
    // the counted thing still has to agree when both name one
    assert.equal(numbersGrounded('120 people were moved.', 'Officials opened 120 relief camps for 3,000 people.', { words: true }), false);
  });
});

describe('fix r2: fixtures', () => {
  test('the slate names its central bank', () => {
    const xml = fs.readFileSync(path.join(ROOT, 'config', 'fixtures', 'business.xml'), 'utf8');
    assert.ok(!/<description>The central bank has kept/.test(xml), 'which central bank?');
  });
});
