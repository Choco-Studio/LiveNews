#!/usr/bin/env node
// A run of pre-rendered playout summed up (docs/publishing/playout.md §10; server-setup.md §4b): from the playout's
// events (data/playout/events.jsonl), the measure tool's CSV (tools/playout/measure.mjs) and, when given, the station's
// log (its voice lines): every programme rendered with its render speed and CPU per air second, the voices' speed, the
// CPU and memory while rendering and while only airing, the buffer over time, the filler, underruns, gaps, late and
// dropped files, what was held and what the strict rules would have held. Prints Markdown; changes nothing.
//
//   node tools/playout/report.mjs [--dir data/playout] [--csv data/test24/playout.csv] [--log station.log]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const DIR = path.resolve(opt('dir', 'data/playout'));
const events = fs.readFileSync(path.join(DIR, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const of = (t) => events.filter((e) => e.type === t);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const f1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(1));
const f2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(2));
const out = [];

const rendered = of('rendered');
out.push('## Render, per item', '', '| air time (UTC) | item | on air (s) | render (s) | speed | CPU-s per air s | load |', '| --- | --- | --- | --- | --- | --- | --- |');
for (const r of rendered) out.push(`| ${r.airAt.slice(11, 19)} | ${r.programme} | ${f1(r.seconds)} | ${f1(r.realSeconds)} | ${f2(r.speed)}x | ${f2(r.cpuPerAirSecond)} | ${f1(r.load1)} |`);
const air = sum(rendered.map((r) => r.seconds));
const real = sum(rendered.map((r) => r.realSeconds));
const cpu = sum(rendered.map((r) => r.cpuSeconds || 0));
out.push('', `All items: ${f1(air / 60)} min of air rendered in ${f1(real / 60)} min (${f2(air / real)}x), ${f2(cpu / air)} CPU-s per air second; episodes alone ${f2(sum(rendered.filter((r) => r.kind === 'episode').map((r) => r.cpuSeconds || 0)) / sum(rendered.filter((r) => r.kind === 'episode').map((r) => r.seconds)))}, breaks ${f2(sum(rendered.filter((r) => r.kind === 'break').map((r) => r.cpuSeconds || 0)) / sum(rendered.filter((r) => r.kind === 'break').map((r) => r.seconds)))}.`, '');

// the voices, from the station's log: "[voice] WORLD NOW: 19/19 clips (0 cached), 412 s of speech in 380 s"
if (opt('log')) {
  const lines = fs.readFileSync(opt('log'), 'utf8').split('\n').map((l) => /\[voice\] ([^:]+): (\d+)\/(\d+) clips \((\d+) cached\), (\d+) s of speech in (\d+) s/.exec(l)).filter(Boolean);
  out.push('## Voices (Kokoro)', '', '| programme | clips | speech (s) | made in (s) | speed |', '| --- | --- | --- | --- | --- |');
  for (const m of lines) out.push(`| ${m[1]} | ${m[2]}/${m[3]} (${m[4]} cached) | ${m[5]} | ${m[6]} | ${Number(m[6]) ? f2(Number(m[5]) / Number(m[6])) : '—'}x |`);
  out.push('');
}

