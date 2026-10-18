#!/usr/bin/env node
// The capture lab: what each live capture (tools/live/capture.mjs) does to the picture, measured on real frames. A
// lossless recording of the canvas (tools/record.mjs --scale 1 --lossless) is played into a page's #screen canvas in real
// time, 30 frames a second by the page's clock, with a quiet tone in its AudioContext, and captured exactly as the
// stream captures the channel; the capture is written as it would reach the encoder, then aligned with the source
// frame by frame (each captured frame matched to the source frame it shows) into a lossless file that
// tools/live/quality.py compares with the source.
//
//   node tools/live/lab.mjs --src cosmos.mkv --from 20 --seconds 20 --capture vp8 --out /tmp/lab/vp8
//     -> /tmp/lab/vp8.webm (as captured), /tmp/lab/vp8.aligned.mkv (384x216 RGB, frame k = what the capture shows at
//        source frame k), /tmp/lab/vp8.json (bitrate, frames matched, repeats, the browser's CPU over the capture)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { capturePageInit, CAPTURES } from './capture.mjs';
import { FrameSink, sinkInputArgs } from './sink.mjs';
import { procTree, summariseTree } from '../leak/proc.mjs';

const opts = { from: 0, seconds: 20, capture: 'vp8', fps: 30 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2), v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) opts[k] = true;
  else {
    opts[k] = v;
    i++;
  }
}
if (!opts.src || !opts.out || !CAPTURES[opts.capture]) {
  console.error(`usage: node tools/live/lab.mjs --src <lossless.mkv> --out <prefix> [--from s] [--seconds n] [--capture ${Object.keys(CAPTURES).join('|')}]`);
  process.exit(1);
}
const W = 384, H = 216, FPS = 30;
const N = Math.round(Number(opts.seconds) * FPS);
const OUT = path.resolve(opts.out);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const say = (...a) => console.log('[lab]', ...a);

// the source frames, RGBA
const dec = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(opts.from), '-i', opts.src, '-frames:v', String(N), '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: W * H * 4 * N + 1024 });
if (dec.status !== 0) throw new Error(String(dec.stderr));
const src = dec.stdout;
const frames = src.length / (W * H * 4);
say(`${frames} source frames`);

