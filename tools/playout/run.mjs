#!/usr/bin/env node
// Pre-rendered playout in one command (docs/publishing/playout.md §7): the station on the air clock
// (tools/playout/station.mjs), the renderer an hour ahead (tools/playout/render.mjs) and the playout
// (tools/playout/air.mjs), each its own process, each started again if it stops (a growing pause between quick
// failures). Ctrl+C or SIGTERM stops all three. Files only unless the playout is given --rtmp (and PUBLISH_LIVE=1).
//
//   PORT=8790 VOICE_ENGINE=kokoro node tools/playout/run.mjs --out data/playout/air/air-%03d.ts --segment 3600 \
//        [--buffer 60] [--size 1920x1080] [--bitrate 5500k] [--crf 20] [--for <s>]
//        [--vertical (--vertical-out <file> | --vertical-rtmp <server> [--vertical-key-env YOUTUBE_VERTICAL_STREAM_KEY]
//         | --vertical-to youtube-vertical[,tiktok]) [--vertical-video-env YOUTUBE_VERTICAL_VIDEO_ID]
//         [--vertical-size 1080x1920] [--vertical-bitrate 4000k]]
//
// On air with the destinations by name (docs/publishing/playout.md §13.6: YouTube's dual format and TikTok LIVE at
// once, the keys in /etc/globit24.env), the horizontal stream and the vertical one each to its own:
//   PUBLISH_LIVE=1 node tools/playout/run.mjs --to youtube --vertical --vertical-to youtube-vertical,tiktok
//
// --vertical: the vertical live too (docs/publishing/playout.md §13): the renderer draws it from the same frames into
// <dir>/vertical and a fourth process, a second playout, airs it to its own file or stream.
//
// SIGHUP (systemctl reload): the keys again from /etc/globit24.env (GLOBIT_ENV_FILE), kept for a playout started again
// later and passed on to the playouts, which reconnect only the destinations whose key changed (TikTok's keys can be
// temporary); the station and the renderer go on untouched.
//
// Everything after the known options is passed to the playout (air.mjs). Logs: one line per event, each prefixed with
// the process it came from; the playout's state is in data/playout/*-status.json and events.jsonl.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envFile } from '../../server/playout/destinations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const port = Number(process.env.PORT || 8790);
const station = `http://127.0.0.1:${port}`;
const pass = (names) => names.flatMap((n) => (opt(n) !== null ? [`--${n}`, opt(n)] : []));
const airArgs = [...pass(['out', 'segment', 'rtmp', 'key-env', 'to', 'dir']), ...(opt('for') ? ['--for', opt('for')] : [])];
const VERTICAL = args.includes('--vertical');
const renderArgs = ['--station', station, ...pass(['buffer', 'size', 'bitrate', 'crf', 'dir', 'start-lead']), ...(args.includes('--no-twin') ? ['--no-twin'] : []), ...(VERTICAL ? ['--vertical', ...pass(['vertical-size', 'vertical-bitrate'])] : []), ...(opt('for') ? ['--for', opt('for')] : [])];
if (!opt('out') && !opt('rtmp') && !opt('to')) {
  console.error('usage: node tools/playout/run.mjs --out <file> [--segment s] | --to youtube | --rtmp <server> --key-env <VAR>  [--buffer 60] [--for s] [--vertical --vertical-out <file> | --vertical-to youtube-vertical,tiktok | --vertical-rtmp <server>]');
  process.exit(1);
}
if (VERTICAL && !opt('vertical-out') && !opt('vertical-rtmp') && !opt('vertical-to')) {
  console.error('--vertical needs where the vertical live goes: --vertical-out <file>, --vertical-to youtube-vertical,tiktok, or --vertical-rtmp <server> (its key in --vertical-key-env, YOUTUBE_VERTICAL_STREAM_KEY by default)');
  process.exit(1);
}
const vairArgs = [
  '--dir', path.join(path.resolve(opt('dir') || path.join(root, 'data', 'playout')), 'vertical'),
  ...(opt('vertical-out') ? ['--out', opt('vertical-out')] : []),
  ...(opt('vertical-rtmp') ? ['--rtmp', opt('vertical-rtmp'), '--key-env', opt('vertical-key-env', 'YOUTUBE_VERTICAL_STREAM_KEY')] : []),
  ...(opt('vertical-to') ? ['--to', opt('vertical-to')] : []),
  '--video-env', opt('vertical-video-env', 'YOUTUBE_VERTICAL_VIDEO_ID'),
  ...pass(['segment']),
  ...(opt('for') ? ['--for', opt('for')] : []),
];
// Priorities (25 Oct, owner: "las voces suenan como chispazos" with both pictures rendering on 3 cores): the
// playouts feed YouTube in real time, so they go first; the renderer, an hour ahead, can wait. Their own children
// (the browser, the encoders, each segment's ffmpeg) inherit it. Raising one needs root (the service runs as root).
const procs = {
  station: { argv: [path.join(root, 'tools', 'playout', 'station.mjs')], env: { PORT: String(port) }, nice: 5 },
  render: { argv: [path.join(root, 'tools', 'playout', 'render.mjs'), ...renderArgs], after: 'station', nice: 10 },
  air: { argv: [path.join(root, 'tools', 'playout', 'air.mjs'), ...airArgs], nice: -10 },
  ...(VERTICAL ? { vair: { argv: [path.join(root, 'tools', 'playout', 'air.mjs'), ...vairArgs], nice: -10 } } : {}),
};
const BACKOFF = [2, 5, 15, 30, 60];
let stopping = false;
const say = (name, line) => console.log(`${new Date().toISOString().slice(11, 19)} ${name.padEnd(7)} ${line}`);

