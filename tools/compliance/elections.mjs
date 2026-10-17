#!/usr/bin/env node
// The election calendar for the recreation rule (server/compliance/elections.js): Wikidata's votes of the next 75
// days, written to server/compliance/elections.json (committed, the fallback) or to --out. The server keeps its own
// copy fresh every day (data/compliance/elections.json); run this before a commit so the fallback is never stale.
//
//   NODE_USE_ENV_PROXY=1 node tools/compliance/elections.mjs [--out <file>] [--days 75]
import path from 'node:path';

import { fetchCalendar, saveCalendar, CALENDAR_FILE } from '../../server/compliance/elections.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const out = path.resolve(opt('out', CALENDAR_FILE));
const days = Number(opt('days', 75)) || 75;

const cal = await fetchCalendar({ days });
if (!cal.elections.length) {
  console.error('Wikidata answered no elections: the calendar was not written');
  process.exit(1);
}
saveCalendar(cal, out);
const by = {};
for (const e of cal.elections) by[e.level] = (by[e.level] || 0) + 1;
console.log(`${cal.elections.length} votes to ${out} (${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')})`);
for (const e of cal.elections.filter((x) => x.level !== 'local' && x.level !== 'by-election').slice(0, 40)) {
  console.log(`  ${e.date}  ${e.country.padEnd(22)} ${e.level.padEnd(10)} ${e.name}${e.candidates.length ? `  (${e.candidates.length} candidates)` : ''}`);
}