const PAGE = `<!doctype html><html><body style="margin:0;background:#000"><canvas id="screen" width="${W}" height="${H}"></canvas><script>
window.__lab = { ready: false };
(async () => {
  const buf = new Uint8ClampedArray(await (await fetch('/frames')).arrayBuffer());
  const ctx = new AudioContext();
  const o = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0.05; o.frequency.value = 440;
  o.connect(g); g.connect(ctx.destination); o.start();
  const c = document.getElementById('screen').getContext('2d');
  const n = buf.length / (${W * H * 4});
  const img = (k) => new ImageData(buf.subarray(k * ${W * H * 4}, (k + 1) * ${W * H * 4}), ${W}, ${H});
  c.putImageData(img(0), 0, 0);
  window.__lab.ready = true;
  window.__lab.play = () => new Promise((resolve) => {
    const t0 = performance.now();
    let last = -1;
    const shown = [];
    const tick = () => {
      const k = Math.floor((performance.now() - t0) * ${FPS} / 1000);
      if (k >= n) return resolve({ shown: shown.length, t0 });
      if (k !== last) { c.putImageData(img(k), 0, 0); last = k; shown.push(k); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
})();
</script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/frames') {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': src.length });
    return res.end(src);
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs'));
}
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...(opts.flags ? String(opts.flags).split(' ') : [])] });
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const cfg = CAPTURES[opts.capture];
const chunks = [];
await page.exposeFunction('__chunk', (b64) => chunks.push(Buffer.from(b64, 'base64')));
await page.addInitScript(capturePageInit);
await page.goto(base);
await page.waitForFunction(() => window.__lab?.ready, null, { timeout: 60_000 });

let sink = null;
let ff = null;
const captured = `${OUT}.${cfg.kind === 'frames' ? 'mkv' : 'webm'}`;
if (cfg.kind === 'frames') {
  // as the stream: raw frames and PCM into one encoder; here a lossless file (the same pixels the stream's x264 gets)
  sink = new FrameSink({ fps: FPS });
  const url = await sink.listen();
  const info = await page.evaluate((c) => window.__startCapture(c), { ...cfg, fps: FPS, sink: url });
  ff = spawn('ffmpeg', ['-v', 'error', '-y', ...sinkInputArgs(info, FPS), '-c:v', 'ffv1', '-pix_fmt', 'bgr0', '-c:a', 'pcm_s16le', captured], { stdio: ['pipe', 'inherit', 'inherit', 'pipe'] });
  sink.start(info, { video: ff.stdin, audio: ff.stdio[3] });
} else {
  await page.evaluate((c) => window.__startCapture(c), { ...cfg, fps: FPS });
}
await page.waitForTimeout(500);
const cpu0 = summariseTree(procTree(process.pid));
const t0 = Date.now();
const played = await page.evaluate(() => window.__lab.play());
const wall = (Date.now() - t0) / 1000;
const cpu1 = summariseTree(procTree(process.pid));
await page.waitForTimeout(1500);
await page.evaluate(() => window.__capture?.stop());
await page.waitForTimeout(1500);
if (sink) {
  await new Promise((r) => setTimeout(r, 600));
  await sink.stop();
  ff.stdin.end();
  ff.stdio[3].end();
  await new Promise((r) => ff.on('close', r));
} else fs.writeFileSync(captured, Buffer.concat(chunks));
await browser.close();
server.close();
const cores = Object.fromEntries(Object.keys(cpu1).map((k) => [k, +((cpu1[k].cpu - (cpu0[k]?.cpu || 0)) / wall).toFixed(3)]));

// align: decode the capture (BT.601 for the recorders' VP8/VP9, as they tag it; the frames are RGB already) and match
// each source frame with the captured frame nearest in content among those around its expected place
const matrix = cfg.kind === 'frames' ? null : 'bt601';
const d2 = spawnSync('ffmpeg', ['-v', 'error', '-i', captured, '-vf', `fps=${FPS},scale=w=${W}:h=${H}${matrix ? `:in_color_matrix=${matrix}:in_range=tv` : ''},format=rgb24`, '-f', 'rawvideo', 'pipe:1'], { maxBuffer: W * H * 3 * (N * 3) + 1024 });
const cap = d2.stdout;
const FB = W * H * 3;
const capN = Math.floor(cap.length / FB);
const s3 = (k) => {
  const out = Buffer.alloc(FB);
  for (let i = 0, j = k * W * H * 4; i < FB; i += 3, j += 4) {
    out[i] = src[j];
    out[i + 1] = src[j + 1];
    out[i + 2] = src[j + 2];
  }
  return out;
};
const mse = (a, ao, b, bo) => {
  let e = 0;
  for (let i = 0; i < FB; i += 7) {
    const d = a[ao + i] - b[bo + i];
    e += d * d;
  }
  return e;
};
// a global offset first (the capture starts before the playback), then each frame within +-2 of it
const srcRGB = Array.from({ length: frames }, (_, k) => s3(k));
let best = { off: 0, e: Infinity };
for (let off = 0; off < Math.min(capN - 1, 90); off++) {
  let e = 0;
  for (const k of [10, 40, 80, 120, 200].filter((x) => x < frames && x + off < capN)) e += mse(srcRGB[k], 0, cap, (k + off) * FB);
  if (e < best.e) best = { off, e };
}
const aligned = Buffer.alloc(frames * FB);
let exact = 0;
let shifted = 0;
for (let k = 0; k < frames; k++) {
  let pick = { j: Math.min(capN - 1, k + best.off), e: Infinity };
  for (let d = -2; d <= 2; d++) {
    const j = k + best.off + d;
    if (j < 0 || j >= capN) continue;
    const e = mse(srcRGB[k], 0, cap, j * FB);
    if (e < pick.e) pick = { j, e };
  }
  if (pick.j === k + best.off) exact++;
  else shifted++;
  cap.copy(aligned, k * FB, pick.j * FB, (pick.j + 1) * FB);
}
const alignedFile = `${OUT}.aligned.mkv`;
const enc = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0', '-c:v', 'ffv1', '-pix_fmt', 'rgb24', alignedFile], { input: aligned, maxBuffer: 1 << 20 });
if (enc.status !== 0) throw new Error(String(enc.stderr));
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=codec_name,color_space,color_range', '-of', 'json', captured]);
const report = { capture: opts.capture, seconds: Number(opts.seconds), sourceFrames: frames, capturedFrames: capN, offset: best.off, matchedInPlace: exact, matchedShifted: shifted, shown: played.shown, wall, cores, file: captured, bytes: fs.statSync(captured).size, kbps: Math.round((fs.statSync(captured).size * 8) / Number(opts.seconds) / 1000), probe: JSON.parse(probe.stdout || '{}'), sink: sink?.stats || null };
fs.writeFileSync(`${OUT}.json`, JSON.stringify(report, null, 1));
say(JSON.stringify(report));
process.exit(0);
