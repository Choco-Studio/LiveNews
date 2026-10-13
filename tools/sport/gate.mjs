#!/usr/bin/env node
// FULL TIME's step-2 gate (docs/roadmap/critique/full-time-writing.md): editions from every snapshot in
// data/sport-snapshots/ (or those named), each read at its own time, four and ten hours later and the next morning, and
// the offline desk on a weekday morning, a Saturday evening and a Monday morning. Each edition is written in full to
// data/sport-gate/<snapshot>@<air>.txt with its automatic checks; this prints the checks. Read the editions too.
//   node tools/sport/gate.mjs [snapshot names...]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const snaps = path.join(root, 'data', 'sport-snapshots');
const out = path.join(root, 'data', 'sport-gate');
fs.mkdirSync(out, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.existsSync(snaps) ? fs.readdirSync(snaps).filter((n) => fs.existsSync(path.join(snaps, n, 'T0'))).sort() : [];
const H = 3600_000;
const runs = [];
for (const n of names) {
  const t0 = Date.parse(fs.readFileSync(path.join(snaps, n, 'T0'), 'utf8').trim());
  const morning = new Date(t0 + 24 * H);
  morning.setUTCHours(7, 5, 0, 0);
  for (const at of [t0, t0 + 4 * H, t0 + 10 * H, morning.getTime()]) runs.push([n, new Date(at).toISOString()]);
}
for (const at of ['2026-10-13T08:20:00Z', '2026-10-17T18:30:00Z', '2026-10-19T08:10:00Z']) runs.push(['offline', at]);
let faults = 0;
for (const [snap, at] of runs) {
  const file = path.join(out, `${snap}@${at.slice(0, 16).replace(':', '')}.txt`);
  try {
    execFileSync(process.execPath, [path.join(here, 'edition.mjs'), snap, at, file], { stdio: 'ignore', timeout: 300_000, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    const text = fs.readFileSync(file, 'utf8');
    const checks = (text.match(/^CHECKS: .*$/m) || ['CHECKS: none'])[0];
    if (!/clean/.test(checks)) faults++;
    console.log(`${path.basename(file)}: ${checks}${/NO EDITION/.test(text) ? ' (no edition)' : ''}`);
  } catch (err) {
    faults++;
    console.log(`${path.basename(file)}: FAILED ${String(err.message).split('\n')[0]}`);
  }
}
console.log(`${runs.length} editions, ${faults} with faults`);
