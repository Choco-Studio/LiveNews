#!/usr/bin/env node
// Measures pre-rendered playout while it runs (docs/publishing/playout.md §7): every `--every` seconds, one CSV line with
// the CPU (in cores, from /proc: user + system time over the interval) and the memory (RSS, MB) of each part, found
// as descendants of the given processes and classified by their command line: the station (node), its voice worker
// (python, Kokoro), the renderer (node), its browser (Chromium), its encoders (ffmpeg), the playout (node) and its
// ffmpeg; then the machine's load average, memory and swap in use, the buffer the renderer reports and the playout's
// counts. Reads only /proc and the playout's status files; changes nothing.
//
//   node tools/playout/measure.mjs --pid <run.mjs pid> [--pid <pid>...] [--dir data/playout] --out data/test24/playout.csv [--every 60]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const roots = args.flatMap((a, i) => (a === '--pid' && args[i + 1] ? [Number(args[i + 1])] : []));
const DIR = path.resolve(opt('dir', 'data/playout'));
const OUT = path.resolve(opt('out', 'data/test24/playout.csv'));
const EVERY = Math.max(2, Number(opt('every', 60)));
const FOR = Number(opt('for', 0));
const HZ = 100; // clock ticks a second (getconf CLK_TCK; 100 on Linux)
const PAGE = 4096;
if (!roots.length) {
  console.error('usage: node tools/playout/measure.mjs --pid <pid> [--pid ...] [--dir data/playout] --out <csv> [--every 60]');
  process.exit(1);
}

const CLASSES = ['station', 'voice', 'render', 'browser', 'render-ffmpeg', 'air', 'air-ffmpeg', 'other'];
function procs() {
  const out = new Map();
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
      out.set(Number(d), { pid: Number(d), ppid: Number(rest[1]), ticks: Number(rest[11]) + Number(rest[12]), rss: Number(rest[21]) * PAGE, cmd });
    } catch {
      /* gone */
    }
  }
  return out;
}
function classify(p, all) {
  const up = (q, n = 0) => (q && n < 30 ? [q, ...up(all.get(q.ppid), n + 1)] : []);
  const chain = up(p).map((q) => q.cmd);
  const has = (re) => chain.some((c) => re.test(c));
  if (/kokoro_worker|tools\/voice/.test(p.cmd)) return 'voice';
  if (/headless_shell|chrom/i.test(p.cmd)) return 'browser';
  if (/^ffmpeg|\/ffmpeg /.test(p.cmd)) return has(/playout\/air\.mjs/) ? 'air-ffmpeg' : has(/playout\/render\.mjs/) ? 'render-ffmpeg' : 'other';
  if (/playout\/render\.mjs/.test(p.cmd)) return 'render';
  if (/playout\/air\.mjs/.test(p.cmd)) return 'air';
  if (/playout\/station\.mjs|server\/index\.js/.test(p.cmd)) return 'station';
  return 'other';
}
function tree(all) {
  const kids = new Map();
  for (const p of all.values()) {
    if (!kids.has(p.ppid)) kids.set(p.ppid, []);
    kids.get(p.ppid).push(p);
  }
  const seen = new Set();
  const walk = (pid) => {
    const p = all.get(pid);
    if (!p || seen.has(pid)) return;
    seen.add(pid);
    for (const k of kids.get(pid) || []) walk(k.pid);
  };
  for (const r of roots) walk(r);
  return [...seen].map((pid) => all.get(pid));
}
const meminfo = () => {
  const m = Object.fromEntries(fs.readFileSync('/proc/meminfo', 'utf8').split('\n').filter(Boolean).map((l) => [l.split(':')[0], Number(l.split(':')[1].trim().split(' ')[0]) * 1024]));
  return { used: m.MemTotal - m.MemAvailable, swap: m.SwapTotal - m.SwapFree };
};
const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, `${['time', ...CLASSES.flatMap((c) => [`${c}_cores`, `${c}_mb`]), 'total_cores', 'load1', 'mem_used_mb', 'swap_mb', 'buffer_min', 'render_speed', 'units', 'held', 'late', 'on_air', 'aired', 'filler_s', 'underruns', 'dropped'].join(',')}\n`);
let last = new Map();
let lastAt = Date.now();
const started = Date.now();
function sample() {
  const all = procs();
  const now = Date.now();
  const dt = (now - lastAt) / 1000;
  const cores = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const mb = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  for (const p of tree(all)) {
    const c = classify(p, all);
    const prev = last.get(p.pid);
    if (prev && prev.cmd === p.cmd) cores[c] += Math.max(0, p.ticks - prev.ticks) / HZ / dt;
    mb[c] += p.rss / 1048576;
  }
  last = all;
  lastAt = now;
  const m = meminfo();
  const r = readJson(path.join(DIR, 'render-status.json')) || {};
  const a = readJson(path.join(DIR, 'air-status.json')) || {};
  const row = [new Date(now).toISOString(), ...CLASSES.flatMap((c) => [cores[c].toFixed(2), mb[c].toFixed(0)]), Object.values(cores).reduce((x, y) => x + y, 0).toFixed(2), os.loadavg()[0].toFixed(2), (m.used / 1048576).toFixed(0), (m.swap / 1048576).toFixed(0), r.bufferMinutes ?? '', r.speed ?? '', r.units ?? '', r.held ?? '', r.late ?? '', JSON.stringify(a.onAir?.title || '').replace(/,/g, ' '), a.stats?.segments ?? '', a.stats?.fillerSeconds?.toFixed?.(0) ?? '', a.stats?.underruns ?? '', a.stats?.dropped ?? ''];
  fs.appendFileSync(OUT, `${row.join(',')}\n`);
}
procs();
last = procs();
setInterval(() => {
  sample();
  if (FOR > 0 && Date.now() - started > FOR * 1000) process.exit(0);
}, EVERY * 1000);
console.log(`[measure] every ${EVERY} s -> ${OUT}`);
