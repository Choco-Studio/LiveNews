#!/usr/bin/env node
// Live stream without OBS or a screen (LISTA 34; owner 12 Oct: "Te pasaré la clave de YouTube"): the channel page in
// headless Chromium in real time, its canvas and its sound captured in the page (tools/live/capture.mjs) and handed to
// one ffmpeg, which scales the 384x216 picture by a WHOLE number with nearest neighbour (x5 = 1920x1080 by default,
// x3 = 1152x648; never a fraction: server/airsize.js), converts it to BT.709 4:2:0 and tags it so, encodes H.264 + AAC
// with a keyframe every 2 s (as YouTube and Twitch ask) and sends it to an RTMP server, or writes a file to check it.
//
//   node tools/stream.mjs --url "http://127.0.0.1:8080/?autostart=1&voice=kokoro" --rtmp rtmp://a.rtmp.youtube.com/live2 \
//     --key-env YOUTUBE_STREAM_KEY            (the key is read from that environment variable: never on the command line)
//   node tools/stream.mjs --url ... --out /tmp/test.flv --seconds 60     (a test: a file, then stop)
//
// The capture (--capture, docs/publishing/server-setup.md §4):
//   png     (default) the canvas's own pixels 30 times a second, each frame a PNG the browser encodes off the page's
//           thread, and the sound as PCM, over a loopback WebSocket to this process (tools/live/sink.mjs): the encoder
//           gets exactly what the page drew, and encodes it once
//   frames  the same, raw RGBA (10 MB/s over loopback; more CPU in node than png)
//   vp8     the capture before 18 Oct: MediaRecorder VP8 + Opus, decoded by ffmpeg before x264 (two lossy encodes, the
//           first at the canvas's own size in 4:2:0: measured SSIM 0.961 after x264 against 0.987 for png, and more bits)
//   vp8hq, vp9   MediaRecorder at 12 Mbit/s with PCM sound (the browser's encoder takes far less than it is offered)
//
// The rate (--rc): 'capped' (default) is constant quality (--crf 20) never above --bitrate (a 2 s buffer): at 1080p a
// news programme needs 1 to 2 Mbit/s for a picture close to lossless, the adverts about 2.5, only the weather maps hit
// the cap; 'cbr' spends --bitrate all the time (YouTube's "CBR" advice, at two to three times the traffic).
// --fps 30, --bitrate 5500k, --crf 20, --preset veryfast, --audio-bitrate 160k, --size 1920x1080 (or 1080p, 648p).
// Every 10 s it prints what the page sent and the CPU of each part (browser, encoder, this process) and the renderer's
// memory. A page crash ends the run with code 2: run it under the live supervisor (tools/publish/live.mjs), which
// starts it again; YouTube and Twitch take the reconnection. Ctrl+C stops both cleanly.
import { spawn } from 'node:child_process';
import { integerSize, scaleFilter, colourArgs, DEFAULT_SIZE } from '../server/airsize.js';
import { capturePageInit, CAPTURES, DEFAULT_CAPTURE } from './live/capture.mjs';
import { FrameSink, sinkInputArgs } from './live/sink.mjs';
import { procTree, summariseTree } from './leak/proc.mjs';

const opts = { fps: 30, bitrate: '5500k', crf: 20, rc: 'capped', preset: 'veryfast', 'audio-bitrate': '160k', size: DEFAULT_SIZE, seconds: 0, capture: DEFAULT_CAPTURE };
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
if (!opts.url || (!opts.rtmp && !opts.out)) {
  console.error('usage: node tools/stream.mjs --url <channel url> (--rtmp <server> --key-env <VAR> | --out <file.flv>) [--seconds n] [--size 1920x1080] [--capture png|frames|vp8]');
  process.exit(1);
}
const say = (...a) => console.log('[stream]', new Date().toISOString().slice(11, 19), ...a);
const capture = CAPTURES[opts.capture];
if (!capture) {
  console.error(`--capture is one of ${Object.keys(CAPTURES).join(', ')}`);
  process.exit(1);
}
if (!['capped', 'cbr'].includes(opts.rc)) {
  console.error('--rc is capped or cbr');
  process.exit(1);
}

