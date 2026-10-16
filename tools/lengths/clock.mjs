#!/usr/bin/env node
// The hourly clock with programmes of the lengths a replay made (tools/lengths/replay.mjs): the real station
// (server/station.js, the clock on) runs a day on a fake clock, each programme's episodes taken in turn from the replay's
// editions. The station plans with its own estimate (episodeAir: every segment's recorded voice, here the replay's speech
// at the voices' measured rates, plus its pauses), while the clock moves on by the edition's air as it plays
// (server/airtime.js voicedAir: the open, the pace profile's pauses, the end card). A programme the replay did not make
// (WORLD WEATHER, SEVEN DAYS) airs for the middle of its targetSeconds, as in test/clock.test.js.
//
//   node tools/lengths/clock.mjs <replay dir> [--hours 24] [--start 2026-10-12T05:00:00+01:00] [--json out.json]
//
// It reports where NEWS IN 60 lands against its marks (:00 and :30 London time): the spread, the worst, how many marks
// were missed or doubled, and what each programme ran for.
import fs from 'node:fs';
import path from 'node:path';
import { Station, episodeAir, breakAir, localTime } from '../../server/station.js';
import { loadChannel } from '../../server/channel.js';
import { voicedAir, speechOf } from '../../server/airtime.js';

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const dir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
if (!dir) {
  console.error('usage: node tools/lengths/clock.mjs <replay dir> [--hours 24] [--start ISO] [--json out.json]');
  process.exit(1);
}
const hours = Number(arg('hours', 24));
const start = Date.parse(arg('start', '2026-10-12T05:00:00+01:00'));
const channel = loadChannel();

// the replay's editions per programme: { speech, segments, voiced }
const made = {};
const rows = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8')).filter((r) => !r.skipped);
for (const r of rows) {
  const f = path.join(dir, `${r.name}.json`);
  if (!fs.existsSync(f)) continue;
  const ep = JSON.parse(fs.readFileSync(f, 'utf8'));
  const segs = ep.segments || [];
  (made[r.programId] ||= []).push({ speech: segs.map((s) => speechOf(ep, s)), voiced: voicedAir(ep) });
}

const silent = { info() {}, warn() {}, error() {} };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const turn = {};
const producer = {
  canProduce: () => true,
  async produce(ch, id) {
    const list = made[id];
    if (list?.length) {
      const e = list[(turn[id] = ((turn[id] ?? -1) + 1) % list.length)];
      // the station sees each segment's recorded voice (episodeAir); the clock runs for the edition as it plays
      return { kind: 'episode', id: `${id}-${turn[id]}`, program: { id, title: ch.programs[id].title }, segments: e.speech.map((d) => ({ audio: { duration: d } })), plays: e.voiced };
    }
    const [lo, hi] = ch.programs[id].targetSeconds || [300, 300];
    return { kind: 'episode', id: `${id}-mid`, program: { id, title: ch.programs[id].title }, segments: [{ audio: { duration: (lo + hi) / 2 - 12 } }], plays: (lo + hi) / 2 };
  },
};

let t = start;
const station = new Station({
  config: { queueSize: 2, clock: true, now: () => t },
  newsDesk: { stories: new Map(), uncovered: () => [], feedStatus: {}, lastRefresh: 0 },
  producer,
  chain: { status: () => [] },
  channel: () => channel,
  log: silent,
});
await station.fill();
const aired = [];
while (t < start + hours * 3600_000) {
  const item = station.next();
  if (!item) break;
  aired.push({ at: t, kind: item.kind, id: item.program?.id, replay: !!item.replay, est: item.kind === 'episode' ? episodeAir(item) : breakAir(item), plays: item.kind === 'episode' ? item.plays ?? episodeAir(item) : breakAir(item) });
  t += (item.kind === 'episode' ? item.plays ?? episodeAir(item) : breakAir(item)) * 1000;
  for (let i = 0; i < 10; i++) await tick();
}

const tz = channel.clock?.timezone || 'UTC';
const offMark = (at) => {
  const { minute, second } = localTime(at, tz);
  const s = (minute % 30) * 60 + second;
  return s > 900 ? s - 1800 : s;
};
const news = aired.filter((a) => a.kind === 'episode' && a.id === 'news-60' && !a.replay);
const offs = news.map((a) => offMark(a.at));
const marks = new Map();
for (const a of news) {
  const key = Math.round((a.at - offMark(a.at) * 1000) / 60_000);
  marks.set(key, (marks.get(key) || 0) + 1);
}
const expected = Math.floor((hours * 3600) / 1800);
const abs = offs.map(Math.abs).sort((x, y) => x - y);
const pct = (p) => abs[Math.min(abs.length - 1, Math.floor(p * abs.length))];
const byProg = {};
for (const a of aired.filter((x) => x.kind === 'episode')) (byProg[a.id] ||= []).push(a);
const report = {
  dir,
  hours,
  newsAirings: news.length,
  marksExpected: expected,
  marksHit: marks.size,
  doubled: [...marks.values()].filter((n) => n > 1).length,
  offMark: { median: pct(0.5), p90: pct(0.9), worst: abs.at(-1), early: Math.min(...offs), late: Math.max(...offs), within60: offs.filter((o) => Math.abs(o) <= 60).length, within120: offs.filter((o) => Math.abs(o) <= 120).length },
  programmes: Object.fromEntries(Object.entries(byProg).map(([id, list]) => [id, { airings: list.length, plays: Math.round(list.reduce((s, a) => s + a.plays, 0) / list.length), stationEstimate: Math.round(list.reduce((s, a) => s + a.est, 0) / list.length) }])),
};
console.log(`${hours} h from ${new Date(start).toISOString()} with the lengths of ${dir}`);
console.log(`NEWS IN 60: ${report.newsAirings} airings, ${report.marksHit} of ${expected} marks, ${report.doubled} doubled`);
console.log(`  off its mark: median ${report.offMark.median} s, 90% within ${report.offMark.p90} s, worst ${report.offMark.worst} s (earliest ${report.offMark.early} s, latest +${report.offMark.late} s); within a minute ${report.offMark.within60}, within two ${report.offMark.within120}`);
for (const [id, p] of Object.entries(report.programmes)) console.log(`  ${id.padEnd(14)} ${String(p.airings).padStart(3)} airings, plays ${p.plays} s (the station's estimate ${p.stationEstimate} s)`);
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ ...report, aired }, null, 1));
