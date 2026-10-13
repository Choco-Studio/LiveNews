#!/usr/bin/env node
// Take a snapshot of the live feeds and the sport articles for FULL TIME's gate:
//   NODE_USE_ENV_PROXY=1 node tools/sport/take.mjs [name]      (default name: the UTC time, e.g. 2026-10-17T1830)
// It lands in data/sport-snapshots/<name>/ with the moment it was taken (T0).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freezeClock, snapDesk } from './snapshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const now = new Date();
const name = process.argv[2] || now.toISOString().slice(0, 16).replace(':', '');
const dir = path.join(root, 'data', 'sport-snapshots', name);
fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(`${dir}/T0`)) fs.writeFileSync(`${dir}/T0`, now.toISOString());
freezeClock(Date.parse(fs.readFileSync(`${dir}/T0`, 'utf8')));
const desk = await snapDesk(root, dir);
const list = desk.candidates(40, { categories: ['sport'] });
let read = 0;
for (const s of list) {
  try {
    await desk.readArticle(s);
    read++;
  } catch {}
}
console.log(`${name}: ${list.length} sport stories, ${read} articles read -> ${path.relative(root, dir)}`);
