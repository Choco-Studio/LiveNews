#!/usr/bin/env node
// The licence audit of a picture-bench run (docs/roadmap/FOTOS_LIBRES.md §7: "0 pictures that are not free"):
// every chosen picture is read AGAIN from its own source, with fresh clients that share no cache with the desk,
// and judged by the youtube profile and the provenance check.
//   Commons files   their file page (licence, author, categories)
//   pixabay:<id>    the Pixabay API by id (still published, still a photo, not AI-generated)
//   nasa:<id>       NASA's library by nasa_id (still there, still credited to NASA)
//
//   node tools/pictures/audit.mjs data/bench/run-brief-r5.json      (rewrites the run's summary.auditFailures)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Commons } from '../../server/freepics/commons.js';
import { allowedFor, PROFILES } from '../../server/freepics/licence.js';
import { provenance } from '../../server/freepics/provenance.js';
import { parsePixabayHit, parseNasaItem } from '../../server/freepics/stock.js';
import { config } from '../../server/config.js';

const json = async (url) => {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

async function reread(name, commons) {
  if (name.startsWith('pixabay:')) {
    if (!config.pictures.pixabayKey) throw new Error('no PIXABAY_API_KEY to audit with');
    const u = new URL('https://pixabay.com/api/');
    u.searchParams.set('key', config.pictures.pixabayKey);
    u.searchParams.set('id', name.slice(8));
    return parsePixabayHit((await json(u.toString())).hits?.[0]);
  }
  if (name.startsWith('nasa:')) {
    const u = new URL('https://images-api.nasa.gov/search');
    u.searchParams.set('nasa_id', name.slice(5));
    return parseNasaItem((await json(u.toString())).collection?.items?.[0]);
  }
  return (await commons.files([name]))[0] || null;
}

/** [{ id, file, ok, why }] for every result with a picture. */
export async function audit(results) {
  const commons = new Commons({ gapMs: 400 });
  const out = [];
  for (const r of results.filter((x) => x.picture)) {
    const name = r.picture.record.file;
    let f = null;
    try {
      f = await reread(name, commons);
    } catch (err) {
      out.push({ id: r.id, file: name, ok: false, why: `re-read failed: ${err.message}` });
      continue;
    }
    if (!f) {
      out.push({ id: r.id, file: name, ok: false, why: 'gone, or no longer passes its source rules (AI-generated, third-party credit)' });
      continue;
    }
    const lic = allowedFor(f.licence.id, PROFILES.youtube);
    const prov = provenance(f);
    out.push({ id: r.id, file: name, ok: lic && prov.ok, why: [!lic && `licence ${f.licence.label || f.licenceName}`, ...prov.reasons].filter(Boolean).join('; ') || null });
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runPath = path.resolve(process.argv[2] || 'data/bench/run-brief.json');
  const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
  const a = await audit(run.results);
  run.summary.auditFailures = a.filter((x) => !x.ok);
  run.summary.audited = a.length;
  fs.writeFileSync(runPath, JSON.stringify(run, null, 1));
  console.log(`${a.length} audited, ${run.summary.auditFailures.length} failures`);
  for (const x of run.summary.auditFailures) console.log(' ', x.file, '—', x.why);
}
