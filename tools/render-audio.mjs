#!/usr/bin/env node
// Offline audio render for checks without speakers: opens a page in headless
// Chromium, calls `window.__audio.render(opts)` (which must resolve to
// { sampleRate, channels: [Float32Array | number[]] }, usually from an
// OfflineAudioContext), and writes a WAV, an AAC .m4a to listen to, a
// spectrogram + waveform PNG to look at, and the loudness (EBU R128 integrated
// LUFS, true peak) measured by ffmpeg.
//
//   node tools/render-audio.mjs --url "http://127.0.0.1:8080/lab/music.html" \
//     --opts '{"programme":"world-now","moment":"headlines","seconds":20}' --out /tmp/audio/world-headlines
//
// Writes <out>.wav, <out>.m4a, <out>.png and prints a JSON line with the measurements.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}

const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) opts[argv[i].slice(2)] = true;
  else opts[argv[i].slice(2)] = argv[++i];
}
if (!opts.url || !opts.out) {
  console.error('usage: node tools/render-audio.mjs --url <lab page> --out <path without extension> [--opts <json>]');
  process.exit(1);
}
fs.mkdirSync(path.dirname(opts.out), { recursive: true });

function wav(channels, sampleRate) {
  const n = channels[0].length;
  const ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * ch * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] || 0));
      buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), o);
      o += 2;
    }
  }
  return buf;
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(opts.url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__audio && typeof window.__audio.render === 'function', null, { timeout: 15000 });
const result = await page.evaluate(async (o) => {
  const r = await window.__audio.render(o);
  return { sampleRate: r.sampleRate, channels: r.channels.map((c) => Array.from(c)) };
}, opts.opts ? JSON.parse(opts.opts) : {});
await browser.close();

fs.writeFileSync(`${opts.out}.wav`, wav(result.channels, result.sampleRate));
const ff = (args) => spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8' });
ff(['-v', 'error', '-i', `${opts.out}.wav`, '-c:a', 'aac', '-b:a', '160k', `${opts.out}.m4a`]);
ff(['-v', 'error', '-i', `${opts.out}.wav`, '-filter_complex',
  '[0:a]asplit[a1][a2];[a1]showspectrumpic=s=1024x384:legend=1:scale=log[s];[a2]showwavespic=s=1308x200:split_channels=0:colors=white[w];[s][w]vstack=inputs=2',
  '-frames:v', '1', `${opts.out}.png`]);
const loud = (ff(['-nostats', '-i', `${opts.out}.wav`, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']).stderr || '').split('Summary:').pop();
const pick = (re) => Number((loud.match(re) || [])[1]);
const report = {
  out: opts.out,
  seconds: +(result.channels[0].length / result.sampleRate).toFixed(2),
  integratedLUFS: pick(/I:\s+(-?[\d.]+) LUFS/),
  loudnessRangeLU: pick(/LRA:\s+(-?[\d.]+) LU/),
  truePeakDBFS: pick(/Peak:\s+(-?[\d.]+) dBFS/),
  pageErrors: errors,
};
console.log(JSON.stringify(report));
