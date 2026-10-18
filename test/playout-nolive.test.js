// No false LIVE (public/js/airmode.js, server/playout/gate.js, server/publish/live.js; docs/publishing/playout.md §5):
// a programme made ahead and aired from a file never says it is live, on screen, in its title or in its words. The top
// row's LIVE pip becomes the channel's 24/7 mark, the end card and the start screen say "24 hours a day", the live
// video's title and description drop LIVE; the writers' words, the continuity voice and the ads make no live claim;
// and the live channel keeps everything as before behind the switch (the station's PLAYOUT mode).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { falseLive, FALSE_LIVE, airModeOf, isRecorded, onAirTag, endCardLine, startTag } from '../public/js/airmode.js';
import { liveTitle, liveDescription, LiveSupervisor } from '../server/publish/live.js';
import { liveClaims } from '../server/playout/gate.js';
import { createMockProvider } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';
import { CONTINUITY } from '../public/js/ads/index.js';

test('the live claims it finds, and the uses of "live" it leaves alone', () => {
  for (const [t, said] of [
    ["We're live in the studio.", "We're live"],
    ['we are live from London', 'we are live'],
    ['Coming to you live from the newsroom', 'Coming to you live'],
    ['Live from the studio, this is WORLD NOW.', 'Live from the studio'],
    ['Watch it live on GLOBIT 24', 'live on GLOBIT'],
    ['This is live.', 'This is live'],
    ['GLOBIT 24 LIVE · Now: COSMOS', 'LIVE'],
    ['STAY WITH US · LIVE 24 HOURS', 'LIVE'],
  ]) assert.equal(falseLive(t), said, t);
  for (const t of ['People who live there need warm coats.', 'A live page on the outlet said', 'live music returns to the square', 'The live stream of the launch begins at noon', 'OLIVER', 'LIVERPOOL win the derby', 'where they live, in the north', "The live animals were rescued."]) {
    assert.equal(falseLive(t), null, t);
  }
  assert.ok(FALSE_LIVE instanceof RegExp);
});

test('the air mode: recorded for playout, live otherwise; the labels each mode shows', () => {
  for (const x of ['recorded', 'playout', 'Pre-recorded', 'prerecorded']) assert.equal(airModeOf(x), 'recorded', x);
  for (const x of [undefined, null, '', 'live', 'anything']) assert.equal(airModeOf(x), 'live', String(x));
  assert.equal(isRecorded('recorded'), true);
  assert.deepEqual(onAirTag('live'), { text: 'LIVE', pip: true });
  assert.deepEqual(onAirTag('recorded'), { text: '24/7', pip: false });
  assert.equal(endCardLine('GLOBIT 24', 'live'), 'GLOBIT 24 · LIVE 24 HOURS', 'the live channel as before');
  assert.equal(endCardLine('GLOBIT 24', 'recorded'), 'GLOBIT 24 · 24 HOURS A DAY');
  assert.equal(falseLive(endCardLine('GLOBIT 24', 'recorded')), null);
  assert.equal(falseLive(startTag('recorded')), null);
  assert.equal(startTag('live'), 'LIVE • 24 HOURS');
  assert.equal(falseLive(onAirTag('recorded').text), null);
});

