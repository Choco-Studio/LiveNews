#!/usr/bin/env node
// Measured strips for the pace lab (owner: PACE stream): takes the analyser's
// JSON for a BEFORE and an AFTER recording (node tools/pace/analyse.mjs ... --json)
// and writes, per programme, the shots the viewer saw, who spoke when and the
// pauses, into the MEASURED block of public/lab/pace.html, so the lab's
// 'measured' view draws the real on-air rhythm (deterministic, no server data).
//
//   node tools/pace/strips.mjs before.json after.json [--lab public/lab/pace.html]

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const li = argv.indexOf('--lab');
const lab = li >= 0 ? argv[li + 1] : fileURLToPath(new URL('../../public/lab/pace.html', import.meta.url));
const [beforeFile, afterFile] = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--lab');
const ID = { 'WORLD NOW': 'world-now', 'TECH BYTES': 'tech-bytes', 'NEWS IN 60': 'news-60', 'COSMOS DESK': 'cosmos', 'MONEY MINUTE': 'money-minute' };
const pick = (file) => {
  const out = {};
  for (const f of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    for (const [k, p] of (f.programmes || []).entries()) {
      const id = ID[p.title] || p.programId;
      if (p.partial || out[id]) continue;
      out[id] = { length: p.length, stories: p.stories, strip: p.strip, summary: f.summaries?.[k] ?? null, file: (f.file || '').split('/').pop() };
    }
  }
  return out;
};
const data = { before: pick(beforeFile), after: pick(afterFile), made: new Date().toISOString().slice(0, 16) };
const html = fs.readFileSync(lab, 'utf8');
const block = `/* MEASURED:BEGIN (tools/pace/strips.mjs) */ const MEASURED = ${JSON.stringify(data)}; /* MEASURED:END */`;
const next = html.replace(/\/\* MEASURED:BEGIN[\s\S]*?MEASURED:END \*\//, block);
if (next === html && !html.includes('MEASURED:BEGIN')) throw new Error('no MEASURED block in the lab page');
fs.writeFileSync(lab, next);
console.log(`measured strips: before ${Object.keys(data.before).join(', ')} | after ${Object.keys(data.after).join(', ')} → ${lab}`);