let target = opts.out;
if (opts.rtmp) {
  const key = opts['key-env'] ? process.env[opts['key-env']] : '';
  if (!key) {
    console.error(`the stream key is read from an environment variable: --key-env <VAR> and ${opts['key-env'] || 'VAR'} set`);
    process.exit(1);
  }
  target = `${String(opts.rtmp).replace(/\/$/, '')}/${key}`;
}
// the picture's size: a whole multiple of the canvas, or the nearest one with a warning (never a fractional scale)
const size = integerSize(opts.size, { warn: (m) => say(`WARNING: ${m}`) });
const fps = Number(opts.fps);
const kbps = parseInt(opts.bitrate, 10);
if (!(kbps > 0)) {
  console.error(`--bitrate like 5500k, not ${opts.bitrate}`);
  process.exit(1);
}
const rate = opts.rc === 'cbr' ? ['-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`] : ['-crf', String(Number(opts.crf)), '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`];
const redact = (s) => String(s).replace(target, opts.rtmp ? `${opts.rtmp}/<key>` : target);
// the page draws only the pictures the stream takes (--page-fps 0: its own 60 a second; tools/live/capture.mjs)
const pageFps = opts['page-fps'] !== undefined ? { pageFps: Number(opts['page-fps']) } : {};

/** The encoder: `input` its input options, `inMatrix` the YUV matrix of a decoded capture (null: RGB frames). */
function encoder(input, { inMatrix = null, audio = true, extraStdio = [] } = {}) {
  const args = [
    '-hide_banner', '-loglevel', 'warning', '-y',
    ...input,
    '-vf', `${scaleFilter(size, { inMatrix })},fps=${fps}`,
    '-c:v', 'libx264', '-preset', String(opts.preset), '-tune', 'animation', ...rate,
    '-g', String(fps * 2), '-keyint_min', String(fps * 2), '-sc_threshold', '0',
    ...colourArgs(),
    ...(audio ? ['-c:a', 'aac', '-b:a', opts['audio-bitrate'], '-ar', '48000', '-ac', '2'] : []),
    '-f', 'flv', target,
  ];
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit', ...extraStdio] });
  ff.on('exit', (code) => {
    say(`ffmpeg ended (${code})`);
    if (!stopping) process.exit(code || 3);
    else process.exit(exitCode);
  });
  ff.stdin.on('error', () => {});
  return ff;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ handleSIGINT: false, handleSIGTERM: false, args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

let page = null;
let ff = null;
let sink = null;
let bytes = 0;
let stopping = false;
let exitCode = 0;
async function open() {
  page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
  if (capture.kind === 'recorder') {
    await page.exposeFunction('__chunk', (b64) => {
      const buf = Buffer.from(b64, 'base64');
      bytes += buf.length;
      if (ff && !ff.stdin.destroyed) ff.stdin.write(buf);
    });
  }
  await page.addInitScript(capturePageInit);
  page.on('crash', () => {
    say('page crashed: ending the run (the supervisor starts it again)');
    stop(2);
  });
  await page.goto(opts.url, { waitUntil: 'load' });
  // the channel's audio context exists once it has started (autostart): wait for it, then capture
  await page.waitForFunction(() => !!document.getElementById('screen'), null, { timeout: 30_000 });
  await page.waitForTimeout(3000);
  if (capture.kind === 'recorder') {
    // (the browser's VP8/VP9 is BT.601: converted to BT.709 on the way to x264)
    ff = encoder(['-fflags', '+genpts', '-i', 'pipe:0'], { inMatrix: 'bt601' });
    const r = await page.evaluate((c) => window.__startCapture(c), { ...capture, fps, ...pageFps });
    say(`recording the page (${opts.capture}, ${r.audio ? 'with' : 'WITHOUT'} sound)`);
    return;
  }
  sink = new FrameSink({ fps, log: say });
  const url = await sink.listen();
  const info = await page.evaluate((c) => window.__startCapture(c), { ...capture, fps, sink: url, ...pageFps });
  ff = encoder(sinkInputArgs(info, fps), { audio: info.audio, extraStdio: ['pipe'] });
  ff.stdio[3]?.on('error', () => {});
  sink.start(info, { video: ff.stdin, audio: info.audio ? ff.stdio[3] : null });
  say(`capturing the page (${opts.capture}: ${info.w}x${info.h} frames${info.audio ? `, sound ${info.rate} Hz` : ', WITHOUT sound'})`);
}
let tick = null;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  clearInterval(tick);
  say('stopping');
  try {
    await page?.evaluate(() => window.__capture?.stop());
    await page?.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
  } catch { /* closed */ }
  await sink?.stop();
  await browser.close().catch(() => {});
  ff?.stdin.end();
  ff?.stdio[3]?.end?.();
  setTimeout(() => process.exit(code), code ? 3000 : 15000);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

say(`→ ${redact(target)} at ${size.size} (x${size.k}) ${fps} fps, ${opts.rc === 'cbr' ? `${kbps}k constant` : `crf ${opts.crf} up to ${kbps}k`}, capture ${opts.capture}`);
await open();
let last = 0;
let lastCpu = summariseTree(procTree(process.pid));
let lastAt = Date.now();
let lastPage = null;
let lastSink = { frames: 0, repeated: 0 };
tick = setInterval(async () => {
  const sent = sink ? sink.stats.bytes : bytes;
  const now = Date.now();
  const dt = (now - lastAt) / 1000;
  const tree = summariseTree(procTree(process.pid));
  const cores = (k) => ((tree[k]?.cpu || 0) - (lastCpu[k]?.cpu || 0)) / dt;
  const browserCores = ['browser', 'renderer', 'gpu', 'utility', 'zygote'].reduce((a, k) => a + cores(k), 0);
  let health = '';
  if (sink) {
    // the page's own frame rate and what the capture dropped, then what the sink had to repeat (a slow page or capture)
    const pg = await page?.evaluate(() => window.__capture?.stats?.()).catch(() => null);
    const fpsPage = pg && lastPage ? ((pg.ticks - lastPage.ticks) / dt).toFixed(0) : '?';
    const out = sink.stats.frames - lastSink.frames;
    const rep = sink.stats.repeated - lastSink.repeated;
    // frames skipped because the encoder holds seconds of picture it has not read: this machine cannot encode this
    // size at this preset in real time beside the page (the levers: --preset superfast, ultrafast, --size 1152x648)
    const skipped = sink.stats.skipped - (lastSink.skipped || 0);
    health = ` · page ${fpsPage} fps, ${pg ? pg.dropped - (lastPage?.dropped || 0) : '?'} dropped · ${out} frames out, ${out ? Math.round((rep * 100) / out) : 0} % repeated${skipped ? ` · ${skipped} SKIPPED: the encoder is behind (--preset superfast, then ultrafast, or --size 1152x648)` : ''}`;
    lastPage = pg;
    lastSink = { ...sink.stats };
  }
  // (the live supervisor reads "N KB/s from the page": a frozen page sends nothing)
  say(`${((sent - last) / dt / 1024).toFixed(0)} KB/s from the page · cores: browser ${browserCores.toFixed(2)}, encoder ${cores('ffmpeg').toFixed(2)}, node ${cores('node').toFixed(2)} · renderer ${Math.round((tree.renderer?.rss || 0) / 1024)} MB${health}`);
  last = sent;
  lastCpu = tree;
  lastAt = now;
}, 10_000);
if (Number(opts.seconds) > 0) setTimeout(() => stop(), Number(opts.seconds) * 1000);