function start(name) {
  const p = procs[name];
  if (stopping) return;
  const child = spawn(process.execPath, p.argv, { cwd: root, env: { ...process.env, ...(p.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.child = child;
  p.startedAt = Date.now();
  try {
    if (p.nice) os.setPriority(child.pid, p.nice);
  } catch (err) {
    say(name, `priority ${p.nice} not set (${err.code || err.message})`);
  }
  say(name, `started (pid ${child.pid})`);
  for (const s of [child.stdout, child.stderr]) {
    let buf = '';
    s.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        say(name, buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
  }
  child.on('exit', (code, signal) => {
    say(name, `ended (${code ?? signal})`);
    p.child = null;
    if (stopping) return;
    // (with --for, the renderer and the playout end by themselves: then everything stops)
    if (opt('for') && name !== 'station' && code === 0) return maybeDone();
    const quick = Date.now() - p.startedAt < 300_000;
    p.fails = quick ? (p.fails || 0) + 1 : 0;
    const wait = BACKOFF[Math.min(p.fails, BACKOFF.length - 1)];
    say(name, `starting again in ${wait} s`);
    setTimeout(() => start(name), wait * 1000);
  });
}
function maybeDone() {
  if (!procs.render.child && !procs.air.child && !procs.vair?.child) stop();
}
async function waitStation() {
  for (let i = 0; i < 600 && !stopping; i++) {
    try {
      const r = await fetch(`${station}/api/status`);
      if (r.ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
function stop() {
  if (stopping) return;
  stopping = true;
  for (const [name, p] of Object.entries(procs)) {
    if (!p.child) continue;
    say(name, 'stopping');
    try {
      p.child.kill('SIGTERM');
    } catch {
      /* gone */
    }
  }
  setTimeout(() => process.exit(0), 15_000).unref();
  const check = setInterval(() => {
    if (Object.values(procs).every((p) => !p.child)) {
      clearInterval(check);
      process.exit(0);
    }
  }, 300);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const ENV_FILE = process.env.GLOBIT_ENV_FILE || '/etc/globit24.env';
process.on('SIGHUP', () => {
  try {
    Object.assign(process.env, envFile(fs.readFileSync(ENV_FILE, 'utf8')));
  } catch (err) {
    say('run', `reload: ${ENV_FILE} not readable (${err.code || err.message}); the playouts keep their keys`);
    return;
  }
  for (const name of ['air', 'vair']) {
    if (!procs[name]?.child) continue;
    say(name, 'reload: the keys again');
    procs[name].child.kill('SIGHUP');
  }
});

start('station');
start('air'); // (filler until the first programme is ready: never black)
if (procs.vair) start('vair');
await waitStation();
start('render');
