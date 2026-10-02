#!/usr/bin/env node
// Production simulator (owner: PACE stream): produces the channel's rotation
// offline (fixture feeds + the mock writer, exactly the server's pipeline minus
// the voices) and reports, per episode, its structure and its estimated air time
// against the programme's pace profile (public/js/pace.js length.target). Also
// times the write stage, so "does production stay ahead of air" can be read
// together with the voice synthesis rate from a server log
// (tools/pace/analyse.mjs --server-log).
//
//   node tools/pace/simulate.mjs [--count 7] [--pool 24] [--channel alt-channel.json] [--json out.json] [--episodes out-episodes.json]
//
// --pool sets the producer's candidate pool (CANDIDATE_POOL; the server default 12
// caps how many stories a long programme can choose from); --channel tries another line-up
// (a copy of config/channel.json) without touching the shared one.

import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
process.env.FEEDS_FILE ||= 'config/feeds.fixture.json';
const { config } = await import('../../server/config.js');
const { NewsDesk } = await import('../../server/news.js');
const { Producer } = await import('../../server/producer.js');
const { ProviderChain } = await import('../../server/providers/index.js');
const { createMockProvider } = await import('../../server/providers/mock.js');
const { loadChannel } = await import('../../server/channel.js');
const { paceFor, estimateAir, gapAfter, wordCount } = await import('../../public/js/pace.js');

const quiet = { info() {}, warn() {}, error() {}, log() {} };
const count = Number(arg('count', 7));
const pool = Number(arg('pool', config.candidatePool));
const channel = arg('channel') ? loadChannel(arg('channel')) : loadChannel();
const desk = new NewsDesk({ log: quiet });
await desk.refresh();
const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: quiet });
const producer = new Producer({ config: { ...config, candidatePool: pool, reviewPass: false }, newsDesk: desk, chain, log: quiet });

// presenters' pace per programme (bibles): WORLD NOW 163-171, COSMOS 140-150, others ~170 wpm
const WPM = { 'world-now': 165, cosmos: 145, 'tech-bytes': 170, 'money-minute': 170, 'news-60': 172 };
const rows = [];
const episodes = [];
const rotation = channel.rotation;
for (let k = 0; k < count; k++) {
  const id = rotation[k % rotation.length];
  const upcoming = [1, 2, 3].map((j) => rotation[(k + j) % rotation.length]).filter((x) => x !== id);
  const t0 = Date.now();
  let ep = null;
  try {
    ep = await producer.produce(channel, id, { upcoming });
  } catch (err) {
    rows.push({ id, error: err.message });
    continue;
  }
  const ms = Date.now() - t0;
  if (!ep) {
    rows.push({ id, error: 'not enough fresh stories' });
    continue;
  }
  const P = paceFor(id);
  const segs = ep.segments;
  const words = segs.reduce((a, s) => a + wordCount(String(s.text || '').replace(/\[[^\]]*\]/g, ' ')), 0);
  const air = estimateAir(ep, { wpm: WPM[id] || 165 });
  const gaps = segs.slice(0, -1).map((_, i) => gapAfter(ep, i));
  episodes.push(ep);
  rows.push({
    id,
    stories: segs.filter((s) => s.type === 'story').length,
    chats: segs.filter((s) => s.type === 'chat').length,
    stillToCome: segs.some((s) => /\bstill to come\b/i.test(s.text || '')),
    words,
    air: Math.round(air),
    target: P.length.target,
    inTarget: air >= P.length.target[0] && air <= P.length.target[1],
    gapKinds: Object.entries(gaps.reduce((m, g) => ((m[g.kind] = (m[g.kind] || 0) + 1), m), {})).map(([k2, v]) => `${k2}×${v}`).join(' '),
    writeMs: ms,
  });
}
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('programme', 14)}${pad('stories', 8)}${pad('chats', 6)}${pad('signpost', 9)}${pad('words', 7)}${pad('air s', 7)}${pad('target', 10)}write ms`);
for (const r of rows) {
  if (r.error) console.log(`${pad(r.id, 14)}ERROR ${r.error}`);
  else console.log(`${pad(r.id, 14)}${pad(r.stories, 8)}${pad(r.chats, 6)}${pad(r.stillToCome ? 'yes' : '-', 9)}${pad(r.words, 7)}${pad(r.air, 7)}${pad(`${r.target.join('-')}${r.inTarget ? ' ✓' : ''}`, 10)}${r.writeMs}`);
}
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(rows, null, 1));
if (arg('episodes')) fs.writeFileSync(arg('episodes'), JSON.stringify(episodes, null, 1));
