#!/usr/bin/env node
// Visual briefs for the picture bench (docs/roadmap/FOTOS_LIBRES.md §7): the model the channel runs (CODEX_MODEL)
// writes the brief of every bench story, in batches, as the writer will on air. Saved next to the bench.
//
//   node tools/pictures/briefs.mjs [--bench data/bench/pictures.json] [--batch 20] [--out data/bench/briefs.json]
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../server/config.js';
import { createCodexProvider } from '../../server/providers/codexExec.js';
import { extractJson } from '../../server/writer.js';
import { buildBriefPrompt, parseBriefs } from '../../server/freepics/brief.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const benchPath = path.resolve(arg('bench', 'data/bench/pictures.json'));
const outPath = path.resolve(arg('out', path.join(path.dirname(benchPath), 'briefs.json')));
const batch = Number(arg('batch', 20));

const bench = JSON.parse(fs.readFileSync(benchPath, 'utf8'));
const done = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { model: config.codex.model, briefs: {} };
const codex = createCodexProvider(config.codex);
const todo = bench.stories.filter((s) => !done.briefs[s.id]);
console.log(`${todo.length} stories without a brief (model ${config.codex.model})`);
for (let i = 0; i < todo.length; i += batch) {
  const part = todo.slice(i, i + batch);
  const t0 = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { text, usage } = await codex.generate({ prompt: buildBriefPrompt(part) });
      const got = parseBriefs(extractJson(text), part.map((s) => s.id), new Map(part.map((s) => [s.id, `${s.title} ${s.summary || ''}`])));
      for (const [id, b] of got) done.briefs[id] = b;
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(done, null, 1));
      console.log(`batch ${i / batch + 1}: ${got.size}/${part.length} briefs in ${((Date.now() - t0) / 1000).toFixed(0)} s (in ${usage.input}, out ${usage.output})`);
      break;
    } catch (err) {
      console.log(`batch ${i / batch + 1} attempt ${attempt}: ${err.message}`);
    }
  }
}
console.log(`${Object.keys(done.briefs).length}/${bench.stories.length} briefs → ${outPath}`);
