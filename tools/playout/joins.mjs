#!/usr/bin/env node
// The joins of pre-rendered playout, checked by eye and by ear (docs/publishing/playout.md §4): for each boundary the
// playout aired (events.jsonl 'air' events, and filler starts), a strip of the frames around it from the playout's own
// output (the last `--before` frames before it, the first `--after` after it) and the sound's level in 10 ms steps
// across it (a gap or a click shows as a hole or a spike). Writes one PNG per join and a sheet (joins.md) with the
// file, the time, what met what, the frame strip and the level around the join. Reads only; changes nothing. (It decodes
// each output file from its start to the join, exactly: a minute or so per join on an hour-long file.)
//
//   node tools/playout/joins.mjs [--dir data/playout] [--out <dir>] [--max 8] [--before 3] [--after 5]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const DIR = path.resolve(opt('dir', 'data/playout'));
const OUT = path.resolve(opt('out', path.join(DIR, 'joins')));
const MAX = Number(opt('max', 8));
const BEFORE = Number(opt('before', 3));
const AFTER = Number(opt('after', 5));
const FPS = 30;
fs.mkdirSync(OUT, { recursive: true });

const events = fs.readFileSync(path.join(DIR, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const starts = events.filter((e) => e.type === 'air-start' && e.out);
// the boundaries: every file aired, and every filler that began right after a file
const joins = [];
let prev = null;
for (const e of events) {
  if (e.type === 'air') {
    joins.push({ at: Date.parse(e.playhead), into: e.title, from: prev || 'filler', offset: e.offset });
    prev = e.title;
  } else if (e.type === 'filler' || e.type === 'underrun') {
    const at = Date.parse(e.from || e.at);
    if (prev && prev !== 'filler') joins.push({ at, into: 'filler', from: prev });
    prev = 'filler';
  }
}

/** Video frames in a file (packets counted, nothing decoded), cached. */
const frameCount = new Map();
function framesIn(file) {
  if (!frameCount.has(file)) {
    const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file], { encoding: 'utf8' });
    frameCount.set(file, Number(/\d+/.exec(String(r.stdout))?.[0]) || 0); // (a transport stream lists it twice)
  }
  return frameCount.get(file);
}
/**
 * The output file holding air time `t`, and the time into it. A segmented output cuts on keyframes near its period, so
 * each file's start is the frames of the files before it, counted, not the period times its number.
 */
function locate(t) {
  const s = [...starts].reverse().find((x) => Date.parse(x.playhead) <= t);
  if (!s) return null;
  const into = (t - Date.parse(s.playhead)) / 1000;
  if (s.segment) {
    const name = (k) => s.out.replace(/%0?(\d*)d/, (m, w) => String(k).padStart(Number(w) || 0, '0'));
    let start = 0;
    for (let k = 0; fs.existsSync(name(k)); k++) {
      const len = framesIn(name(k)) / FPS;
      if (into < start + len || !fs.existsSync(name(k + 1))) return { file: name(k), t: into - start };
      start += len;
    }
    return null;
  }
  const file = s.out.replace('{n}', String(s.run));
  return fs.existsSync(file) ? { file, t: into } : null;
}

/** Mean level (dBFS) in 10 ms windows over [a, b] seconds of the file's sound. */
function levels(file, a, b) {
  // (decoded from the file's start and trimmed on the decoded timeline: seeking a transport stream for a 0.2 s window
  // can land a few hundred ms off, or return nothing)
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a', '-af', `atrim=start=${Math.max(0, a)}:end=${b}`, '-ac', '1', '-ar', '48000', '-f', 's16le', 'pipe:1'], { maxBuffer: 1 << 26 });
  const buf = r.stdout || Buffer.alloc(0);
  const out = [];
  for (let i = 0; i + 960 <= buf.length / 2; i += 480) {
    let s = 0;
    for (let k = i; k < i + 480; k++) {
      const v = buf.readInt16LE(k * 2) / 32768;
      s += v * v;
    }
    out.push(Math.round(10 * Math.log10(s / 480 + 1e-12)));
  }
  return out;
}

const rows = [];
const chosen = joins.filter((j) => locate(j.at)).slice(-MAX);
for (const [n, j] of chosen.entries()) {
  const loc = locate(j.at);
  // the frames by number, decoded from the file's start (seeking a transport stream lands a few frames off)
  const at = Math.round(loc.t * FPS);
  const png = path.join(OUT, `join-${String(n + 1).padStart(2, '0')}.png`);
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', loc.file, '-an', '-vf', `select='between(n\\,${at - BEFORE}\\,${at + AFTER - 1})',scale=320:180:flags=neighbor,tile=${BEFORE + AFTER}x1`, '-frames:v', '1', png]);
  const lv = levels(loc.file, loc.t - 0.1, loc.t + 0.1);
  const jump = lv.length > 1 ? Math.max(...lv.slice(1).map((x, i) => Math.abs(x - lv[i]))) : null;
  rows.push({ n: n + 1, at: new Date(j.at).toISOString(), from: j.from, into: j.into, file: path.basename(loc.file), t: +loc.t.toFixed(3), png: path.basename(png), levels: lv, maxStep: jump, offset: j.offset ?? null });
}
const md = ['# Joins', '', `From ${DIR} (${rows.length} of ${joins.length} boundaries). Each strip: ${BEFORE} frames before the join, ${AFTER} after. Level: dBFS in 10 ms steps over 0.2 s centred on the join.`, '', '| # | air time | from | into | file @ s | strip | level across the join | largest step |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
for (const r of rows) md.push(`| ${r.n} | ${r.at.slice(11, 23)} | ${r.from} | ${r.into} | ${r.file} @ ${r.t} | ${r.png} | ${r.levels.join(' ')} | ${r.maxStep ?? ''} dB |`);
fs.writeFileSync(path.join(OUT, 'joins.md'), `${md.join('\n')}\n`);
fs.writeFileSync(path.join(OUT, 'joins.json'), JSON.stringify(rows, null, 1));
console.log(md.join('\n'));
