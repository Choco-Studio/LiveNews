#!/usr/bin/env node
// One FULL TIME edition for the gate (docs/roadmap/critique/full-time-writing.md), written in full to <out> with the
// automatic checks after it; a fresh process per edition, the clock at the air time:
//   node tools/sport/edition.mjs <snapshot name | offline> <air ISO time> <out file>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freezeClock, snapDesk } from './snapshot.mjs';
const [snap, air, out] = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quiet = { info() {}, warn() {}, error() {}, log() {} };
let desk;
freezeClock(Date.parse(air));
if (snap === 'offline') {
  const { NewsDesk } = await import(root + '/server/news.js');
  const feeds = JSON.parse(fs.readFileSync(path.join(root, 'config/feeds.fixture.json'), 'utf8')).map((f) => ({ ...f, url: path.join(root, f.url) }));
  desk = new NewsDesk({ log: quiet, fetchImpl: async (u) => { throw new Error('offline ' + u); } });
  desk.loadFeeds = () => feeds;
  await desk.refresh();
} else {
  // (a snapshot read at any time: its feeds and pages, never the network)
  desk = await snapDesk(root, path.join(root, 'data', 'sport-snapshots', snap));
}
const { config } = await import(`${root}/server/config.js`);
const { Producer } = await import(root + '/server/producer.js');
const { ProviderChain } = await import(root + '/server/providers/index.js');
const { createMockProvider } = await import(root + '/server/providers/mock.js');
const { loadChannel } = await import(root + '/server/channel.js');
const ch = loadChannel(undefined, { drafts: true });
const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: quiet });
const p = new Producer({ config: { ...config, reviewPass: false }, newsDesk: desk, chain, log: quiet });
const ep = await p.produce(ch, 'full-time');
const lines = [];
const log = (t) => lines.push(t);
log(`# FULL TIME — ${snap} — air ${air}`);
if (!ep) {
  log('NO EDITION');
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  process.exit(0);
}
log(`shape ${ep.sport?.shape}, results ${ep.sport?.results}, fixtures ${ep.sport?.fixtures}, segments ${ep.segments.length}`);
for (const s of ep.segments) {
  const extra = [s.kicker, s.score ? `SCORE ${s.score.a} ${s.score.sa}-${s.score.sb} ${s.score.b}` : '', s.scores ? `ROWS ${s.scores.map((r) => `${r.a} ${r.sa}-${r.sb} ${r.b}${r.day ? ' (' + r.day + ')' : ''}`).join(' / ')}` : '', s.fixtures ? `FIX ${s.fixtures.map((f) => f.when + ' ' + f.event).join(' / ')}` : '', s.feature, s.follows ? 'follows' : ''].filter(Boolean).join(' | ');
  log(`[${s.type}:${s.anchor}] ${extra ? '{' + extra + '} ' : ''}${s.headline ? '«' + s.headline + '» ' : ''}${String(s.text || '').replace(/\[[^\]]*\]\s*/g, '')}`);
}
// ---- automatic checks (tools/sport/checks.mjs), the desk's whole list made ready for the matchday check
const { editionChecks } = await import(`${root}/tools/sport/checks.mjs`);
const { prepareStories } = await import(`${root}/server/sport/prepare.js`);
const pool = prepareStories(desk.candidates(40, { categories: ['sport'], fill: true }), { now: Date.parse(air) });
const { faults, verbatim } = editionChecks(ep, { getStory: (id) => desk.get(id), air, pool });
log('');
log(`CHECKS: ${faults.length ? faults.length + ' fault(s)' : 'clean'}`);
for (const f of faults) log(`  - ${f}`);
log('');
log(`VERBATIM (the compliance desk's rule: no run over 12 words, at most 20 % per story outside attributed quotes; ${verbatim.filter((v) => !v.ok).length} of ${verbatim.length} stories over it, held back until an AI writer composes them)`);
for (const v of verbatim) log(`  ${String(Math.round(v.share * 100)).padStart(3)} %  longest ${String(v.longest).padStart(2)}  ${v.ok ? 'ok  ' : 'OVER'}  ${v.head}`);
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.join('\n'));
