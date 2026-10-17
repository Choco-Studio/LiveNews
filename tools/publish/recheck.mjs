#!/usr/bin/env node
// The re-check of everything waiting in the publishing queue (server/publish/recheck.js; the publisher runs it before
// each round too): the compliance gate again, against the current rules, the compliance register (takedowns, withdrawn
// stories, people not to re-stage) and the current rights records (each picture's licence judged again under today's
// terms). What no longer passes is held, with its reason in Spanish on the approval page; an item an earlier re-check
// held that passes again goes back to the owner (pending). Nothing is published, scheduled or sent.
//
//   node tools/publish/recheck.mjs [--queue data/publish] [--data data] [--at 2026-10-17T12:00:00Z] [--json]
import path from 'node:path';
import { PublishQueue } from '../../server/publish/queue.js';
import { gateView } from '../../server/publish/publisher.js';
import { recheckQueue } from '../../server/publish/recheck.js';
import { RULE_ES } from '../../server/publish/approval.js';
import { usingStub } from '../../server/publish/compliance.js';
import { root, argsOf } from './lib.mjs';

const { opt, flag } = argsOf();
const at = opt('at') ? Date.parse(opt('at')) : Date.now();
if (!Number.isFinite(at)) {
  console.error('--at: not a date');
  process.exit(2);
}
const now = () => at;
const dataDir = path.resolve(opt('data', path.join(root, 'data')));
const queue = new PublishQueue({ dir: path.resolve(opt('queue', path.join(dataDir, 'publish'))), now });
const r = recheckQueue({ queue, view: (it) => gateView(it, { now: at }), dataDir, now });
const line = (it) => ({ id: it.id, platform: it.platform, title: it.title, rules: [...new Set((it.compliance?.violations || []).map((v) => v.rule))], es: [...new Set((it.compliance?.violations || []).map((v) => RULE_ES[v.rule] || v.message))] });
if (flag('json')) {
  console.log(JSON.stringify({ at: new Date(at).toISOString(), stub: usingStub, checked: r.checked, passed: r.passed, held: r.held.map(line), released: r.released.map(line) }, null, 1));
} else {
  console.log(`re-check ${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC · compliance: ${usingStub ? 'the stub' : 'the real module'}`);
  console.log(`${r.checked} checked · ${r.passed} still pass · ${r.held.length} held now · ${r.released.length} back to the owner`);
  for (const it of r.held.map(line)) {
    console.log(`  held      ${it.platform.padEnd(9)} ${it.title}`);
    for (const es of it.es) console.log(`            · ${es}`);
  }
  for (const it of r.released.map(line)) console.log(`  released  ${it.platform.padEnd(9)} ${it.title} (waits for the owner again)`);
}
