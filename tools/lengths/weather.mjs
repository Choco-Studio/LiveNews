#!/usr/bin/env node
// WORLD WEATHER's length on real data: today's Open-Meteo forecast and GDACS warnings (through the proxy: run with
// NODE_USE_ENV_PROXY=1), written by the station's own weather writer (server/weatherwriter.js) for `--editions` seeds, the
// way the rotation varies it, and timed as it will air (server/airtime.js voicedAir, the station's episodeAir beside it).
// Each edition is saved as JSON and as a readable script.
//
//   NODE_USE_ENV_PROXY=1 node tools/lengths/weather.mjs --out <dir> [--editions 24] [--fixture]
//
// --fixture writes from the offline demo data instead (config/fixtures/weather.json), for a run without the network.
// --save-report <file> keeps the report it read; --report <file> writes from a saved one (the same data before and after a
// change: --writer <path to a weatherwriter.js> writes it with another version of the writer).
import fs from 'node:fs';
import path from 'node:path';
import { WeatherDesk } from '../../server/weather.js';
import { writeWeather } from '../../server/weatherwriter.js';
import { voicedAir } from '../../server/airtime.js';
import { episodeAir } from '../../server/station.js';
import { loadChannel, castOf } from '../../server/channel.js';

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const out = arg('out');
if (!out) {
  console.error('usage: NODE_USE_ENV_PROXY=1 node tools/lengths/weather.mjs --out <dir> [--editions 24] [--fixture]');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
const n = Number(arg('editions', 24));
const channel = loadChannel();
const program = { id: 'world-weather', ...channel.programs['world-weather'] };
const cast = castOf(channel, 'world-weather');
const presenter = { id: cast.A, ...channel.presenters[cast.A] };
// (the heat map and the moving sky paced as the station paces them, server/index.js: 120 places every 20 s, a 429 asked
// again after 65 s; the tool waits for them, up to four minutes, since the world segment needs the sky)
const desk = new WeatherDesk({ source: args.includes('--fixture') ? 'fixture' : 'open-meteo', log: { info() {}, warn: (m) => console.warn(m), error: (m) => console.error(m) }, fieldPauseMs: 20_000, fieldRetryMs: 65_000, fieldWaitMs: 240_000 });
const keepAlive = setInterval(() => {}, 1000); // (the field's batches wait on their own timers)
const report = arg('report') ? JSON.parse(fs.readFileSync(arg('report'), 'utf8')) : await desk.report();
clearInterval(keepAlive);
if (report && arg('save-report')) fs.writeFileSync(arg('save-report'), JSON.stringify(report));
const writer = arg('writer') ? (await import(path.resolve(arg('writer')))).writeWeather : writeWeather;
if (!report) {
  console.error('no weather report: the forecast could not be read (see the warnings above)');
  process.exit(2);
}
const words = (t) => String(t || '').replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;
const rows = [];
for (let i = 0; i < n; i++) {
  const body = writer(report, { presenter, channelName: channel.name, title: program.title, seed: `${i}` });
  const ep = { ...body, program: { id: 'world-weather', title: program.title }, cast };
  const name = String(i + 1).padStart(3, '0');
  fs.writeFileSync(path.join(out, `${name}-world-weather.json`), JSON.stringify(ep, null, 1));
  fs.writeFileSync(path.join(out, `${name}-world-weather.txt`), `# WORLD WEATHER, seed ${i}, forecast of ${report.at || '?'}${report.demo ? ' (demo data)' : ''}\n\n${ep.segments.map((s, k) => `[${k}] ${s.kind}${s.board ? ` (${s.board.kind || 'board'})` : ''}\n    ${String(s.text).replace(/\[[^\]]*\]\s*/g, '')}`).join('\n')}\n`);
  rows.push({ name: `${name}-world-weather`, programId: 'world-weather', air: Math.round(episodeAir(ep)), voiced: Math.round(voicedAir(ep)), words: ep.segments.reduce((s, x) => s + words(x.text), 0), segments: ep.segments.length, kinds: ep.segments.map((s) => s.kind).join(' ') });
}
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(rows, null, 1));
const v = rows.map((r) => r.voiced).sort((a, b) => a - b);
const [lo, hi] = program.targetSeconds;
console.log(`WORLD WEATHER: ${rows.length} editions from the forecast of ${report.at}${report.demo ? ' (demo data)' : ''}, target ${lo}-${hi} s`);
console.log(`  air ${Math.round(rows.reduce((s, r) => s + r.air, 0) / rows.length)} s; VOICED avg ${Math.round(v.reduce((s, x) => s + x, 0) / v.length)} s, min ${v[0]}, median ${v[Math.floor(v.length / 2)]}, max ${v.at(-1)}; within target ${v.filter((x) => x >= lo && x <= hi).length}/${v.length}`);
console.log(`  words ${Math.round(rows.reduce((s, r) => s + r.words, 0) / rows.length)}, segments ${(rows.reduce((s, r) => s + r.segments, 0) / rows.length).toFixed(1)}; ${rows[0].kinds}`);
