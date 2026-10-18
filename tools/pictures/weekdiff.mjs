#!/usr/bin/env node
// SEVEN DAYS's week grouping on a real archive, the old way and the new (server/archive.js week, weekAsync): the time,
// the calls of the news desk's sameStory, the longest the event loop was held, and whether the groups (their stories,
// their order, their scores) and the SEVEN DAYS body (its stories, in order) are the same.
//
//   node tools/pictures/weekdiff.mjs --archive data/archive [--skip-old] [--thread-only] [--days 7]
//
// The old way is kept here as the reference (the grouping before round 10 of the pictures desk), run on a fresh copy
// of the archive, as the first edition after a restart would run it. The new way runs five times: at once (week), in
// slices (weekAsync), in slices again with the first run's kept answers (memo), as the next edition would; and as the
// station runs it, in its own thread (server/weekgrouper.js), twice. (The thread's sameStory calls are counted there:
// the line shows 0 for them here.)
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Archive } from '../../server/archive.js';
import { NewsDesk } from '../../server/news.js';
import { writeWeekly } from '../../server/weeklywriter.js';
import { WeekGrouper } from '../../server/weekgrouper.js';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const dir = args.archive || 'data/archive';
const days = Number(args.days || 7);
const quiet = { warn() {}, info() {} };
const NOW = Math.max(...new Archive({ dir, log: quiet }).entries.map((e) => e.at)) + 1000; // reproducible

/** The grouping before round 10, verbatim but for its scoring (shared below). */
export function oldGroups(entries, { since, now, same }) {
  const groups = [];
  for (const e of entries) {
    if (e.at < since || e.at > now) continue;
    let g = groups.find((x) => x.ids.has(e.id));
    if (!g && same) g = groups.find((x) => x.entries.some((o) => o.category === e.category && same(o, e)));
    if (!g) groups.push((g = { ids: new Set(), entries: [] }));
    g.ids.add(e.id);
    g.entries.push(e);
  }
  return groups;
}
// the scoring and order of week(), applied to the old groups
function scored(groups) {
  return groups
    .map((g) => {
      const es = g.entries;
      const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
      const best = [...es].sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0) || (a.roundup ? 1 : 0) - (b.roundup ? 1 : 0))[0];
      const programmes = new Set(es.map((e) => e.programId));
      const daysTold = new Set(es.map((e) => dayKey(e.at)));
      const leads = es.filter((e) => e.rank === 0).length;
      return { key: [...g.ids][0], ids: [...g.ids], entries: es, first: es[0].at, last: es.at(-1).at, times: es.length, programmes: [...programmes], days: [...daysTold].sort(), best, latest: es.at(-1), category: best.category, score: es.length + 1.5 * programmes.size + 2 * daysTold.size + 2 * leads + (es.some((e) => e.breaking) ? 3 : 0) };
    })
    .sort((a, b) => b.score - a.score || b.last - a.last);
}
const fingerprint = (week) => JSON.stringify(week.map((g) => [g.key, g.ids, g.entries.map((e) => `${e.id}@${e.at}`), g.score, g.days, g.best?.id]));
const body = (week) => {
  const b = writeWeekly(week, { now: NOW, seed: 'weekdiff' });
  return b ? JSON.stringify({ ids: b.storyIds, heads: b.segments.map((s) => s.headline || s.type) }) : 'null';
};

async function measure(label, fn) {
  const desk = new NewsDesk({ log: quiet });
  let calls = 0;
  const same = (a, b) => {
    calls++;
    try {
      return desk.sameStory(a, b);
    } catch {
      return false;
    }
  };
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  let worst = 0;
  let last = performance.now();
  // (and the processor time this thread spent between two turns: on a busy machine a turn also waits for the processor)
  const cpu = () => {
    const u = process.threadCpuUsage();
    return (u.user + u.system) / 1000;
  };
  let own = 0;
  let lastCpu = cpu();
  const tick = setInterval(() => {
    const t = performance.now();
    worst = Math.max(worst, t - last - 20);
    last = t;
    const c = cpu();
    own = Math.max(own, c - lastCpu);
    lastCpu = c;
  }, 20);
  const t0 = performance.now();
  const week = await fn(same);
  const ms = performance.now() - t0;
  await new Promise((r) => setTimeout(r, 40));
  clearInterval(tick);
  h.disable();
  const out = { label, ms: Math.round(ms), calls, groups: week.length, maxBlockMs: Math.round(Math.max(worst, h.max / 1e6)), ownMs: Math.round(own), fp: fingerprint(week), body: body(week) };
  console.log(`${label.padEnd(26)} ${String(out.ms).padStart(7)} ms  ${String(calls).padStart(8)} sameStory calls  ${String(out.groups).padStart(5)} groups  longest hold ${out.maxBlockMs} ms (its own processor time ${out.ownMs} ms)`);
  return out;
}

const fresh = () => new Archive({ dir, now: () => NOW, log: quiet });
const since = NOW - days * 86400_000;
console.log(`${dir}: ${fresh().entries.length} airings, the week to ${new Date(NOW).toISOString()}`);
const runs = [];
// (--thread-only: the station's way alone, in a fresh process, for its longest hold of the station's own thread)
if (!args['thread-only']) {
  if (!args['skip-old']) runs.push(await measure('old (before round 10)', async (same) => scored(oldGroups(fresh().entries, { since, now: NOW, same }))));
  runs.push(await measure('new, at once', async (same) => fresh().week({ days, now: NOW, same })));
  const archive = fresh();
  const memo = {};
  runs.push(await measure('new, in slices', async (same) => archive.weekAsync({ days, now: NOW, same, memo })));
  runs.push(await measure('new, next edition (memo)', async (same) => archive.weekAsync({ days, now: NOW, same, memo })));
}
// the station's way (server/weekgrouper.js): the grouping thread, then its next edition with its kept answers
const threaded = fresh();
const grouper = new WeekGrouper({ archive: threaded, desk: new NewsDesk({ log: quiet }), log: quiet });
runs.push(await measure('new, in its thread', async () => grouper.week({ days, now: NOW })));
console.log(`  (in the thread: ${JSON.stringify(grouper.status().last)})`);
runs.push(await measure('new, thread, next edition', async () => grouper.week({ days, now: NOW })));
console.log(`  (in the thread: ${JSON.stringify(grouper.status().last)})`);
grouper.close();
const ref = runs[0];
for (const r of runs.slice(1)) console.log(`${r.label}: groups ${r.fp === ref.fp ? 'identical' : 'DIFFERENT'} to ${ref.label}; SEVEN DAYS ${r.body === ref.body ? 'identical' : 'DIFFERENT'}`);
process.exitCode = runs.every((r) => r.fp === ref.fp && r.body === ref.body) ? 0 : 1;
