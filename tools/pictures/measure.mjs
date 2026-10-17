#!/usr/bin/env node
// The cleared-picture measurement (docs/roadmap/critique/cleared-pictures.md): runs the rights-aware picture desk
// (server/picturedesk.js) over the real archive's aired stories and writes what it picked, what it refused and why,
// next to what aired before (the outlet's own photo).
//
//   NODE_USE_ENV_PROXY=1 node tools/pictures/measure.mjs [--archive data/archive] [--out <dir>] [--per world-now=180,...]
//        [--seed 17] [--all] [--exclude <another results.json>[,<another>...]] [--openverse <requests a day, 0: none>]
//
// Wikimedia answers are kept in <out>/answers.json, so a second run asks nothing it already asked. A 429 pauses the
// desk; this tool (never the station) then waits for the pause to end and asks the stories left again, up to --rounds.
import fs from 'node:fs';
import path from 'node:path';
import { PictureDesk } from '../../server/picturedesk.js';
import { WikimediaClient, PacedJson, wikimediaAgent } from '../../server/wikimedia.js';
import { OpenverseClient } from '../../server/openverse.js';
import { ImageSearch } from '../../server/imagesearch.js';
import { FaceStore } from '../../server/faces.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, [])
);
const archiveDir = path.resolve(args.archive || 'data/archive');
const out = path.resolve(args.out || 'data/pictures-measure');
const seed = Number(args.seed || 17);
const rounds = Number(args.rounds || 40);
const patience = Number(args.patience || 12);
const per = Object.fromEntries(String(args.per || 'world-now=180,tech-bytes=90,cosmos=70,news-60=60,money-minute=40').split(',').map((x) => x.split('=')).map(([k, v]) => [k, Number(v)]));
fs.mkdirSync(out, { recursive: true });