test('the page draws the recorded tags where it drew LIVE (top row, opens, end cards, start screen, idle wall, tab)', () => {
  const src = (f) => fs.readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
  assert.match(src('graphics/bug.js'), /onAirTag\(v\.recorded \? 'recorded' : 'live'\)/);
  assert.match(src('graphics/index.js'), /TOP_ROW\.recorded = !!scene\.recorded/);
  assert.match(src('scenes/opens/kit.js'), /TOP_V\.recorded = !!info\?\.recorded/);
  assert.match(src('studio.js'), /recorded: !!scene\.recorded/);
  assert.match(src('scenes/cards.js'), /startTag\(recorded \? 'recorded' : 'live'\)/);
  assert.match(src('set.js'), /livePill\(c, tx, ty \+ 22, t, !!scene\.recorded\)/);
  assert.match(src('main.js'), /recorded \? '24\/7' : 'Live'/);
  // every "LIVE 24 HOURS" end card goes through endCardLine (the director and the quiz director)
  for (const f of ['director.js', 'quizdirector.js']) {
    assert.doesNotMatch(src(f), /· LIVE 24 HOURS`/, f);
    assert.match(src(f), /endCardLine\(/, f);
  }
});

test('the live video\'s title and description: LIVE on the live channel, never under pre-rendered playout', () => {
  const now = { id: 'e1', title: 'Cosmos Desk' };
  assert.match(liveTitle(now), /GLOBIT 24 LIVE · Now: COSMOS DESK/);
  const t = liveTitle(now, { recorded: true });
  assert.equal(t, 'GLOBIT 24 · Now: COSMOS DESK · AI-produced news 24/7');
  assert.equal(falseLive(t), null);
  assert.equal(falseLive(liveTitle(null, { recorded: true })), null);
  const d = liveDescription({ now: { kind: 'episode', title: 'COSMOS DESK' }, upcoming: [{ title: 'NEWS IN 60' }] }, { recorded: true });
  assert.equal(falseLive(d), null);
  assert.match(d, /produced and checked ahead of time/);
});

test('the supervisor in recorded mode sends truthful titles (a dry run writes what it would send)', async () => {
  const sent = [];
  const sup = new LiveSupervisor({ recorded: true, youtube: { planLiveUpdate: (id, meta) => (sent.push(meta), [{ step: 'live-update', body: meta }]) }, now: () => Date.parse('2026-10-17T20:00:00Z') });
  await sup.onSchedule({ now: { kind: 'episode', id: 'e1', title: 'WORLD NOW' }, upcoming: [] });
  assert.equal(sent.length, 1);
  assert.equal(falseLive(sent[0].title), null);
  assert.equal(falseLive(sent[0].description), null);
  const live = new LiveSupervisor({ youtube: { planLiveUpdate: (id, meta) => (sent.push(meta), []) }, now: () => Date.parse('2026-10-17T20:00:00Z') });
  await live.onSchedule({ now: { kind: 'episode', id: 'e2', title: 'WORLD NOW' }, upcoming: [] });
  assert.match(sent[1].title, /LIVE/, 'the live channel, unchanged');
});

test('the writers\' words make no live claim (the mock writer\'s programmes, the continuity voice, the source banks)', async () => {
  const CH = loadChannel();
  const story = (id, title, summary) => ({ id, title, summary, source: 'Pixelburg Post', category: 'world', image: null, published: Date.now() - 3600_000, weight: 1 });
  const stories = [
    story('a1', 'Norway raises interest rates', 'Norway’s central bank has raised its main interest rate to 4.75 percent.'),
    story('a2', 'Carmaker to close Turin plant', 'A carmaker says it will close its plant near Turin by the end of next year.'),
    story('a3', 'Lisbon opens a new tram line', 'Lisbon has opened a new tram line along the Tagus river with 40,000 riders a day.'),
    story('a4', 'Telescope spots distant galaxy', 'Astronomers say a telescope has spotted one of the most distant galaxies yet seen.'),
    story('a5', 'Chip maker posts record sales', 'A chip maker has posted record quarterly sales on strong demand for data centres.'),
  ];
  for (const id of ['world-now', 'tech-bytes', 'cosmos', 'money-minute', 'news-60']) {
    const program = { id, ...CH.programs[id] };
    const [a, b] = program.presenters;
    const presenters = { A: { id: a, ...CH.presenters[a] }, ...(b ? { B: { id: b, ...CH.presenters[b] } } : {}) };
    const r = await createMockProvider().generate({ stories, channelName: CH.name, program, presenters, count: 5 });
    const ep = { kind: 'episode', program: { id }, ...JSON.parse(r.text) };
    assert.deepEqual(liveClaims(ep), [], id);
  }
  for (const line of CONTINUITY.script) assert.equal(falseLive(line.text), null, line.text);
  // the banks the writers speak from (phrases only: their code names LIVE_BOILERPLATE and the like are not words on air)
  for (const f of ['server/providers/mock.js', 'server/weatherwriter.js', 'server/weeklywriter.js', 'server/sport/shape.js', 'server/voice/adcast.json', 'public/js/ads/index.js']) {
    const text = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const strings = text.match(/'(?:[^'\\\n]|\\.){12,}'|"(?:[^"\\\n]|\\.){12,}"|`(?:[^`\\]|\\.){12,}`/g) || [];
    for (const s of strings) if (!/\\b|\(\?:|\|/.test(s)) assert.equal(FALSE_LIVE.test(s), false, `${f}: ${s.slice(0, 80)}`);
  }
});

test('the publishing desk under playout: clips, their end card and whole uploads invite to watch, never "live"', async () => {
  const { clipTexts } = await import('../server/publish/clipmeta.js');
  const { uploadMeta } = await import('../server/publish/uploads.js');
  const ep = { id: 'e', program: { id: 'cosmos', title: 'COSMOS DESK' }, segments: [{ type: 'story', anchor: 'A', text: 'A rare family of barn owls moved into Manhattan.', storyId: 's1', headline: 'Barn owls move into Manhattan', source: 'NPR Science' }] };
  const m = { id: 'e:story:0-0', kind: 'story', from: 0, to: 0, light: true, grave: false, hook: ['BARN OWLS MOVE', 'INTO MANHATTAN'], headline: 'Barn owls move into Manhattan', storyIds: ['s1'], sources: ['NPR Science'], credits: [], programme: 'COSMOS DESK', programId: 'cosmos' };
  const url = 'https://www.youtube.com/@globit24/live';
  const live = clipTexts(m, ep, { platform: 'youtube', channelUrl: url });
  const rec = clipTexts(m, ep, { platform: 'youtube', channelUrl: url, recorded: true });
  assert.match(`${live.description}`, /GLOBIT 24 live, 24 hours a day/, 'the live channel, unchanged');
  assert.doesNotMatch(`${rec.description} ${rec.text}`.replaceAll(url, ''), /\blive\b/i);
  assert.match(rec.description, /GLOBIT 24, 24 hours a day: https/);
  assert.match(uploadMeta(ep, { url }).description, /Watch GLOBIT 24 live/);
  assert.doesNotMatch(uploadMeta(ep, { url, recorded: true }).description.replaceAll(url, ''), /\blive\b/i);
  // the clip's end card: under playout it never says WATCH LIVE (airmode.js streamOf: 'recorded' with a stream address,
  // 'none' without one; test/clip-endcard-stream.test.js)
  const { streamOf, watchLine, falseLive } = await import('../public/js/airmode.js');
  for (const u of [url, null]) for (const vertical of [true, false]) assert.equal(falseLive(watchLine(streamOf({ url: u, recorded: true }), { vertical }) || ''), null);
  const factory = fs.readFileSync(new URL('../tools/publish/factory.mjs', import.meta.url), 'utf8');
  assert.match(factory, /&stream=\$\{stream\}/);
});
