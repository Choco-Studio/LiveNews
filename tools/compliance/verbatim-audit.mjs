#!/usr/bin/env node
// The verbatim audit (docs/publishing/verbatim.md): on the real archive's editions (data/archive, what the channel
// aired, story by story), how much of the on-air text is copied word for word from the story's own article, outside
// attributed quotations; and what the proposed rule would cost in length.
//
//   NODE_USE_ENV_PROXY=1 node tools/compliance/verbatim-audit.mjs --archive data/archive --cache <dir> \
//     [--out report.json] [--concurrency 6] [--no-fetch]
//
// Sources per story: its title and feed summary (in the archive) and its article page (fetched once, cached in
// --cache; the same extraction the desk uses, server/article.js, read to 20,000 characters). Aired text per story: the
// presenter's reading of it (the archive keeps the first story segment) and the expert's analysis when there was one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storyReport, tokens, articleKey, MAX_RUN, MAX_SHARE, PHRASE } from '../../server/compliance/verbatim.js';
import { extractArticle } from '../../server/article.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const archiveDir = path.resolve(opt('archive', path.join(root, 'data', 'archive')));
const cacheDir = path.resolve(opt('cache', path.join(root, 'data', 'compliance', 'articles')));
const outFile = opt('out', null);
const conc = Number(opt('concurrency', 6)) || 6;
const fetchOn = !args.includes('--no-fetch');
const WPS = 2.6; // the channel's voices, words per second (server/voice/rates.json, about 156 wpm)
fs.mkdirSync(cacheDir, { recursive: true });

// ---- the archive: one entry per story told in an edition
const entries = [];
for (const f of fs.readdirSync(archiveDir).filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort()) {
  for (const line of fs.readFileSync(path.join(archiveDir, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch { /* torn line */ }
  }
}
const real = entries.filter((e) => /^https?:\/\//.test(e.link || '') && !/\.invalid\//.test(e.link));
console.log(`${entries.length} archived story tellings, ${real.length} with a real article link`);

// ---- the articles (cached)
const keyOf = articleKey; // the launch report reads the same cache (verbatim.js archiveSample)
async function article(link) {
  const f = path.join(cacheDir, `${keyOf(link)}.json`);
  if (fs.existsSync(f)) {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch { /* fetch again */ }
  }
  if (!fetchOn) return null;
  let doc = { link, status: null, text: null, via: null };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    const res = await fetch(link, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; GLOBIT24-compliance-audit/1.0)', accept: 'text/html' } });
    doc.status = res.status;
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer()).subarray(0, 1_500_000);
      const a = extractArticle(buf.toString('utf8'), { max: 20_000 });
      doc.text = a?.text || null;
      doc.via = a?.via || null;
    }
    clearTimeout(timer);
  } catch (err) {
    doc.error = String(err.message || err).slice(0, 120);
  }
  fs.writeFileSync(f, JSON.stringify(doc));
  return doc;
}

const links = [...new Set(real.map((e) => e.link))];
let done = 0;
const bodies = new Map();
const queue = links.slice();
await Promise.all(Array.from({ length: conc }, async () => {
  while (queue.length) {
    const l = queue.shift();
    const d = await article(l);
    bodies.set(l, d?.text || null);
    done++;
    if (done % 100 === 0) process.stdout.write(`  articles ${done}/${links.length}\r`);
  }
}));
const withBody = [...bodies.values()].filter(Boolean).length;
console.log(`articles: ${withBody} of ${links.length} read (${Math.round((withBody / Math.max(1, links.length)) * 100)} %)`);

// ---- per story telling
const sentencesOf = (text) => String(text).split(/(?<=[.!?…]["”’]?)\s+(?=["“‘]?[A-Z0-9])/).filter(Boolean);
// The rule's cost on a writer that cannot rephrase (the fallback writer): every sentence holding a run over the cap
// goes, then the most-copied sentences until the story's share is under the cap. Rules tried: [maxRun, maxShare].
const GRID = [[12, 0.2], [12, 0.35], [15, 0.35], [20, 0.5], [12, 1], [25, 1]];
function sentenceStats(aired, sources) {
  return sentencesOf(aired).map((x) => {
    const r = storyReport(x, sources);
    return { words: tokens(x).length, counted: r.words, copied: r.copied, longest: r.longest };
  });
}
function costOf(stats, maxRun, maxShare) {
  const all = stats.reduce((n, x) => n + x.words, 0);
  let keep = stats.filter((x) => x.longest <= maxRun).sort((x, y) => y.copied - x.copied);
  const tot = () => keep.reduce((n, x) => n + x.counted, 0);
  const cop = () => keep.reduce((n, x) => n + x.copied, 0);
  while (keep.length && tot() && cop() / tot() > maxShare) keep.shift();
  return Math.max(0, all - keep.reduce((n, x) => n + x.words, 0));
}

