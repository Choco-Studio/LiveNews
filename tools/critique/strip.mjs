#!/usr/bin/env node
// Filmstrips for motion judgements (docs/roadmap/QUALITY_LOOP.md, rule 1: a movement is never judged from
// one still): renders consecutive lab frames at a fixed rate, crops a window and lays them out in a grid,
// nearest-neighbour upscaled. With --find eyes it first scans the idle loop for the frames where the eye
// window changes most (a blink, a saccade) and centres the strip on the first of them.
//
//   node tools/critique/strip.mjs --id paco --mode idle --t0 1 --frames 24 --fps 30 \
//        --crop 150,60,90,40 --zoom 6 --cols 8 --out docs/roadmap/critique/renders/r22/paco-blink.png
//   node tools/critique/strip.mjs --id paco --mode idle --find eyes --secs 8 ...
//   --find blink: centres the strip on the frame with the fewest sclera (silver) pixels in the window
//
// --crop x,y,w,h is in canvas pixels (384x216); --scale is the lab scale (default 3.4).
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
const A = ['paco', 'lola', 'sam', 'penny', 'vic', 'rhea', 'mika']; // correspondents draw in the A lab too
const id = String(args.id ?? 'paco');
const mode = String(args.mode ?? 'idle');
const fps = Number(args.fps ?? 30);
const frames = Number(args.frames ?? 24);
const cols = Number(args.cols ?? 8);
const zoom = Number(args.zoom ?? 6);
const scale = Number(args.scale ?? 3.4);
const port = Number(args.port ?? 8080);
const [cx, cy, cw, ch] = String(args.crop ?? '120,40,144,100').split(',').map(Number);
const out = path.resolve(String(args.out ?? `docs/roadmap/critique/renders/latest/${id}-${mode}.png`));
let t0 = Number(args.t0 ?? 0.5);

const browser = await playwright.chromium.launch();
const page = await browser.newPage();
const lab = A.includes(id) ? 'v2-cast-a' : 'v2-cast-b';
await page.goto(`http://127.0.0.1:${port}/lab/${lab}.html?still=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__lab && typeof window.__lab.render === 'function');
await page.waitForTimeout(400);
await page.evaluate(({ mode, id, scale, gesture, framing }) => {
  const o = { mode, presenter: id, scale, zoom: 1, emotion: null, focus: 'head', bg: 'ink' };
  if (gesture) o.gesture = gesture;
  if (framing) o.framing = framing;
  window.__lab.set(o);
}, { mode, id, scale, gesture: args.gesture ? String(args.gesture) : null, framing: args.framing ? String(args.framing) : null });

if (args.find) {
  // the frame where the crop window changes most (after the first), over --secs at fps
  const secs = Number(args.secs ?? 8);
  const blink = String(args.find) === 'blink';
  const best = await page.evaluate(({ secs, fps, t0, cx, cy, cw, ch, blink }) => {
    const c = document.getElementById('screen');
    const g = c.getContext('2d', { willReadFrequently: true });
    let prev = null, bestT = t0, bestD = -1;
    for (let k = 0; k < secs * fps; k++) {
      const t = t0 + k / fps;
      window.__lab.render(t);
      const d = g.getImageData(cx, cy, cw, ch).data;
      if (blink) {
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] === 0xc0 && d[i + 1] === 0xcb && d[i + 2] === 0xdc) n++;
        if (bestD < 0 || n < bestD) { bestD = n; bestT = t; }
        continue;
      }
      if (prev) {
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] !== prev[i] || d[i + 1] !== prev[i + 1] || d[i + 2] !== prev[i + 2]) n++;
        if (n > bestD) { bestD = n; bestT = t; }
      }
      prev = d;
    }
    return { t: bestT, d: bestD };
  }, { secs, fps, t0, cx, cy, cw, ch, blink });
  console.log(`largest change at t=${best.t.toFixed(3)} (${best.d} px)`);
  t0 = Math.max(0, best.t - Math.floor(frames / (blink ? 2 : 3)) / fps);
}

const png = await page.evaluate(({ t0, fps, frames, cols, zoom, cx, cy, cw, ch }) => {
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
  for (let k = 0; k < frames; k++) {
    const t = t0 + k / fps;
    window.__lab.render(t);
    const x = pad + (k % cols) * (cw * zoom + pad), y = pad + Math.floor(k / cols) * (ch * zoom + pad + lab);
    g.fillStyle = '#c0cbdc';
    g.fillText(`t=${t.toFixed(3)}`, x, y + 8);
    g.drawImage(c, cx, cy, cw, ch, x, y + lab, cw * zoom, ch * zoom);
  }
  return o.toDataURL('image/png');
}, { t0, fps, frames, cols, zoom, cx, cy, cw, ch });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
console.log(out);
await browser.close();
