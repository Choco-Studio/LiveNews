#!/usr/bin/env node
// Picture bench (docs/roadmap/FOTOS_LIBRES.md §7): a frozen sample of REAL stories from the live feeds, to
// measure the free-picture desk against. Stratified by section (so world news does not drown science and
// business) with a fixed share of grave stories (the cases where a wrong picture hurts most). Saved to
// data/bench/ (not in git: the summaries are the outlets' text).
//
//   node tools/pictures/build-bench.mjs [--count 200] [--grave 0.25] [--out data/bench/pictures.json]
import fs from 'node:fs';
import path from 'node:path';
import { NewsDesk } from '../../server/news.js';
import { isGrave } from '../../server/facts.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), [])
);
const COUNT = Number(args.count ?? 200);
const GRAVE_SHARE = Number(args.grave ?? 0.25);
const OUT = path.resolve(String(args.out ?? 'data/bench/pictures.json'));

const quiet = { info() {}, warn() {}, error() {}, log() {} };
const desk = new NewsDesk({ log: quiet });
await desk.refresh();
const all = [...desk.stories.values()].filter((s) => s.title && s.summary && String(s.summary).length > 60);

// a seeded shuffle, so a re-run on the same desk picks the same sample
let seed = 20261007;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const shuffled = all.map((s) => [rnd(), s]).sort((a, b) => a[0] - b[0]).map(([, s]) => s);

const graveOf = (s) => isGrave(`${s.title}. ${s.summary}`);
const byCat = new Map();
for (const s of shuffled) {
  const c = s.category || 'other';
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c).push(s);
}
const wantGrave = Math.round(COUNT * GRAVE_SHARE);
const picked = [];
const seen = new Set();
const take = (s) => {
  if (seen.has(s.id) || picked.length >= COUNT) return;
  seen.add(s.id);
  picked.push(s);
};
// grave first (they are the rarer, harder half of the test), round-robin over sections
for (let round = 0; picked.length < wantGrave && round < 100; round++) {
  for (const list of byCat.values()) {
    const s = list.filter((x) => !seen.has(x.id) && graveOf(x))[0];
    if (s) take(s);
    if (picked.length >= wantGrave) break;
  }
}
// then the rest, round-robin over sections
for (let round = 0; picked.length < COUNT && round < 1000; round++) {
  let added = false;
  for (const list of byCat.values()) {
    const s = list.find((x) => !seen.has(x.id) && !graveOf(x));
    if (s) {
      take(s);
      added = true;
    }
  }
  if (!added) break;
}

const bench = {
  built: new Date().toISOString(),
  note: 'Real stories from the live feeds; the outlet picture is kept for comparison only, never as a candidate.',
  stories: picked.map((s) => ({
    id: s.id,
    title: s.title,
    summary: String(s.summary).slice(0, 600),
    category: s.category || 'other',
    source: s.source,
    link: s.link || null,
    published: s.published || null,
    grave: graveOf(s),
    outletPicture: s.image ? { url: s.image, credit: s.imageCredit || null } : null,
  })),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bench, null, 2));
const cats = {};
for (const s of bench.stories) cats[s.category] = (cats[s.category] || 0) + 1;
console.log(`${bench.stories.length} stories (${bench.stories.filter((s) => s.grave).length} grave) from ${all.length} on the desk → ${OUT}`);
console.log(cats);
