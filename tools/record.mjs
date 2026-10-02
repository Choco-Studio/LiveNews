#!/usr/bin/env node
// Deterministic video recorder: freezes the page clock (Date, timers,
// performance.now, requestAnimationFrame) with Playwright's fake clock, then
// advances it exactly 1/fps per frame and grabs the #screen canvas. The video
// is perfectly smooth however loaded the machine is (live screen recording
// drops frames). Frames are upscaled with nearest neighbour so pixels stay
// crisp, and encoded to H.264 MP4 with ffmpeg. No audio.
//
//   node tools/record.mjs --url "http://127.0.0.1:8080/?autostart=1&voice=mute" \
//     --seconds 30 [--skip 0] [--fps 30] [--scale 5] --out /tmp/clip.mp4
//
// --skip    seconds of channel time to run (fast, not recorded) before recording
// --step    optional JS run before each frame with T = time since recording started,
//           for lab pages that render a given instant (then the clock is not needed)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}

const opts = { seconds: 10, skip: 0, fps: 30, scale: 5, selector: '#screen' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const key = argv[i].slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) opts[key] = true;
  else {
    opts[key] = next;
    i++;
  }
}
for (const k of ['seconds', 'skip', 'fps', 'scale']) opts[k] = Number(opts[k]);
if (!opts.url || !opts.out) {
  console.error('usage: node tools/record.mjs --url <url> --out <file.mp4> [--seconds n] [--skip n] [--fps n] [--scale n] [--step js]');
  process.exit(1);
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

if (!opts.step) await page.clock.install();
await page.goto(opts.url, { waitUntil: 'load' });

const frameMs = 1000 / opts.fps;
// Network replies (fetch, SSE) resolve in real time, so let real time pass a
// little while the fake clock advances in small steps.
async function advance(ms) {
  if (opts.step) return;
  await page.clock.runFor(ms);
  await new Promise((r) => setImmediate(r));
}
async function runFake(seconds) {
  for (let t = 0; t < seconds * 1000; t += 250) {
    await advance(250);
    if (t % 2000 === 0) await new Promise((r) => setTimeout(r, 20)); // let fetches land
  }
}
await runFake(1 + opts.skip);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-'));
const total = Math.round(opts.seconds * opts.fps);
for (let i = 0; i < total; i++) {
  if (opts.step) await page.evaluate(String(opts.step).replace(/\bT\b/g, String(i / opts.fps)));
  else {
    await advance(frameMs);
    if (i % opts.fps === 0) await new Promise((r) => setTimeout(r, 15)); // network catch-up once per second
  }
  const url = await page.evaluate((sel) => document.querySelector(sel)?.toDataURL('image/png'), opts.selector);
  if (!url) throw new Error(`no canvas matches ${opts.selector}`);
  fs.writeFileSync(path.join(dir, `f${String(i).padStart(6, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
  if (i % (opts.fps * 10) === 0) process.stdout.write(`  ${Math.round((i / total) * 100)}%\r`);
}
await browser.close();

await new Promise((resolve, reject) => {
  const ff = spawn('ffmpeg', [
    '-v', 'error', '-y', '-framerate', String(opts.fps), '-i', path.join(dir, 'f%06d.png'),
    '-vf', `scale=iw*${opts.scale}:ih*${opts.scale}:flags=neighbor`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', '-movflags', '+faststart', opts.out,
  ], { stdio: 'inherit' });
  ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
});
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${total} frames @ ${opts.fps} fps -> ${opts.out}${errors.length ? ` (${errors.length} page errors: ${errors.slice(0, 3).join(' | ')})` : ''}`);
