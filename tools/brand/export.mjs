#!/usr/bin/env node
// Exports the channel's YouTube avatar and banner (public/lab/brand.js) as PNG files, plus review sheets:
//   docs/brand/globit24-avatar-800.png       800x800 (YouTube crops it to a circle)
//   docs/brand/globit24-banner-2560x1440.png 2560x1440 (safe band: the centre 1546x423)
//   docs/brand/review-avatar.png              the avatar as YouTube shows it (circle, 176 / 98 / 48 / 32 px, light
//                                             and dark pages)
//   docs/brand/review-banner.png              the banner with its TV, desktop and mobile crops
// Needs the channel's server running (it serves public/): node tools/brand/export.mjs [--port 8714]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import(new URL('../../../tools-node/node_modules/playwright/index.mjs', import.meta.url).href);
}
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const port = arg('port', '8714');
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/brand');
fs.mkdirSync(out, { recursive: true });

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/lab/brand.html`);
await page.waitForFunction(() => !!window.brand);
const png = async (fn) => Buffer.from((await page.evaluate(fn)).split(',')[1], 'base64');

fs.writeFileSync(path.join(out, 'globit24-avatar-800.png'), await png(() => window.brand.scaled(window.brand.avatar(), 8).toDataURL('image/png')));
fs.writeFileSync(path.join(out, 'globit24-banner-2560x1440.png'), await png(async () => (await window.brand.bannerFull()).toDataURL('image/png')));

// review sheets, drawn at their real sizes
fs.writeFileSync(
  path.join(out, 'review-avatar.png'),
  await png(() => {
    const a = window.brand.scaled(window.brand.avatar(), 8);
    const c = document.createElement('canvas');
    c.width = 1240;
    c.height = 440;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 620, 440);
    g.fillStyle = '#0f0f0f';
    g.fillRect(620, 0, 620, 440);
    const circle = (x, y, s) => {
      g.save();
      g.beginPath();
      g.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
      g.clip();
      g.imageSmoothingEnabled = s < 400;
      g.imageSmoothingQuality = 'high';
      g.drawImage(a, x, y, s, s);
      g.restore();
    };
    g.imageSmoothingEnabled = false;
    g.drawImage(a, 10, 10, 400, 400);
    for (const [x0] of [[430], [1050 - 620 + 620]]) {
      let y = 10;
      for (const s of [176, 98, 48, 32]) {
        circle(x0, y, s);
        y += s + 12;
      }
    }
    circle(640, 10, 400);
    return c.toDataURL('image/png');
  }),
);
fs.writeFileSync(
  path.join(out, 'review-banner.png'),
  await png(async () => {
    const b = await window.brand.bannerFull();
    const W = 1280, k = W / 2560;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = Math.round(1440 * k) + 10 + Math.round((423 / 1546) * W);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(b, 0, 0, W, 1440 * k);
    const zone = (w, h, col) => {
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.strokeRect(((2560 - w) / 2) * k, ((1440 - h) / 2) * k, w * k, h * k);
    };
    zone(2560, 423, '#2ce8f5');
    zone(1546, 423, '#feae34');
    g.drawImage(b, (2560 - 1546) / 2, (1440 - 423) / 2, 1546, 423, 0, 1440 * k + 10, W, (423 / 1546) * W);
    return c.toDataURL('image/png');
  }),
);
await browser.close();
console.log(`→ ${out}`);
