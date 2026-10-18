#!/usr/bin/env node
// Visual variety of a recording (docs/roadmap/critique/visual-variety.md): reads the report tools/record.mjs --trace
// writes and measures the shots that aired, by public/js/variety.js (the director's own 'shot' trace when the recording
// has it: every visible cut with its group, kind and layout; else the stage's 'cut' trace, its cards named by their
// shot only). The programme's standard (VARIETY) and its breaches are printed.
//
//   node tools/pace/variety-report.mjs report.json [--programme pay-attention|full-time] [--timeline] [--json out.json]
import fs from 'node:fs';
import { varietyReport, varietyFaults, shotLayout, VARIETY } from '../../public/js/variety.js';

/** The visible shots of a recording's trace: [{ t (s), shot, framing, focus, layout?, kind?, group? }] and the end card's t. */
export function shotsOfTrace(report) {
  const pace = report?.trace?.pace || [];
  const own = pace.filter((x) => x.k === 'shot');
  const list = [];
  if (own.length) {
    for (const x of own) list.push({ t: x.t / 1000, shot: x.shot, framing: x.framing ?? null, focus: x.focus ?? null, layout: x.layout, kind: x.kind, group: x.group });
  } else {
    // the stage's cuts, each named by the quiz director's own cut just before it when there is one (its board; the
    // stage's framing of a board is the studio's last)
    const quiz = pace.filter((y) => y.k === 'quizCut');
    for (const x of pace.filter((y) => y.k === 'cut')) {
      const q = quiz.find((y) => y.t <= x.t + 1 && x.t - y.t < 50);
      const shot = q ? q.shot : x.shot;
      const framing = q ? q.framing ?? null : x.framing ?? null;
      list.push({ t: x.t / 1000, shot, framing: shot === 'quiz' ? null : framing, focus: x.focus ?? null, card: q?.board ? { board: q.board, o: q.view ? { view: q.view } : {} } : null });
    }
  }
  const open = list.findIndex((x) => x.shot === 'open');
  const shots = open >= 0 ? list.slice(open) : list;
  const end = shots.find((x) => x.shot === 'endcard' || x.shot === 'stinger')?.t ?? null;
  return { shots: shots.filter((x) => end === null || x.t <= end), end };
}

/** Name a traced shot by its own layout when the trace carries one, else by variety.js. */
function named(x) {
  return x.layout ? { group: x.group, kind: x.kind, layout: x.layout } : shotLayout(x);
}

async function cli() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node tools/pace/variety-report.mjs report.json [--programme id] [--timeline] [--json out.json]');
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pi = process.argv.indexOf('--programme');
  const id = pi > 0 ? process.argv[pi + 1] : null;
  const V = VARIETY[id] || {};
  const { shots, end } = shotsOfTrace(report);
  const r = varietyReport(shots, { end, window: V.window || 60, maxShot: V.maxShot ?? Infinity, maxStudio: V.maxStudio ?? Infinity, limits: V.limits || null, minShot: V.minShot || 0 });
  if (process.argv.includes('--timeline')) {
    const t0 = shots.find((x) => x.shot !== 'open')?.t ?? 0;
    shots.forEach((x, i) => console.log(`${(x.t - t0).toFixed(2).padStart(7)} ${((i + 1 < shots.length ? shots[i + 1].t : end ?? x.t) - x.t).toFixed(2).padStart(6)}  ${named(x).layout}`));
  }
  const j = process.argv.indexOf('--json');
  if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify({ id, report: r, faults: varietyFaults(r, id) }, null, 1));
  console.log(JSON.stringify({ id, ...r, repeats: r.repeats.slice(0, 8) }, null, 1));
  const faults = varietyFaults(r, id);
  console.log(faults.length ? `STANDARD BREACHED (${faults.length}):\n  ${faults.join('\n  ')}` : 'standard held');
}
if (import.meta.url === `file://${process.argv[1]}`) cli();
