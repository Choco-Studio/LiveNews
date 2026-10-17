#!/usr/bin/env node
// The publisher's round (server/publish/publisher.js): the gate again on everything waiting (recheck.js: what no
// longer passes is held), then give every approved item its time, then publish what is due,
// each through the compliance gate again, the C2PA mark and its network's adapter. A DRY RUN unless all five
// switches are on (docs/publishing/setup.md §7); the outbox (data/publish/outbox.jsonl) says what was sent, or would
// have been, and which switch was off.
//
//   node tools/publish/run.mjs [--queue data/publish] [--at 2026-10-17T12:00:00Z] [--all-due]
//
// --at: publish as if it were that time (a dry run's rehearsal of a day); --all-due: everything scheduled, whatever
// its time (a dry run only).
import path from 'node:path';
import { PublishQueue } from '../../server/publish/queue.js';
import { Publisher, liveBlockers } from '../../server/publish/publisher.js';
import { makeAdapter } from '../../server/publish/adapters/index.js';
import { usingStub } from '../../server/publish/compliance.js';
import { root, argsOf } from './lib.mjs';

const { opt, flag } = argsOf();
const at = opt('at') ? Date.parse(opt('at')) : null;
let clock = at ?? Date.now();
const now = () => clock;
const queue = new PublishQueue({ dir: path.resolve(opt('queue', path.join(root, 'data', 'publish'))), now });
const publisher = new Publisher({ queue, now, dataDir: path.join(root, 'data'), log: (m) => console.log(m) });
// the gate again on everything waiting, before anything is scheduled (tools/publish/recheck.mjs does this alone)
const re = publisher.recheck();
console.log(`re-check: ${re.checked} waiting · ${re.held.length} held now${re.released.length ? ` · ${re.released.length} back to the owner` : ''}`);
for (const it of re.held) console.log(`  held  ${it.platform.padEnd(9)} ${it.title} · ${(it.compliance?.violations || []).map((v) => v.rule).join(', ')}`);
const scheduled = queue.schedule(now());
console.log(`${scheduled.length} newly scheduled · compliance: ${usingStub ? 'the stub (dry run only)' : 'the real module'}`);
let due = queue.due(now());
if (flag('all-due')) {
  const all = queue.list({ status: 'scheduled' });
  const live = all.some((it) => liveBlockers(queue, it, { adapter: makeAdapter(it.platform, { dryRun: true }) }).length === 0);
  if (live) {
    console.error('refused: --all-due is for dry runs, and an item here could go out live');
    process.exit(1);
  }
  due = all;
}
for (const it of due.sort((a, b) => a.schedule.at - b.schedule.at)) {
  clock = Math.max(clock, it.schedule.at);
  const out = await publisher.publishOne(it);
  const when = new Date(it.schedule.at).toISOString().slice(0, 16).replace('T', ' ');
  console.log(`${when} UTC  ${it.platform.padEnd(9)} ${out.status.padEnd(10)} ${out.result?.dryRun ? '(dry run) ' : ''}${it.title}${out.status === 'held' ? ` · ${(out.compliance?.violations || []).map((v) => v.rule).join(', ')}` : ''}`);
}
console.log(`${due.length} due · outbox: ${path.join(queue.dir, 'outbox.jsonl')}`);