// ---- the aired stories (real feeds only: the offline fixtures and the fictional sport desk are left out)
const rows = [];
for (const f of fs.readdirSync(archiveDir).filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort()) {
  for (const line of fs.readFileSync(path.join(archiveDir, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {}
  }
}
const real = (e) => !/^file:/.test(e.image || '') && !/^pages\//.test(e.link || '') && !/^Pixelburg/.test(e.source || '');
const byId = new Map();
for (const e of rows.filter(real)) {
  const prev = byId.get(e.id);
  // the story as it first aired, with the programmes it aired in
  if (!prev) byId.set(e.id, { ...e, programmes: [e.programId], airings: 1 });
  else {
    prev.airings++;
    if (!prev.programmes.includes(e.programId)) prev.programmes.push(e.programId);
    if (!prev.image && e.image) Object.assign(prev, { image: e.image, images: e.images });
  }
}
let rnd = seed;
const random = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
// --exclude <results.json>[,...]: leave out the stories other measurements sampled (a disjoint sample)
const excluded = new Set(args.exclude ? String(args.exclude).split(",").flatMap((f) => JSON.parse(fs.readFileSync(path.resolve(f), "utf8")).map((r) => r.id)) : []);
const pool = [...byId.values()].filter((e) => !excluded.has(e.id));
let sample;
if (args.all) sample = pool;
else {
  sample = [];
  for (const [prog, n] of Object.entries(per)) {
    const list = pool.filter((e) => e.programId === prog).map((e) => ({ e, r: random() })).sort((a, b) => a.r - b.r).slice(0, n).map((x) => x.e);
    sample.push(...list);
  }
}
console.log(`[measure] ${rows.length} aired rows, ${pool.length} real stories, sample ${sample.length}`);

// ---- the desk, as index.js builds it
const wm = new WikimediaClient({ gapMs: Number(args.gap || 1500), contact: process.env.WIKIMEDIA_CONTACT || undefined, log: { warn: (m) => console.warn(m) } });
const search = new ImageSearch({ wikimedia: wm, log: { warn: (m) => console.warn(m) } });
// the face reader's verdicts (tools/pictures/faces.mjs --dir <out> reads what this run queued; run this again after it)
const faces = new FaceStore({ dir: out, log: { warn: (m) => console.warn(m) } });
// Openverse (institutions' Flickr pictures), anonymously, under its daily allowance (--openverse 0: not asked)
const ovDay = Number(args.openverse ?? 120);
const openverse = ovDay > 0 ? new OpenverseClient({ agent: wikimediaAgent(process.env.WIKIMEDIA_CONTACT || undefined), perDay: ovDay, log: { warn: (m) => console.warn(m) } }) : null;
const desk = new PictureDesk({ dir: out, wikimedia: wm, nasa: new PacedJson({ gapMs: 500 }), search, faces, openverse, log: { warn: (m) => console.warn(m) } });

// --redecide: keep every answer Wikimedia gave, decide again with the rules as they are now
if (args.redecide) for (const k of [...desk.kept.map.keys()]) if (k.startsWith('d:')) desk.kept.map.delete(k);

const stories = sample.map((e) => ({ id: e.id, title: e.title, summary: e.summary, source: e.source, category: e.category, link: e.link, grave: !!e.grave, published: e.at, at: e.at }));
const decided = new Map();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let round = 0; round < rounds; round++) {
  const left = stories.filter((s) => !decided.has(s.id));
  if (!left.length) break;
  for (let i = 0; i < left.length; i += 40) {
    const batch = left.slice(i, i + 40);
    if (wm.paused) await wait(wm.pausedUntil - Date.now() + 500);
    const res = await desk.decide(batch, { budgetMs: 10 * 60_000 });
    for (const s of batch) {
      const d = res.get(s.id);
      // (a decision a source did not fully answer is asked again, up to --patience rounds; then its picture counts)
      // (one waiting only for the face reader counts as decided: the reader runs between two passes)
      if (d && (d.complete || d.awaitingFaces || (round >= patience && d.picks?.length))) decided.set(s.id, d);
    }
    process.stdout.write(`\r[measure] round ${round + 1}: ${decided.size}/${stories.length} decided  wikimedia ${JSON.stringify(wm.stats)}   `);
  }
  if (stories.every((s) => decided.has(s.id))) break;
  if (wm.paused) await wait(Math.max(0, wm.pausedUntil - Date.now()) + 1000);
}
console.log('');
desk.kept.save({ force: true });

// ---- the results
const results = sample.map((e) => {
  const d = decided.get(e.id) || null;
  const pick = d?.picks?.[0] || null;
  return {
    id: e.id,
    programme: e.programId,
    programmes: e.programmes,
    category: e.category,
    source: e.source,
    title: e.title,
    summary: e.summary,
    grave: !!e.grave,
    location: e.location || null,
    before: e.image ? { image: e.image, images: e.images || null } : null,
    decided: !!d,
    pick: pick ? { url: pick.url, width: pick.width, height: pick.height, tier: pick.tier, kind: pick.kind, subject: pick.subject, focus: pick.focus, credit: pick.rights.credit, licence: pick.rights.licence.id, author: pick.rights.author, page: pick.rights.page, label: pick.rights.label, attribution: pick.rights.attribution, restrictions: pick.rights.restrictions } : null,
    alternates: (d?.picks || []).slice(1).map((p) => ({ url: p.url, kind: p.kind, subject: p.subject?.label, credit: p.rights.credit })),
    options: (d?.options || []).map((o) => ({ kind: o.kind, tier: o.tier, label: o.label, qid: o.qid, refused: o.refused || null, how: o.how || null, files: o.files, rejected: o.rejected || [] })),
    plan: d?.plan || null,
  };
});
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));

// ---- the numbers
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
const n = results.length;
const before = results.filter((r) => r.before).length;
const after = results.filter((r) => r.pick).length;
const undecided = results.filter((r) => !r.decided).length;
const byKind = {};
for (const r of results.filter((x) => x.pick)) byKind[r.pick.kind] = (byKind[r.pick.kind] || 0) + 1;
const byProg = {};
for (const r of results) {
  const p = (byProg[r.programme] ||= { n: 0, before: 0, after: 0 });
  p.n++;
  if (r.before) p.before++;
  if (r.pick) p.after++;
}
// what each rule removed: every candidate file refused, by reason (licence families named)
const removed = {};
const licences = {};
for (const r of results) {
  for (const o of r.options) {
    for (const x of o.rejected) {
      const key = x.problem.replace(/\s*\(.*$/, '').replace(/ \d\.\d+$/, '');
      removed[key] = (removed[key] || 0) + 1;
      if (/^rights/.test(x.problem)) licences[x.licence || 'unknown'] = (licences[x.licence || 'unknown'] || 0) + 1;
    }
    if (o.refused) removed[`subject refused: ${o.refused}`] = (removed[`subject refused: ${o.refused}`] || 0) + 1;
  }
}
const summary = { stories: n, before, after, undecided, coverageBefore: pct(before, n), coverageAfter: pct(after, n), byKind, byProgramme: byProg, removed, refusedLicences: licences, wikimedia: wm.stats };
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
