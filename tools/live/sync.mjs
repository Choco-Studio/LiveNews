#!/usr/bin/env node
// Picture and sound in step through the live stream (tools/stream.mjs), end to end: a page like the channel's (a
// #screen canvas, an AudioContext) flashes white every 2 s and beeps at the same moment as the listener hears it (the
// channel's own rule: a sound is timed to be heard with its picture, audio.js heardAt), the stream captures and encodes
// it as it would the channel, and the file says by how much each beep leads or trails its flash.
//
//   node tools/live/sync.mjs --seconds 40 [--capture png|frames|vp8] [--out /tmp/sync.flv]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const opts = { seconds: 40, capture: 'png' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  opts[argv[i].slice(2)] = argv[i + 1];
  i++;
}
const out = path.resolve(opts.out || path.join(os.tmpdir(), `sync-${process.pid}.flv`));

const PAGE = `<!doctype html><html><body style="margin:0;background:#000"><canvas id="screen" width="384" height="216"></canvas><script>
const ctx = new AudioContext();
const c = document.getElementById('screen').getContext('2d');
const heardAt = (perf) => { const ts = ctx.getOutputTimestamp(); return ts.performanceTime > 0 ? ts.contextTime + (perf - ts.performanceTime) / 1000 : ctx.currentTime + (perf - performance.now()) / 1000 + (ctx.outputLatency || 0) + (ctx.baseLatency || 0); };
let next = performance.now() + 1500;
let scheduled = -1;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  // the beep for the next flash, scheduled half a second ahead at the context time heard at that instant
  if (scheduled < next && next - now < 500) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 1000; g.gain.value = 0.5;
    o.connect(g); g.connect(ctx.destination);
    const t = heardAt(next);
    o.start(t); o.stop(t + 0.1);
    scheduled = next;
  }
  const on = now >= next && now < next + 100;
  c.fillStyle = on ? '#fff' : '#000';
  c.fillRect(0, 0, 384, 216);
  if (now >= next + 100) next += 2000;
}
requestAnimationFrame(loop);
</script></body></html>`;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const child = spawn(process.execPath, [path.join(root, 'tools', 'stream.mjs'), '--url', url, '--out', out, '--seconds', String(opts.seconds), '--capture', opts.capture, '--size', '1152x648'], { stdio: 'inherit' });
await new Promise((r) => child.on('exit', r));
server.close();

// the flashes: frames whose picture is bright; the beeps: 1 kHz bursts in the sound (10 ms windows)
const v = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-vf', 'scale=16:9,format=gray', '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 1 << 28 }).stdout;
const fps = 30;
const flashes = [];
for (let i = 0, prev = 0; i < v.length / 144; i++) {
  let s = 0;
  for (let k = 0; k < 144; k++) s += v[i * 144 + k];
  const bright = s / 144 > 128;
  if (bright && !prev) flashes.push(i / fps);
  prev = bright;
}
const a = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], { maxBuffer: 1 << 28 }).stdout;
const beeps = [];
for (let i = 0, prev = 0; i + 80 <= a.length / 2; i += 80) {
  let e = 0;
  for (let k = 0; k < 80; k++) e += Math.abs(a.readInt16LE((i + k) * 2));
  const loud = e / 80 > 2000;
  if (loud && !prev) beeps.push(i / 8000);
  prev = loud;
}
const pairs = flashes.map((f) => {
  const b = beeps.reduce((best, x) => (Math.abs(x - f) < Math.abs(best - f) ? x : best), Infinity);
  return Math.round((b - f) * 1000);
}).filter((d) => Math.abs(d) < 1000);
const sorted = [...pairs].sort((x, y) => x - y);
const report = { capture: opts.capture, flashes: flashes.length, beeps: beeps.length, offsetsMs: pairs, medianMs: sorted[sorted.length >> 1] ?? null, spreadMs: sorted.length ? sorted.at(-1) - sorted[0] : null, note: 'positive: the sound trails the picture' };
console.log(JSON.stringify(report));
if (!opts.out) fs.rmSync(out, { force: true });