// CPU and memory: while rendering (the browser busy) and while only airing
if (opt('csv') && fs.existsSync(opt('csv'))) {
  const [head, ...rows] = fs.readFileSync(opt('csv'), 'utf8').trim().split('\n');
  const cols = head.split(',');
  const recs = rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [cols[i], Number.isFinite(Number(v)) && v !== '' ? Number(v) : v])));
  const parts = ['station', 'voice', 'render', 'browser', 'render-ffmpeg', 'air', 'air-ffmpeg'];
  const stat = (set, k) => ({ mean: set.length ? sum(set.map((r) => r[k] || 0)) / set.length : null, max: set.length ? Math.max(...set.map((r) => r[k] || 0)) : null });
  const rendering = recs.filter((r) => r.browser_cores > 0.1);
  const idle = recs.filter((r) => r.browser_cores <= 0.1);
  out.push('## CPU (cores) and memory (MB)', '', `${recs.length} samples, ${rendering.length} of them while the renderer was rendering. The playout's own cost (airing) is its two rows; the voices and the renderer work at the same time as it.`, '', '| part | cores while rendering (mean / max) | cores otherwise (mean) | cores over the run (mean) | MB (max) |', '| --- | --- | --- | --- | --- |');
  for (const p of parts) {
    const a = stat(rendering, `${p}_cores`);
    out.push(`| ${p} | ${f2(a.mean)} / ${f2(a.max)} | ${f2(stat(idle, `${p}_cores`).mean)} | ${f2(stat(recs, `${p}_cores`).mean)} | ${f1(stat(recs, `${p}_mb`).max)} |`);
  }
  const t = stat(recs, 'total_cores');
  out.push(`| all | ${f2(stat(rendering, 'total_cores').mean)} / ${f2(t.max)} | ${f2(stat(idle, 'total_cores').mean)} | ${f2(t.mean)} | ${f1(Math.max(...recs.map((r) => parts.reduce((s, p) => s + (r[`${p}_mb`] || 0), 0))))} |`);
  out.push('', `Airing (the playout and its encoder) over the run: ${f2(stat(recs, 'air_cores').mean + stat(recs, 'air-ffmpeg_cores').mean)} cores on average, ${f1(stat(recs, 'air_mb').max + stat(recs, 'air-ffmpeg_mb').max)} MB.`);
  out.push('', `Machine: load (1 min) mean ${f1(stat(recs, 'load1').mean)}, max ${f1(stat(recs, 'load1').max)}; memory in use max ${f1(stat(recs, 'mem_used_mb').max)} MB (the whole machine, other sessions included); swap max ${f1(stat(recs, 'swap_mb').max)} MB.`, '');
  const buf = recs.filter((r) => r.buffer_min !== '' && Number.isFinite(r.buffer_min));
  if (buf.length) {
    const step = Math.max(1, Math.floor(buf.length / 12));
    out.push('## Buffer (minutes of programme ready ahead)', '', buf.filter((_, i) => i % step === 0 || i === buf.length - 1).map((r) => `${String(r.time).slice(11, 16)} ${f1(r.buffer_min)}`).join(' · '), '');
  }
}

// the buffer from the events themselves: at each moment, how far the queued programme reaches past it
const queued = of('queued').map((e) => ({ at: Date.parse(e.at), end: Date.parse(e.end) }));
if (queued.length) {
  const t0 = Math.min(...events.map((e) => Date.parse(e.at)).filter(Number.isFinite));
  const t1 = Math.max(...events.map((e) => Date.parse(e.at)).filter(Number.isFinite));
  const step = Math.max(60_000, Math.round((t1 - t0) / 16 / 60_000) * 60_000);
  const pts = [];
  for (let t = t0; t <= t1 + 1; t += step) {
    const reach = Math.max(0, ...queued.filter((q) => q.at <= t).map((q) => q.end));
    pts.push(`${new Date(t).toISOString().slice(11, 16)} ${f1(Math.max(0, (reach - t) / 60000))}`);
  }
  out.push('## Buffer from the events (minutes of programme queued ahead of the clock)', '', pts.join(' · '), '');
}

// the playout
const fillers = of('filler');
const under = of('underrun-end');
out.push('## Playout', '');
out.push(`- Files aired: ${of('air').length}; dropped (late): ${of('drop').length}; encoder restarts: ${of('air-restart').length}.`);
out.push(`- Filler: ${fillers.length} gaps filled (${f1(sum(fillers.map((e) => e.seconds)))} s), ${under.length} underruns (${f1(sum(under.map((e) => e.seconds)))} s)${of('underrun').length > under.length ? ', one still running at the end' : ''}.`);
out.push(`- Renderer: ${of('queued').length} units queued, ${of('held').filter((e) => e.stage === 'air').length} held after rendering, ${of('late').length} late (not queued), ${of('gap').length} jumps of the frontier, ${of('waited').length} waits for the station (${f1(sum(of('waited').map((e) => e.seconds)))} s).`);
const held = of('held').filter((e) => e.stage === 'production');
out.push(`- Held when made (never rendered): ${held.length}${held.length ? ` (${held.map((e) => `${e.programme}: ${e.rules.join(', ')}`).join('; ')})` : ''}.`);
const strict = of('strict-would-hold');
const byRule = {};
for (const e of strict) for (const r of e.rules) byRule[r] = (byRule[r] || 0) + 1;
out.push(`- The strict rules would also have held ${strict.length} that aired under the relaxed test switches${strict.length ? ` (${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(', ')})` : ''}.`);
out.push(`- Deleted by the disk policy: ${of('delete').length} (${[...new Set(of('delete').map((e) => e.kind))].join(', ') || 'nothing'}).`);
const offs = of('air').map((e) => Math.abs(e.offset || 0));
if (offs.length) out.push(`- Join timing: each file started within ${f2(Math.max(...offs) * 1000)} ms of its air time (median ${f2(med(offs) * 1000)} ms).`);
console.log(out.join('\n'));
