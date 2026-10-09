import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, normalizeBulletin } from '../server/writer.js';
import { Producer } from '../server/producer.js';

// WAVE3.md §1: programmes in parts (channel.json format.parts). The station drives the block (station.test.js plays
// a whole day with parts); here, what a part's writer is told and how its open and close are made.
const program = { title: 'WORLD NOW', tagline: 't', style: 's', stories: 2, storyLength: '3 sentences', intro: 'headlines' };
const presenters = { A: { name: 'Paco Pixel', personality: 'calm' }, B: { name: 'Lola Byte', personality: 'warm' } };
const stories = [
  { id: 's1', title: 'Lisbon opens a new riverside tram line', summary: 'The city of Lisbon opened a tram line on Tuesday.', source: 'Ledger', category: 'world' },
  { id: 's2', title: 'Kenya plants a million trees', summary: 'Kenya planted a million trees in a single day, officials said.', source: 'Ledger', category: 'world' },
];
const part = (o) => ({ n: 2, total: 4, first: false, last: false, label: 'THE BIG STORIES', focus: 'The other big stories.', afterBreak: false, breakNext: true, aired: ['Lisbon opens tram line'], ...o });
const raw = (intro, outro) => ({
  segments: [
    { type: 'intro', anchor: 'A', text: intro },
    { type: 'story', storyId: 's2', anchor: 'A', headline: 'Kenya plants million trees', text: 'Kenya planted a million trees in a single day. Officials said so. Ledger reports it.' },
    { type: 'outro', anchor: 'B', text: outro },
  ],
});

test('the prompt of a middle part: its place, no greeting, no goodbye, no promise of stories not written yet, what aired', () => {
  const p = buildPrompt({ channelName: 'G', program, presenters, stories, part: part() });
  assert.match(p, /THIS PART OF THE PROGRAMME \(2 of 4: THE BIG STORIES\)/);
  assert.match(p, /ONE short link line, no greeting/);
  assert.match(p, /Never name stories that are still to come/);
  assert.match(p, /"Lisbon opens tram line"/);
  assert.doesNotMatch(p, /The intro reads the headlines of the first three stories/);
  const first = buildPrompt({ channelName: 'G', program, presenters, stories, part: part({ n: 1, first: true }) });
  assert.match(first, /The intro reads the headlines of the first three stories/);
  assert.doesNotMatch(buildPrompt({ channelName: 'G', program, presenters, stories }), /THIS PART OF THE PROGRAMME/);
});

test('a middle part opens on a link line and closes on a hand-over; a greeting or a goodbye gives way to the format\'s line', () => {
  const ok = normalizeBulletin(raw('Turning now to Africa.', 'Stay with us.'), stories, { channelName: 'G', program, presenters, part: part() });
  assert.deepEqual([ok.segments[0].type, ok.segments[0].link, ok.segments[0].text], ['chat', 'open', 'Turning now to Africa.']);
  assert.deepEqual([ok.segments.at(-1).type, ok.segments.at(-1).link], ['chat', 'close']);
  // the offline writer always greets and says goodbye: never in the middle of a programme
  const greets = normalizeBulletin(raw('Good evening, welcome to WORLD NOW. I\'m Paco Pixel.', 'That\'s all for now. Goodbye.'), stories, { channelName: 'G', program, presenters, part: part({ afterBreak: true }) });
  assert.equal(greets.segments[0].text, 'Welcome back to WORLD NOW.');
  assert.equal(greets.segments.at(-1).text, 'Stay with us. More after the break.');
  // the last part signs off; the first part greets (as a one-part programme does)
  const last = normalizeBulletin(raw('Turning now to Africa.', 'That\'s all from us. Goodbye.'), stories, { channelName: 'G', program, presenters, part: part({ n: 4, last: true, breakNext: false }) });
  assert.equal(last.segments.at(-1).type, 'outro');
  const first = normalizeBulletin(raw('Good evening. I\'m Paco Pixel.', 'Stay with us.'), stories, { channelName: 'G', program, presenters, part: part({ n: 1, first: true }) });
  assert.equal(first.segments[0].type, 'intro');
});

test('the closing piece when a planned part cannot be made: the sign-off alone, last, voiced like any segment', async () => {
  const channel = { name: 'GLOBIT 24', programs: { 'world-now': { title: 'WORLD NOW', tagline: 't', theme: 'world', presenters: ['paco', 'lola'], outroAnchor: 'A' } }, presenters: { paco: { name: 'Paco Pixel' }, lola: { name: 'Lola Byte' } } };
  let voiced = null;
  const producer = new Producer({ config: {}, newsDesk: {}, chain: {}, voice: { enabled: true, voiceEpisode: async (ctx) => ((voiced = ctx.episode.segments.length), { voice: 'kokoro' }) }, log: { info() {}, warn() {} } });
  const ep = await producer.closePart(channel, 'world-now', { block: 'b1', n: 3, total: 4 });
  assert.deepEqual(ep.segments.map((s) => s.type), ['outro']);
  assert.match(ep.segments[0].text, /^That's all from WORLD NOW for now\. Stay with us: GLOBIT 24 is live around the clock\.$/);
  assert.deepEqual(ep.part, { block: 'b1', n: 3, total: 4, last: true, label: 'CLOSE', breakAfter: false });
  assert.equal(ep.storyIds.length, 0);
  assert.equal(voiced, 1);
});
