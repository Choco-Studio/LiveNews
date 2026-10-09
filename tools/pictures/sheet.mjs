#!/usr/bin/env node
// Contact sheet of a picture-bench run (tools/pictures/run-bench.mjs): every story with its picture as it would air
// (pixelated at the full shot's 192x108 by the client's own public/js/pixelate.js, nearest-neighbour x2), its
// headline, how it was found and its credit. Stories without a picture are listed after, with the reason.
//
//   node tools/pictures/sheet.mjs [--run data/bench/run-brief.json] [--out data/bench/sheet-brief] [--per 40]
// Writes <out>-1.png, <out>-2.png… (one page per --per stories with a picture) and <out>-none.txt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../tools-node/node_modules/playwright/index.mjs').replace(/\\/g, '/').replace(/^([A-Z]):/, 'file:///$1:'));
}
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const runPath = path.resolve(arg('run', 'data/bench/run-brief.json'));
const out = path.resolve(arg('out', runPath.replace(/run-([a-z]+)\.json$/, 'sheet-$1')));
const per = Number(arg('per', 40));
const { results, summary } = JSON.parse(fs.readFileSync(runPath, 'utf8'));
const pixelateSrc = fs.readFileSync(path.resolve('public/js/pixelate.js'), 'utf8').replace(/^export /gm, '');

const withPic = results.filter((r) => r.picture);
const none = results.filter((r) => !r.picture);
fs.writeFileSync(
  `${out}-none.txt`,
  none.map((r) => `${r.grave ? 'G ' : '  '}${r.title}\n     subjects: ${(r.brief?.subjects || []).map((s) => `${s.name}:${s.kind}`).join(', ') || '-'} | candidates ${r.run?.candidates ?? 0} | turned down: ${[...new Set((r.run?.rejected || []).map((x) => x.why.split(':')[0]))].join(', ') || '-'}`).join('\n'),
);

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1640, height: 1000 } });
for (let p = 0; p * per < withPic.length; p++) {
  const items = withPic.slice(p * per, (p + 1) * per).map((r, i) => ({
    n: p * per + i + 1,
    title: r.title,
    grave: r.grave,
    url: r.picture.url,
    focusY: r.picture.focusY,
    via: r.picture.via,
    credit: r.picture.credit,
    subject: r.picture.record.subject,
  }));
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#111;color:#ddd;font:12px/1.25 system-ui;padding:10px}
    h1{font-size:14px;margin:0 0 8px}
    .grid{display:grid;grid-template-columns:repeat(4,400px);gap:10px}
    .c{background:#1c1c1c;padding:6px}.c.g{outline:2px solid #a33}
    canvas{width:384px;height:216px;image-rendering:pixelated;display:block}
    .t{font-weight:600;margin:4px 0 2px;height:30px;overflow:hidden}.m{color:#999;font-size:11px}
  </style></head><body><h1>${summary.mode} · ${summary.withPicture}/${summary.stories} with a picture · page ${p + 1}</h1><div class="grid" id="g"></div>
  <script>${pixelateSrc}
  window.render = async (items) => {
    const g = document.getElementById('g');
    await Promise.all(items.map(async (it) => {
      const d = document.createElement('div'); d.className = 'c' + (it.grave ? ' g' : '');
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
      d.innerHTML = '<div class="t">' + it.n + '. ' + esc(it.title) + '</div><div class="m">' + esc(it.via + ' · ' + it.subject + ' · ' + it.credit) + '</div>';
      g.appendChild(d);
      try {
        const img = new Image(); img.crossOrigin = 'anonymous'; img.src = it.url; await img.decode();
        const c = pixelate(img, 192, 108, { colors: 24, focusY: it.focusY ?? 0.4 });
        d.insertBefore(c, d.firstChild);
      } catch (e) { d.insertAdjacentHTML('afterbegin', '<div style="height:216px;color:#f66">load failed</div>'); }
    }));
  };</script></body></html>`);
  await page.evaluate((it) => window.render(it), items);
  await page.screenshot({ path: `${out}-${p + 1}.png`, fullPage: true });
  console.log(`${out}-${p + 1}.png`);
}
await browser.close();
console.log(`${out}-none.txt (${none.length} without a picture)`);
