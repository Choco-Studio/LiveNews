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
const { isGrave } = await import(root + '/server/facts.js');
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
// ---- automatic checks
const faults = [];
const stories = ep.segments.filter((s) => s.type === 'story');
const plain = (t) => String(t || '').replace(/\[[^\]]*\]\s*/g, '');
const unquoted = (t) => plain(t).replace(/["“][^"”]*["”]/g, ' ');
const JUDGE = /\b(?:brilliant|stunning|superb|sublime|sensational|magnificent|wonderful|fantastic|outstanding|world-class|woeful|dismal|abject|shambolic|awful|dreadful|poor|sloppy|lacklustre|embarrassing|incredible|amazing|spectacular|terrible|appalling|wasteful|impressive|excellent|remarkable|disappointing|deserved|should have|nightmare|masterclass|howler)\b/i;
for (const s of ep.segments) if (JUDGE.test(unquoted(s.text))) faults.push(`judgement: ${unquoted(s.text).match(JUDGE)[0]} in «${s.headline || s.type}»`);
for (const s of stories) if (/\b(?:Rosa|Kai)\?\s*$/.test(plain(s.text))) faults.push(`toss left in «${s.headline}»`);
// (after the shape's own lines, a transition, a hand-over, the follow line or the moment's, a story's first words)
const { BANKS } = await import(`${root}/server/sport/shape.js`);
const bankLines = [...BANKS.follow, ...BANKS.moment, ...Object.values(BANKS.transition).flat()].map((l) => l.replace(/\[[^\]]*\]\s*/g, '').trim());
const opening = (t) => {
  let x = t;
  for (let changed = true; changed; ) {
    changed = false;
    for (const l of bankLines) if (x.startsWith(`${l} `)) {
      x = x.slice(l.length + 1);
      changed = true;
    }
    const num = /^Our number of the day: [^.]+\.\s+/.exec(x);
    if (num) {
      x = x.slice(num[0].length);
      changed = true;
    }
  }
  return x;
};
const LEANS = { test: (t) => /^(?:It|They|He|She|This|These|Those|His|Her|Their|Its)\b/.test(opening(t)) };
for (const s of stories.filter((x) => !['scores', 'fixtures'].includes(x.feature))) if (LEANS.test(plain(s.text))) faults.push(`opens on a pronoun: «${s.headline}» ${plain(s.text).slice(0, 80)}`);
const sentences = ep.segments.flatMap((s) => plain(s.text).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 6));
const seen = new Set();
for (const x of sentences) {
  const k = x.toLowerCase();
  if (seen.has(k)) faults.push(`said twice: ${x.slice(0, 80)}`);
  seen.add(k);
}
for (const s of stories.filter((x) => x.score)) {
  const src = desk.get(s.storyId);
  if (!new RegExp(`${s.score.sa}\\s*[-–]\\s*${s.score.sb}|${s.score.sb}\\s*[-–]\\s*${s.score.sa}`).test(`${src?.title} ${src?.summary} ${src?.body || ''}`)) faults.push(`score not in source: «${s.headline}»`);
}
const football = stories.filter((s) => s.sport === 'football' && !s.feature).length;
const told = stories.filter((s) => s.storyId && !['scores', 'fixtures'].includes(s.feature)).length;
if (football > Math.ceil(told / 2)) faults.push(`football ${football} of ${told}`);
if (new Set(stories.map((s) => s.sport).filter(Boolean)).size < 3) faults.push('fewer than three sports');
const moment = stories.find((s) => s.kicker === 'MOMENT OF THE DAY');
if (moment && isGrave(`${desk.get(moment.storyId)?.title}. ${desk.get(moment.storyId)?.summary}`)) faults.push('grave moment of the day');
if (/\band finally\b/i.test(ep.segments.map((s) => plain(s.text)).join(' '))) faults.push('"And finally" left');
for (const x of sentences) if (x.split(/\s+/).length > 45) faults.push(`long sentence (${x.split(/\s+/).length} words): ${x.slice(0, 60)}`);
const chats = ep.segments.filter((s) => s.type === 'chat');
ep.segments.forEach((s, i) => {
  if (s.type === 'chat' && /\?\s*$/.test(plain(s.text)) && ep.segments[i + 1]?.type !== 'chat') faults.push(`question with no answer: ${plain(s.text)}`);
});
if (chats.length > 10) faults.push(`${chats.length} chats`);
log('');
log(`CHECKS: ${faults.length ? faults.length + ' fault(s)' : 'clean'}`);
for (const f of faults) log(`  - ${f}`);
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.join('\n'));
