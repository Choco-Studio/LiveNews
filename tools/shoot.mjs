#!/usr/bin/env node
// Frame capture for visual checks: opens a page in headless Chromium, grabs the
// 384x216 #screen canvas N times and writes the frames plus a contact sheet
// (one PNG with every frame in a grid, upscaled with nearest neighbour), so a
// whole movement can be judged from a single image. Console errors and page
// errors are saved next to the frames and make the exit code 2.
//
//   node tools/shoot.mjs --url "http://127.0.0.1:8080/?autostart=1&voice=mute" \
//     --wait 4 --frames 12 --every 0.25 --out /tmp/shots/intro [--cols 4] [--scale 2]
//     [--eval "window.someHook()"] [--video] [--selector "#screen"] [--label "intro"]
//
// --wait     seconds to wait after load before the first frame (default 2)
// --frames   number of frames (default 8); --every seconds between frames (default 0.5)
// --eval     JavaScript run in the page after load, before waiting (e.g. to set up a preview)
// --video    also record a .webm of the whole session (for people; agents should read the PNGs)

import fs from 'node:fs';
import path from 'node:path';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}

function parseArgs(argv) {
  const out = { wait: 2, frames: 8, every: 0.5, cols: 4, scale: 2, selector: '#screen', width: 1152, height: 648 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  for (const k of ['wait', 'frames', 'every', 'cols', 'scale', 'width', 'height']) out[k] = Number(out[k]);
  return out;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.url || !opts.out) {
  console.error('usage: node tools/shoot.mjs --url <url> --out <dir> [--wait s] [--frames n] [--every s] [--cols n] [--scale n] [--eval js] [--video]');
  process.exit(1);
}
fs.mkdirSync(opts.out, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: opts.width, height: opts.height },
  ...(opts.video ? { recordVideo: { dir: opts.out, size: { width: opts.width, height: opts.height } } } : {}),
});
const page = await context.newPage();
const logs = [];
let errors = 0;
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    logs.push(`[${m.type()}] ${m.text()}`);
    if (m.type() === 'error') errors++;
  }
});
page.on('pageerror', (e) => {
  logs.push(`[pageerror] ${e.stack || e.message}`);
  errors++;
});

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
await page.goto(opts.url, { waitUntil: 'load' });
if (opts.eval) await page.evaluate(opts.eval);
await sleep(opts.wait);

const frames = [];
const t0 = Date.now();
for (let i = 0; i < opts.frames; i++) {
  const target = t0 + i * opts.every * 1000;
  if (Date.now() < target) await sleep((target - Date.now()) / 1000);
  const shot = await page.evaluate((sel) => {
    const c = document.querySelector(sel);
    return c ? { url: c.toDataURL('image/png'), w: c.width, h: c.height } : null;
  }, opts.selector);
  if (!shot) {
    logs.push(`[shoot] no element matches ${opts.selector}`);
    errors++;
    break;
  }
  const t = (Date.now() - t0) / 1000;
  frames.push({ ...shot, t });
  fs.writeFileSync(path.join(opts.out, `frame_${String(i).padStart(2, '0')}.png`), Buffer.from(shot.url.split(',')[1], 'base64'));
}

if (frames.length) {
  const sheet = await page.evaluate(
    async ({ frames, cols, scale, label }) => {
      const load = (src) => new Promise((res, rej) => Object.assign(new Image(), { onload() { res(this); }, onerror: rej, src }));
      const imgs = await Promise.all(frames.map((f) => load(f.url)));
      const fw = frames[0].w * scale;
      const fh = frames[0].h * scale;
      const pad = 4;
      const capH = 14;
      const rows = Math.ceil(frames.length / cols);
      const head = label ? 20 : 0;
      const c = document.createElement('canvas');
      c.width = cols * (fw + pad) + pad;
      c.height = head + rows * (fh + pad + capH) + pad;
      const x = c.getContext('2d');
      x.fillStyle = '#202020';
      x.fillRect(0, 0, c.width, c.height);
      x.imageSmoothingEnabled = false;
      x.font = '12px monospace';
      if (label) {
        x.fillStyle = '#fff';
        x.fillText(label, pad, 14);
      }
      imgs.forEach((img, i) => {
        const cx = pad + (i % cols) * (fw + pad);
        const cy = head + pad + Math.floor(i / cols) * (fh + pad + capH);
        x.drawImage(img, cx, cy, fw, fh);
        x.fillStyle = '#ccc';
        x.fillText(`#${i}  t=${frames[i].t.toFixed(2)}s`, cx, cy + fh + 11);
      });
      return c.toDataURL('image/png');
    },
    { frames, cols: opts.cols, scale: opts.scale, label: opts.label || '' }
  );
  fs.writeFileSync(path.join(opts.out, 'sheet.png'), Buffer.from(sheet.split(',')[1], 'base64'));
}

fs.writeFileSync(path.join(opts.out, 'console.log'), logs.join('\n') + (logs.length ? '\n' : ''));
await context.close();
await browser.close();
console.log(`${frames.length} frames -> ${path.join(opts.out, 'sheet.png')}${errors ? ` (${errors} errors, see console.log)` : ''}`);
if (logs.length) console.log(logs.slice(0, 10).join('\n'));
process.exit(errors ? 2 : 0);
