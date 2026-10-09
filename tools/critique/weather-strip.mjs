#!/usr/bin/env node
// Filmstrips of the WORLD WEATHER presenter (docs/roadmap/QUALITY_LOOP.md): renders /lab/weather.html's
// deterministic frames (window.renderAt) at a fixed rate and lays them out in a grid, cropped and upscaled.
//
//   node tools/critique/weather-strip.mjs --list
//   node tools/critique/weather-strip.mjs --seg 2 --from 1 --t0 0 --frames 24 --fps 12 --crop 0,0,384,216 --zoom 2 --cols 6 \
//        --out docs/roadmap/critique/renders/r27/sam-walk.png [--nogfx]
import fs from 'node:fs';
import path from 'node:path';

let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import('/opt/node-tools/node_modules/playwright/index.mjs');
}
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), [])
);
const port = Number(args.port ?? 8080);
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/lab/weather.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.weatherReady === true, null, { timeout: 60000 });
if (args.list) {
  const segs = await page.evaluate(() => [...document.getElementById('seg').options].map((o) => o.textContent));
  console.log(segs.join('\n'));
  await browser.close();
  process.exit(0);
}
const seg = Number(args.seg ?? 1);
const from = args.from != null ? Number(args.from) : null;
const fps = Number(args.fps ?? 12);
const frames = Number(args.frames ?? 24);
const cols = Number(args.cols ?? 6);
const zoom = Number(args.zoom ?? 2);
const t0 = Number(args.t0 ?? 0);
const [cx, cy, cw, ch] = String(args.crop ?? '0,0,384,216').split(',').map(Number);
const out = path.resolve(String(args.out ?? 'docs/roadmap/critique/renders/latest/weather.png'));
const png = await page.evaluate(({ seg, from, fps, frames, cols, zoom, t0, cx, cy, cw, ch, gfx }) => {
  const c = document.getElementById('screen');
  const rows = Math.ceil(frames / cols);
  const pad = 2, lab = 10;
  const o = document.createElement('canvas');
  o.width = cols * (cw * zoom + pad) + pad;
  o.height = rows * (ch * zoom + pad + lab) + pad;
  const g = o.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#0b0b10';
  g.fillRect(0, 0, o.width, o.height);
  g.font = '9px monospace';
  let info = null;
  for (let k = 0; k < frames; k++) {
    const t = t0 + k / fps;
    info = window.renderAt(seg, t, { from, gfx });
    const x = pad + (k % cols) * (cw * zoom + pad), y = pad + Math.floor(k / cols) * (ch * zoom + pad + lab);
    g.fillStyle = '#c0cbdc';
    g.fillText(`t=${t.toFixed(3)} ${info && info.walk ? 'walk' : ''}`, x, y + 8);
    g.drawImage(c, cx, cy, cw, ch, x, y + lab, cw * zoom, ch * zoom);
  }
  return o.toDataURL('image/png');
}, { seg, from, fps, frames, cols, zoom, t0, cx, cy, cw, ch, gfx: !args.nogfx });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
console.log(out);
await browser.close();
