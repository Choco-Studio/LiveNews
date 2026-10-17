#!/usr/bin/env node
// Reads tools/pictures/measure.mjs's results and prints the numbers the critique quotes, and a hand-check sheet: one
// line per cleared pick (the story, the subject, the file, the credit) for a person to judge, and every portrait
// with the Wikidata item it was resolved to (the wrong-person check).
//
//   node tools/pictures/report.mjs [--out data/pictures-measure] [--picks] [--portraits] [--none] [--judged <file>]
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, [])
);
const out = path.resolve(args.out || 'data/pictures-measure');
const results = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
const n = results.length;
const lines = [];
const say = (s = '') => lines.push(s);

say(`stories ${n} (unique aired stories, real feeds)`);
say(`outlet photo before: ${results.filter((r) => r.before).length} (${pct(results.filter((r) => r.before).length, n)})`);
say(`cleared picture now: ${results.filter((r) => r.pick).length} (${pct(results.filter((r) => r.pick).length, n)})`);
say(`undecided (a source never answered): ${results.filter((r) => !r.decided).length}`);
const kinds = {};
for (const r of results.filter((x) => x.pick)) kinds[r.pick.kind] = (kinds[r.pick.kind] || 0) + 1;
say(`by kind: ${JSON.stringify(kinds)}`);
const lic = {};
for (const r of results.filter((x) => x.pick)) lic[r.pick.licence] = (lic[r.pick.licence] || 0) + 1;
say(`licences of the picks: ${JSON.stringify(lic)}`);
say('');
say('programme        n   before   cleared   grave(n)  cleared among non-grave');
const progs = [...new Set(results.map((r) => r.programme))];
for (const p of progs) {
  const list = results.filter((r) => r.programme === p);
  const ng = list.filter((r) => !r.plan?.flags?.grave);
  say(`${p.padEnd(14)} ${String(list.length).padStart(4)}  ${pct(list.filter((r) => r.before).length, list.length).padStart(6)}   ${pct(list.filter((r) => r.pick).length, list.length).padStart(6)}   ${String(list.length - ng.length).padStart(6)}    ${pct(ng.filter((r) => r.pick).length, ng.length)}`);
}
const grave = results.filter((r) => r.plan?.flags?.grave);
say(`grave stories: ${grave.length}, with a cleared picture ${grave.filter((r) => r.pick).length} (portraits only: ${grave.filter((r) => r.pick?.kind === 'portrait').length})`);
say('');
// what each rule removed (candidate files refused, subjects refused)
const removed = {};
const licences = {};
for (const r of results) {
  for (const o of r.options) {
    for (const x of o.rejected) {
      const key = x.problem.replace(/\s*\(.*$/, '').replace(/ [\d.]+$/, '');
      removed[key] = (removed[key] || 0) + 1;
      if (/^rights/.test(x.problem)) licences[x.licence || 'unknown'] = (licences[x.licence || 'unknown'] || 0) + 1;
    }
    if (o.refused) removed[`subject: ${o.refused}`] = (removed[`subject: ${o.refused}`] || 0) + 1;
  }
}
say('what each rule removed (candidate pictures and subjects):');
for (const [k, v] of Object.entries(removed).sort((a, b) => b[1] - a[1])) say(`  ${String(v).padStart(4)}  ${k}`);
say(`licences refused: ${JSON.stringify(licences)}`);
// resolution after pixelation: the 16:9 crop of each pick against the full shot it is pixelated to (416x234)
const sized = results.filter((r) => r.pick?.width && r.pick?.height);
const crops = sized.map((r) => Math.min(r.pick.width, (r.pick.height * 16) / 9)).sort((a, b) => a - b);
const q = (p) => Math.round(crops[Math.min(crops.length - 1, Math.floor(p * crops.length))] || 0);
say('');
say(`resolution (picks with a known size, ${sized.length}; NASA's are sized on download): 16:9 crop width min ${q(0)} / median ${q(0.5)} / max ${q(0.999)} px; at least 2x the full shot (832 px): ${pct(crops.filter((c) => c >= 832).length, crops.length)}; no upscaling (416 px): ${pct(crops.filter((c) => c >= 416).length, crops.length)}`);
const portraits = results.filter((r) => r.pick?.kind === 'portrait');
say(`portraits: ${portraits.length}, tall (focus on the head): ${portraits.filter((r) => r.pick.height > r.pick.width).length}`);
console.log(lines.join('\n'));

if (args.picks) {
  console.log('\n--- picks (hand check) ---');
  results
    .filter((r) => r.pick)
    .forEach((r, i) => console.log(`${String(i + 1).padStart(3)} [${r.programme}] ${r.plan?.flags?.grave ? 'GRAVE ' : ''}${r.title.slice(0, 100)}\n      -> ${r.pick.kind} "${r.pick.subject?.label}" ${r.pick.subject?.qid || ''} ${r.pick.subject?.how || ''}\n      file: ${decodeURIComponent((r.pick.page || r.pick.url).split('/').pop()).slice(0, 110)}\n      ${r.pick.credit}`));
}
if (args.portraits) {
  console.log('\n--- portraits (wrong-person check) ---');
  for (const r of results.filter((x) => x.pick?.kind === 'portrait')) console.log(`${r.pick.subject.label} (${r.pick.subject.qid}, ${r.pick.subject.how}) <- "${r.title.slice(0, 90)}" | ${r.summary.slice(0, 140)}`);
}
if (args.none) {
  console.log('\n--- no cleared picture ---');
  for (const r of results.filter((x) => !x.pick)) console.log(`[${r.programme}] ${r.plan?.flags?.grave ? 'GRAVE ' : ''}${r.title.slice(0, 100)} | subjects ${JSON.stringify(r.plan?.subjects || [])} | ${r.options.map((o) => `${o.label}:${o.refused || o.rejected.map((x) => x.problem).join('/') || 'ok'}`).join('; ')}`);
}
