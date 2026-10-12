#!/usr/bin/env node
// Live stream without OBS or a screen (LISTA 34; owner 12 Oct: "Te pasaré la clave de YouTube"): the channel page in
// headless Chromium in real time, its canvas and its sound recorded in the page (canvas.captureStream + every
// AudioContext's output, MediaRecorder: VP8 + Opus in 1-second chunks) and handed to ffmpeg, which scales the 384x216
// picture to 1080p by nearest neighbour (the pixels stay crisp), encodes H.264 + AAC with a keyframe every 2 s (as
// YouTube and Twitch ask) and sends it to an RTMP server, or writes a file to check it first.
//
//   node tools/stream.mjs --url "http://127.0.0.1:8080/?autostart=1&voice=kokoro" --rtmp rtmp://a.rtmp.youtube.com/live2 \
//     --key-env YOUTUBE_STREAM_KEY            (the key is read from that environment variable: never on the command line)
//   node tools/stream.mjs --url ... --out /tmp/test.flv --seconds 60     (a test: a file, then stop)
//
// --fps 30, --bitrate 4500k, --audio-bitrate 160k, --size 1920x1080. A page crash ends the run with code 2 (a WebM
// stream cannot take a second header mid-way): run it under a supervisor or a loop that starts it again (README);
// YouTube and Twitch take the reconnection. Ctrl+C stops both cleanly.
import { spawn } from 'node:child_process';

const opts = { fps: 30, bitrate: '4500k', 'audio-bitrate': '160k', size: '1920x1080', seconds: 0 };
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
  console.error('usage: node tools/stream.mjs --url <channel url> (--rtmp <server> --key-env <VAR> | --out <file.flv>) [--seconds n]');
  process.exit(1);
}
const say = (...a) => console.log('[stream]', new Date().toISOString().slice(11, 19), ...a);

let target = opts.out;
if (opts.rtmp) {
  const key = opts['key-env'] ? process.env[opts['key-env']] : '';
  if (!key) {
    console.error(`the stream key is read from an environment variable: --key-env <VAR> and ${opts['key-env'] || 'VAR'} set`);
    process.exit(1);
  }
  target = `${String(opts.rtmp).replace(/\/$/, '')}/${key}`;
}
const [W, H] = String(opts.size).split('x').map(Number);
const fps = Number(opts.fps);

// ffmpeg: WebM chunks in, the picture scaled whole-number where it fits (5x = 1920x1080 from 384x216), H.264 + AAC out
const ff = spawn('ffmpeg', [
  '-hide_banner', '-loglevel', 'warning',
  '-fflags', '+genpts', '-i', 'pipe:0',
  '-vf', `scale=${W}:${H}:flags=neighbor,fps=${fps},format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'animation', '-b:v', opts.bitrate, '-maxrate', opts.bitrate, '-bufsize', `${parseInt(opts.bitrate, 10) * 2}k`,
  '-g', String(fps * 2), '-keyint_min', String(fps * 2), '-sc_threshold', '0',
  '-c:a', 'aac', '-b:a', opts['audio-bitrate'], '-ar', '48000', '-ac', '2',
  '-f', 'flv', target,
], { stdio: ['pipe', 'inherit', 'inherit'] });
ff.on('exit', (code) => {
  say(`ffmpeg ended (${code})`);
  process.exit(code ?? 0);
});
const redact = (s) => String(s).replace(target, opts.rtmp ? `${opts.rtmp}/<key>` : target);
say(`→ ${redact(target)} at ${W}x${H} ${fps} fps`);

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

// In the page: every AudioContext also feeds a MediaStream destination (whatever reaches the speakers reaches the
// stream), and a recorder starts once the canvas exists, posting each chunk to node.
const TAP = () => {
  const Ctx = window.AudioContext;
  const taps = [];
  window.AudioContext = class extends Ctx {
    constructor(...a) {
      super(...a);
      this.__tap = this.createMediaStreamDestination();
      taps.push(this.__tap);
      window.__onTap?.(this.__tap);
    }
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = connect.call(this, dest, ...rest);
    if (dest && dest === this.context?.destination && this.context.__tap) connect.call(this, this.context.__tap, ...rest);
    return out;
  };
  window.__startRecorder = (fps) => {
    const canvas = document.getElementById('screen');
    const stream = canvas.captureStream(fps);
    const mixed = new MediaStream(stream.getVideoTracks());
    const addAudio = (tap) => tap.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));
    taps.forEach(addAudio);
    // a context made later (the channel unlocks its audio on start): its track joins only a new recorder, so the page
    // makes its context before the recorder starts (autostart unlocks at load)
    const rec = new MediaRecorder(mixed, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 192_000 });
    rec.ondataavailable = async (e) => {
      if (!e.data.size) return;
      const buf = new Uint8Array(await e.data.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      window.__chunk(btoa(s));
    };
    rec.start(1000);
    return { audio: mixed.getAudioTracks().length };
  };
};

let page = null;
let bytes = 0;
async function open() {
  page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
  await page.exposeFunction('__chunk', (b64) => {
    const buf = Buffer.from(b64, 'base64');
    bytes += buf.length;
    if (!ff.stdin.destroyed) ff.stdin.write(buf);
  });
  await page.addInitScript(TAP);
  page.on('crash', () => {
    say('page crashed: ending the run (the supervisor starts it again)');
    stop(2);
  });
  await page.goto(opts.url, { waitUntil: 'load' });
  // the channel's audio context exists once it has started (autostart): wait for it, then record
  await page.waitForFunction(() => !!document.getElementById('screen'), null, { timeout: 30_000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate((f) => window.__startRecorder(f), fps);
  say(`recording the page (${r.audio ? 'with' : 'WITHOUT'} sound)`);
}
let last = 0;
let tick = null;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(tick);
  say('stopping');
  try {
    await page?.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
  } catch { /* closed */ }
  await browser.close().catch(() => {});
  ff.stdin.end();
  if (code) setTimeout(() => process.exit(code), 3000);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

await open();
tick = setInterval(() => {
  say(`${((bytes - last) / 1024).toFixed(0)} KB/s from the page`);
  last = bytes;
}, 10_000);
if (Number(opts.seconds) > 0) setTimeout(() => stop(), Number(opts.seconds) * 1000);
