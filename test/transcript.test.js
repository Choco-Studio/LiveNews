import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTranscriptLine, dropTranscriptLines } from '../server/transcript.js';
import { extractArticle } from '../server/article.js';
import { topicOf } from '../server/topics.js';

// LISTA D23 (first live run, 4 Oct): the offline writer read a France 24 summary aloud, "Here's Jennie Shin with
// more on the situation", and strapped "Yemen's Houthis claim attacks" as INDUSTRY.

test('a broadcaster\'s hand-offs, greetings and sign-offs are transcript lines', () => {
  for (const s of [
    "Here's Jennie Shin with more on the situation.",
    'Over to our correspondent in Kyiv.',
    'Good evening and welcome to the programme.',
    "I'm Jane Doe, in Paris.",
    'Thank you, Mark.',
    "Let's go live to Beirut.",
    'Our correspondent Jennie Shin has more.',
    'Jennie Shin reports from Gaza.',
    'Joining us now is Peter Smith.',
  ]) assert.ok(isTranscriptLine(s), s);
});

test('reporting stays, even when it names a correspondent or starts like a greeting', () => {
  for (const s of [
    'Houthi rebels claimed attacks on ships in the Red Sea.',
    'Here, the river burst its banks overnight.',
    'The minister thanked rescue teams for their work.',
    'Good weather helped firefighters contain the blaze.',
    'Officials said more than 300 people joined the protest.',
    'Reporters were kept away from the site.',
    'Reuters reports that the vote was delayed.',
    'The company reports its results on Thursday.',
  ]) assert.ok(!isTranscriptLine(s), s);
});

test('summaries and article text lose the hand-off, keep the story', () => {
  const summary = "Yemen's Houthis claim attacks on Saudi facilities. The group said it fired drones. Here's Jennie Shin with more on the situation.";
  assert.equal(dropTranscriptLines(summary), "Yemen's Houthis claim attacks on Saudi facilities. The group said it fired drones.");
  assert.equal(dropTranscriptLines('No hand-off here. Just facts.'), 'No hand-off here. Just facts.');
  const html = `<article><p>Rescue teams worked through the night in the flooded valley, officials said on Sunday morning.</p><p>Here's Jennie Shin with more on the situation. More than 200 homes were evacuated as the river rose above its banks.</p></article>`;
  const a = extractArticle(html);
  assert.ok(a && !/Jennie Shin/.test(a.text) && /200 homes/.test(a.text), a?.text);
});

test('the strap names a war story CONFLICT, an election ELECTIONS; a strike is INDUSTRY only with its workers', () => {
  assert.equal(topicOf({ title: "Yemen's Houthis claim attacks", summary: 'The group said it launched strikes on Saudi oil facilities.', category: 'world' }), 'CONFLICT');
  assert.equal(topicOf({ title: 'Kyiv bridge hit in further Russian drone attack', summary: '', category: 'world' }), 'CONFLICT');
  assert.equal(topicOf({ title: 'Satellite images show troops massing at the border', summary: '', category: 'tech' }), 'CONFLICT');
  assert.equal(topicOf({ title: "Bosnia votes in one of world's most complicated general elections", summary: '', category: 'world' }), 'ELECTIONS');
  assert.equal(topicOf({ title: 'Spain protests flare after housing bill rejected', summary: '', category: 'world' }), 'PROTESTS');
  assert.equal(topicOf({ title: 'Nurses walk out', summary: 'Nurses began a strike over pay on Monday.', category: 'world' }), 'INDUSTRY');
  assert.equal(topicOf({ title: 'Heart attack risk falls with daily walks', summary: '', category: 'science' }), 'SCIENCE');
  assert.equal(topicOf({ title: 'Rocket launches a probe to study the Sun', summary: '' }), 'SPACE');
});

test('page furniture in a summary goes: a menu run, a site tagline, a teaser cut off with […]', async () => {
  const { dropPageFurniture, isNavRun } = await import('../server/transcript.js');
  const apod = 'APOD Science APOD APOD: 2026 October 4 –… Today’s APOD Archive Submissions Index Search Calendar RSS Education About Discuss APOD Astronomy Picture of the Day Discover the cosmos! Each day a different image or photograph of our fascinating universe is featured, along with a brief explanation written by a professional astronomer. Supernumerary Rainbows over […]';
  assert.equal(dropPageFurniture(apod), '');
  for (const s of ['The UN Security Council met on Monday.', 'NATO, EU and G7 leaders issued a joint statement.', 'New York Yankees beat Boston Red Sox in the Bronx.']) assert.ok(!isNavRun(s), s);
  assert.equal(dropPageFurniture('Floods hit the valley. Hundreds were evacuated.'), 'Floods hit the valley. Hundreds were evacuated.');
});

test('kickers from the first live run: a bridge hit in Kyiv, forces seizing a city, a university president, gadgets', () => {
  assert.equal(topicOf({ title: 'Russia hits Kyiv bridge as Germany’s Merz visits Ukraine’s capital', summary: 'The bridge carries transport across the river.', category: 'world' }), 'CONFLICT');
  assert.equal(topicOf({ title: 'Ethiopian government forces seize Tigray capital Mekelle as TPLF withdraws', summary: '', category: 'world' }), 'CONFLICT');
  assert.equal(topicOf({ title: 'Bosnia votes in general election with wartime divisions still dominating', summary: '', category: 'world' }), 'ELECTIONS');
  assert.notEqual(topicOf({ title: 'Cornell president breaks silence over alleged campus rape', summary: '', category: 'world' }), 'POLITICS');
  assert.equal(topicOf({ title: 'The iPad Mini is slightly cheaper again', summary: '', category: 'tech' }), 'GADGETS');
  assert.equal(topicOf({ title: 'Ferry service resumes', summary: 'The bridge carries transport across the river.', category: 'world' }), 'TRANSPORT');
});