const rows = [];
for (const e of real) {
  const aired = [e.text, e.analysis?.text].filter(Boolean).join(' ');
  const body = bodies.get(e.link) || null;
  const sources = [e.title, e.summary, body].filter(Boolean);
  const rep = storyReport(aired, sources);
  const repSummary = storyReport(aired, [e.title, e.summary].filter(Boolean));
  const copiedSummaryOnly = repSummary.copied;
  rows.push({
    at: e.at, programId: e.programId, id: e.id, source: e.source, body: !!body,
    words: rep.words, copied: rep.copied, copiedSummaryOnly, share: rep.share, longest: rep.longest, longestSummaryOnly: repSummary.longest,
    over: { 8: rep.runs.some((r) => r.longest > 8), 10: rep.runs.some((r) => r.longest > 10), 12: rep.runs.some((r) => r.longest > 12), 15: rep.runs.some((r) => r.longest > 15), 20: rep.runs.some((r) => r.longest > 20) },
    violates: rep.violations.length > 0,
    ...(() => {
      const stats = sentenceStats(aired, sources);
      const grid = GRID.map(([r, sh]) => costOf(stats, r, sh));
      return { costWords: grid[0], grid, airedWords: stats.reduce((n, x) => n + x.words, 0) };
    })(),
    example: rep.runs.sort((a, b) => b.longest - a.longest)[0]?.text || null,
  });
}

// ---- summaries
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const med = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
function summary(list) {
  const words = list.reduce((n, r) => n + r.words, 0);
  const copied = list.reduce((n, r) => n + r.copied, 0);
  const cost = list.reduce((n, r) => n + r.costWords, 0);
  const aired = list.reduce((n, r) => n + (r.airedWords || r.words), 0);
  return {
    tellings: list.length,
    words,
    copiedShare: pct(copied, words),
    medianStoryShare: Math.round(med(list.map((r) => r.share)) * 1000) / 10,
    medianLongestRun: med(list.map((r) => r.longest)),
    storiesWithRunOver: Object.fromEntries([8, 10, 12, 15, 20].map((n) => [n, pct(list.filter((r) => r.over[n]).length, list.length)])),
    violatingStories: pct(list.filter((r) => r.violates).length, list.length),
    costWords: cost,
    costShare: pct(cost, aired),
    costSeconds: Math.round(cost / WPS),
    copiedFromSummaryOnly: pct(list.reduce((n, r) => n + r.copiedSummaryOnly, 0), words),
  };
}
const byProg = {};
for (const r of rows) (byProg[r.programId] ||= []).push(r);
const editions = new Map();
for (const r of rows) {
  const k = `${r.at}|${r.programId}`;
  if (!editions.has(k)) editions.set(k, []);
  editions.get(k).push(r);
}
const edRows = [...editions.entries()].map(([k, list]) => {
  const s = summary(list);
  return { key: k, programId: list[0].programId, stories: list.length, words: s.words, copiedShare: s.copiedShare, longest: Math.max(...list.map((r) => r.longest)), violating: list.filter((r) => r.violates).length, costSeconds: s.costSeconds, costShare: s.costShare };
});
const edSummary = (list) => ({
  editions: list.length,
  medianCopiedShare: med(list.map((e) => e.copiedShare)),
  withAViolation: pct(list.filter((e) => e.violating > 0).length, list.length),
  medianCostSeconds: med(list.map((e) => e.costSeconds)),
  medianCostShare: med(list.map((e) => e.costShare)),
  maxCostShare: Math.max(0, ...list.map((e) => e.costShare)),
});
const report = {
  generatedAt: new Date().toISOString(),
  rule: { maxRun: MAX_RUN, maxShare: MAX_SHARE, phrase: PHRASE, wordsPerSecond: WPS },
  articles: { links: links.length, read: withBody },
  all: summary(rows),
  allWithBody: summary(rows.filter((r) => r.body)),
  programmes: Object.fromEntries(Object.entries(byProg).map(([p, l]) => [p, summary(l)])),
  editions: { all: edSummary(edRows), byProgramme: Object.fromEntries(Object.entries(byProg).map(([p]) => [p, edSummary(edRows.filter((e) => e.programId === p))])) },
  grid: GRID.map(([r, sh], i) => {
    const words = rows.reduce((n, x) => n + x.airedWords, 0);
    const cost = rows.reduce((n, x) => n + x.grid[i], 0);
    const eds = [...editions.values()].map((list) => {
      const w = list.reduce((n, x) => n + x.airedWords, 0);
      const c = list.reduce((n, x) => n + x.grid[i], 0);
      return { share: w ? c / w : 0, seconds: c / WPS };
    });
    return { maxRun: r, maxShare: sh, costShare: pct(cost, words), medianEditionCostShare: Math.round(med(eds.map((e) => e.share)) * 1000) / 10, medianEditionCostSeconds: Math.round(med(eds.map((e) => e.seconds))) };
  }),
  worst: rows.filter((r) => r.example).sort((a, b) => b.longest - a.longest).slice(0, 12).map((r) => ({ programId: r.programId, source: r.source, longest: r.longest, share: Math.round(r.share * 1000) / 10, example: r.example })),
};
console.log(JSON.stringify({ all: report.all, allWithBody: report.allWithBody, editions: report.editions.all }, null, 1));
for (const [p, s] of Object.entries(report.programmes)) console.log(`${p.padEnd(14)} copied ${String(s.copiedShare).padStart(5)} %  longest(median) ${String(s.medianLongestRun).padStart(3)}  run>12 in ${String(s.storiesWithRunOver[12]).padStart(5)} %  violating ${String(s.violatingStories).padStart(5)} %  cost ${s.costShare} % (${s.costSeconds} s over ${s.tellings} tellings)`);
for (const g of report.grid) console.log(`rule run<=${g.maxRun} share<=${g.maxShare * 100}%: removes ${g.costShare} % of aired words; median edition loses ${g.medianEditionCostShare} % (${g.medianEditionCostSeconds} s)`);
if (outFile) fs.writeFileSync(path.resolve(outFile), JSON.stringify(report, null, 1));
