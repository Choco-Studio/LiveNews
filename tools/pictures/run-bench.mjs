#!/usr/bin/env node
// Runs the free-picture desk over the picture bench (docs/roadmap/FOTOS_LIBRES.md §7) and audits what it chose.
//
//   node tools/pictures/run-bench.mjs [--briefs data/bench/briefs.json | --no-brief] [--limit N] [--out data/bench/run-<mode>.json]
//
// For every story: the picture (or none) and why candidates were turned down. Then the audit, which is the
// phase-1 gate ("0 pictures that are not free"): every chosen file's licence and provenance are read AGAIN from
// Commons with a fresh client (no cache shared with the desk) and judged by the youtube profile.
import fs from 'node:fs';
import path from 'node:path';
import { FreePictureDesk } from '../../server/freepics/desk.js';
import { audit as auditPictures } from './audit.mjs';
import { cleanBrief } from '../../server/freepics/brief.js';
import { Pixabay, NasaImages } from '../../server/freepics/stock.js';
import { config } from '../../server/config.js';

const has = (name) => process.argv.includes(`--${name}`);
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const bench = JSON.parse(fs.readFileSync(path.resolve(arg('bench', 'data/bench/pictures.json')), 'utf8'));
const briefsPath = path.resolve(arg('briefs', 'data/bench/briefs.json'));
const useBrief = !has('no-brief') && fs.existsSync(briefsPath);
const briefs = useBrief ? JSON.parse(fs.readFileSync(briefsPath, 'utf8')).briefs : {};
const mode = useBrief ? 'brief' : 'headline';
const outPath = path.resolve(arg('out', `data/bench/run-${mode}.json`));
const stories = bench.stories.slice(0, Number(arg('limit', bench.stories.length)));

// the phase-2 sources as the channel runs them (PIXABAY_API_KEY from .env; --no-phase2 for the phase-1 desk alone)
const phase2 = !has('no-phase2');
const desk = new FreePictureDesk({ log: { warn: (m) => console.log(m) }, stock: phase2 && config.pictures.pixabayKey ? new Pixabay({ key: config.pictures.pixabayKey }) : null, nasa: phase2 ? new NasaImages() : null });
const results = [];
const t0 = Date.now();
for (const [i, s] of stories.entries()) {
  // grounded against the story's own text, as the writer's brief is on air (server/writer.js normalizeBulletin)
  const brief = briefs[s.id] ? cleanBrief(briefs[s.id], { source: `${s.title} ${s.summary || ''}` }) : null;
  const t = Date.now();
  let pic = null;
  let error = null;
  try {
    pic = await desk.find(s, { brief });
  } catch (err) {
    error = err.message;
  }
  results.push({ id: s.id, title: s.title, category: s.category, grave: s.grave, brief, ms: Date.now() - t, error, picture: pic, run: desk.lastRun });
  if ((i + 1) % 20 === 0) console.log(`${i + 1}/${stories.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

// the audit: every chosen picture re-read from its own source (tools/pictures/audit.mjs)
const chosen = results.filter((r) => r.picture);
const audit = await auditPictures(results);

const by = (k) => chosen.reduce((m, r) => ((m[r.picture[k]] = (m[r.picture[k]] || 0) + 1), m), {});
const summary = {
  mode,
  stories: results.length,
  withPicture: chosen.length,
  coverage: +(chosen.length / results.length).toFixed(3),
  graveWithPicture: chosen.filter((r) => r.grave).length,
  grave: results.filter((r) => r.grave).length,
  via: by('via'),
  portraits: chosen.filter((r) => r.picture.focusY).length,
  auditFailures: audit.filter((a) => !a.ok),
  errors: results.filter((r) => r.error).length,
  medianMs: results.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(results.length / 2)],
  seconds: Math.round((Date.now() - t0) / 1000),
};
fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.log(`→ ${outPath}`);
