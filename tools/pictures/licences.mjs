#!/usr/bin/env node
// What the licence rules remove, measured on the candidate pictures of a measurement (tools/pictures/measure.mjs):
// every distinct Commons file the desk looked at for the sampled stories, by licence family, and what each rule
// (NonCommercial, NoDerivatives, terms that forbid alteration, GFDL only, unknown terms, no author, an author the
// screen cannot write) refused; then the share of ShareAlike among the picks; and the outlets' photos (never cleared).
//
//   node tools/pictures/licences.mjs [--out data/pictures-measure]
import fs from 'node:fs';
import path from 'node:path';
import { LICENCES, licenceOf } from '../../server/rights.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, [])
);
const out = path.resolve(args.out || 'data/pictures-measure');
const results = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));
const kept = JSON.parse(fs.readFileSync(path.join(out, 'answers.json'), 'utf8')).answers;

// every Commons file looked at for the sample (Wikidata pictures of the options; searched files are not kept per story)
const files = new Set();
for (const r of results) for (const o of r.options || []) for (const f of o.files || []) files.add(f);
const family = (id) => {
  if (!id) return 'unknown or unreviewed terms';
  const t = LICENCES[id];
  if (!t) return id;
  if (/NC/.test(id)) return 'NonCommercial (CC BY-NC, BY-NC-SA)';
  if (/ND/.test(id)) return 'NoDerivatives (CC BY-ND, BY-NC-ND)';
  if (/^CC-BY-SA|^FAL/.test(id)) return 'ShareAlike (CC BY-SA, FAL)';
  if (/^CC-BY/.test(id)) return 'Attribution (CC BY)';
  if (/^CC0|^PD/.test(id)) return 'public domain, CC0';
  if (/^OGL/.test(id)) return 'Open Government Licence';
  return id;
};
const byFamily = {};
const named = {};
let seen = 0;
for (const f of files) {
  const rec = kept[`f:${f}`]?.[1];
  if (!rec) continue;
  seen++;
  const id = rec.licence || licenceOf(rec.licenceName || '', rec.licenceUrl || '') || null;
  const fam = family(id);
  byFamily[fam] = (byFamily[fam] || 0) + 1;
  if (!id || !LICENCES[id] || LICENCES[id].why) named[rec.licenceName || 'none'] = (named[rec.licenceName || 'none'] || 0) + 1;
}
// what the rights rules refused among the candidates (the desk's own reasons)
const refused = {};
for (const r of results) for (const o of r.options || []) for (const x of o.rejected || []) if (/^rights:/.test(x.problem)) refused[x.problem] = (refused[x.problem] || 0) + 1;
const picks = results.filter((r) => r.pick);
const pickFam = {};
for (const r of picks) pickFam[family(r.pick.licence)] = (pickFam[family(r.pick.licence)] || 0) + 1;
const outlets = results.filter((r) => r.before).length;

console.log(`stories ${results.length}; Commons files looked at: ${files.size} (metadata kept for ${seen})`);
console.log('\ncandidate files by licence family:');
for (const [k, v] of Object.entries(byFamily).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('\nlicence names not cleared (as Commons writes them):');
for (const [k, v] of Object.entries(named).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('\nrefused by the rights rules (reason as the desk gives it):');
for (const [k, v] of Object.entries(refused).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`\npicks ${picks.length} by licence family:`);
for (const [k, v] of Object.entries(pickFam).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}  (${((100 * v) / picks.length).toFixed(1)} %)`);
// every Commons file the desk has looked at in all rounds (Wikidata pictures and searched files alike)
const all = {};
let total = 0;
for (const [k, v] of Object.entries(kept)) {
  if (!k.startsWith('f:') || !v?.[1]) continue;
  total++;
  const rec = v[1];
  const fam = family(rec.licence || licenceOf(rec.licenceName || '', rec.licenceUrl || '') || null);
  all[fam] = (all[fam] || 0) + 1;
}
const searched = Object.entries(kept).filter(([k, v]) => /^s:/.test(k) && Array.isArray(v?.[1]));
for (const [, v] of searched) {
  for (const rec of v[1]) {
    total++;
    const fam = family(rec.licence || licenceOf(rec.licenceName || '', rec.licenceUrl || '') || null);
    all[fam] = (all[fam] || 0) + 1;
  }
}
console.log(`\nevery Commons file the desk looked at in all rounds (${total}, Wikidata pictures and search results):`);
for (const [k, v] of Object.entries(all).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`\noutlet photos the stories aired with: ${outlets}, cleared: 0 (no licence: an agency's or outlet's terms forbid reuse and alteration)`);
