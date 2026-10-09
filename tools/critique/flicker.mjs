#!/usr/bin/env node
// Flicker check for the presenters' skin (docs/roadmap/QUALITY_LOOP.md, Motion): renders a talk
// (or turnaround) at 30 fps in the cast labs and reports, per presenter, how many pixels of a
// colour (default the highlight, cream #ead4aa) appear and how many of them toggle between
// consecutive frames. A tone that pops on and off as the head bobs with speech reads as flicker.
//
//   node tools/critique/flicker.mjs [--ids paco,sam] [--mode talk|turnaround] [--hex ead4aa] [--secs 3] [--trace]
// --trace prints every frame's time, pixel count and toggles (to find the frame of a jump)
// --rows a:b counts only canvas rows a..b-1 (e.g. the moustache apart from the hair); --hist prints, for the
// first frame, how many pixels of the colour each row holds
let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import('/opt/node-tools/node_modules/playwright/index.mjs');
}
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), [])
);
const A = ['paco', 'lola', 'sam', 'penny'];
const ids = String(args.ids ?? 'paco,lola,sam,penny,max,ada,nova').split(',');
const mode = String(args.mode ?? 'talk');
const hex = String(args.hex ?? 'ead4aa');
const secs = Number(args.secs ?? 3);
const port = Number(args.port ?? 8080);
const scale = Number(args.scale ?? 3.4);
const rows = args.rows ? String(args.rows).split(':').map(Number) : [0, 1e9];
const hist = !!args.hist;
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
for (const id of ids) {
  const lab = A.includes(id) ? 'v2-cast-a' : 'v2-cast-b';
  await page.goto(`http://127.0.0.1:${port}/lab/${lab}.html?still=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lab && typeof window.__lab.render === 'function');
  await page.waitForTimeout(500);
  const r = await page.evaluate(
    ({ id, mode, hex, secs, scale, rows, hist }) => {
      const want = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
      window.__lab.set({ mode, presenter: id, scale, zoom: 1, emotion: null, focus: 'head', bg: 'ink' });
      const c = document.getElementById('screen');
      const g = c.getContext('2d', { willReadFrequently: true });
      let prev = null;
      const counts = [], toggles = [];
      let histRows = '';
      for (let k = 0; k < secs * 30; k++) {
        window.__lab.render(0.4 + k / 30);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const cur = new Uint8Array(c.width * c.height);
        let n = 0;
        for (let i = 0; i < cur.length; i++) {
          const ry = (i / c.width) | 0;
          if (ry >= rows[0] && ry < rows[1] && d[i * 4] === want[0] && d[i * 4 + 1] === want[1] && d[i * 4 + 2] === want[2]) {
            cur[i] = 1;
            n++;
          }
        }
        counts.push(n);
        if (hist && k === 0) {
          const h = [];
          for (let y = 0; y < c.height; y++) { let m = 0; for (let x = 0; x < c.width; x++) m += cur[y * c.width + x]; if (m) h.push(`${y}:${m}`); }
          histRows = h.join(' ');
        }
        if (prev) {
          // the head moves with speech: align on the best whole-pixel shift first, so only a
          // change of shape counts (a highlight that pops on or off), not a 1 px bob
          const W = c.width, H = c.height;
          let best = Infinity;
          for (let sy = -2; sy <= 2; sy++) {
            for (let sx = -2; sx <= 2; sx++) {
              let t = 0;
              for (let y = 2; y < H - 2; y++) {
                for (let x = 2; x < W - 2; x++) {
                  if (cur[y * W + x] !== prev[(y - sy) * W + (x - sx)]) t++;
                }
              }
              if (t < best) best = t;
            }
          }
          toggles.push(best);
        }
        prev = cur;
      }
      const sum = (a) => a.reduce((x, y) => x + y, 0);
      const sorted = [...toggles].sort((a, b) => a - b);
      return {
        meanPx: +(sum(counts) / counts.length).toFixed(1),
        minPx: Math.min(...counts),
        maxPx: Math.max(...counts),
        meanToggle: +(sum(toggles) / toggles.length).toFixed(2),
        p95Toggle: sorted[Math.floor(sorted.length * 0.95)],
        maxToggle: sorted[sorted.length - 1],
        hist: histRows,
        trace: counts.map((n, k) => `${(0.4 + k / 30).toFixed(3)} ${n} ${k ? toggles[k - 1] : '-'}`),
      };
    },
    { id, mode, hex, secs, scale, rows, hist }
  );
  if (hist) console.log(r.hist);
  if (args.trace) console.log(r.trace.join('\n'));
  console.log(`${id.padEnd(6)} ${mode}: highlight px mean ${r.meanPx} (min ${r.minPx}, max ${r.maxPx}); toggles/frame mean ${r.meanToggle}, p95 ${r.p95Toggle}, max ${r.maxToggle}`);
}
await browser.close();
