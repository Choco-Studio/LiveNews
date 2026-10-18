#!/usr/bin/env node
// Pre-rendered playout in one command (docs/publishing/playout.md §7): the station on the air clock
// (tools/playout/station.mjs), the renderer an hour ahead (tools/playout/render.mjs) and the playout
// (tools/playout/air.mjs), each its own process, each started again if it stops (a growing pause between quick
// failures). Ctrl+C or SIGTERM stops all three. Files only unless the playout is given --rtmp (and PUBLISH_LIVE=1).
//
//   PORT=8790 VOICE_ENGINE=kokoro node tools/playout/run.mjs --out data/playout/air/air-%03d.ts --segment 3600 \
//        [--buffer 60] [--size 1280x720] [--bitrate 3000k] [--for <s>]
//
// Everything after the known options is passed to the playout (air.mjs). Logs: one line per event, each prefixed with
// the process it came from; the playout's state is in data/playout/*-status.json and events.jsonl.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const port = Number(process.env.PORT || 8790);
const station = `http://127.0.0.1:${port}`;
const pass = (names) => names.flatMap((n) => (opt(n) !== null ? [`--${n}`, opt(n)] : []));
const airArgs = [...pass(['out', 'segment', 'rtmp', 'key-env', 'dir']), ...(opt('for') ? ['--for', opt('for')] : [])];
const renderArgs = ['--station', station, ...pass(['buffer', 'size', 'bitrate', 'dir', 'start-lead']), ...(args.includes('--no-twin') ? ['--no-twin'] : []), ...(opt('for') ? ['--for', opt('for')] : [])];
if (!opt('out') && !opt('rtmp')) {
  console.error('usage: node tools/playout/run.mjs --out <file> [--segment s] | --rtmp <server> --key-env <VAR>  [--buffer 60] [--for s]');
  process.exit(1);
}
const procs = {
  station: { argv: [path.join(root, 'tools', 'playout', 'station.mjs')], env: { PORT: String(port) } },
  render: { argv: [path.join(root, 'tools', 'playout', 'render.mjs'), ...renderArgs], after: 'station' },
  air: { argv: [path.join(root, 'tools', 'playout', 'air.mjs'), ...airArgs] },
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
  if (!procs.render.child && !procs.air.child) stop();
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

start('station');
start('air'); // (filler until the first programme is ready: never black)
await waitStation();
start('render');
