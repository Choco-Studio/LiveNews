#!/usr/bin/env node
// Contact sheets of the cleared-picture measurement: each story before (the outlet's photo it aired with) and after
// (the rights desk's pick, or the map), rendered by the channel's own client code (public/lab/pictures.html: the
// headline board, pixelate.js, the credit overlay) in headless Chromium.
//
//   NODE_USE_ENV_PROXY=1 node tools/pictures/sheet.mjs --out data/pictures-measure --dest <dir> [--per 10] [--only picks|none|all]
//        [--big <n>]   (also n stories at 4x, after only)
//
// Pictures are downloaded once into <out>/img/ (Wikimedia's with the desk's own User-Agent, one at a time, its
// Retry-After obeyed). A local server on a free port serves public/ and the pictures (never port 8711).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { wikimediaAgent } from '../../server/wikimedia.js';
import { imageSize } from '../../server/pictures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, [])
);
const out = path.resolve(args.out || 'data/pictures-measure');
const dest = path.resolve(args.dest || path.join(out, 'sheets'));
const per = Number(args.per || 10);
const only = args.only || 'picks';
fs.mkdirSync(dest, { recursive: true });
const imgDir = path.join(out, 'img');
fs.mkdirSync(imgDir, { recursive: true });
const results = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));

// ---- the pictures, downloaded once
const agentWm = wikimediaAgent(process.env.WIKIMEDIA_CONTACT || undefined);
let pauseUntil = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function download(url) {
  if (!url || !/^https:\/\//.test(url)) return null;
  const name = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  for (const ext of ['jpg', 'png', 'webp']) if (fs.existsSync(path.join(imgDir, `${name}.${ext}`))) return `/cache/${name}.${ext}`;
  const wm = /wikimedia\.org\//.test(url);
  for (let attempt = 0; attempt < 6; attempt++) {
    if (wm && Date.now() < pauseUntil) await wait(pauseUntil - Date.now());
    try {
      const res = await fetch(url, { headers: { 'user-agent': wm ? agentWm : 'Mozilla/5.0 (compatible; LiveNewsBot/0.1)', accept: 'image/*' }, signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status === 503) {
        const ask = Number(res.headers.get('retry-after')) || 30;
        // (an original's download refused for ten minutes is skipped: the desk serves renditions, not originals)
        if (!wm || ask > 120) return null;
        pauseUntil = Date.now() + Math.max(5, ask) * 1000;
        continue;
      }
      if (!res.ok) return null;
      const body = Buffer.from(await res.arrayBuffer());
      const ext = body[0] === 0x89 ? 'png' : body.toString('latin1', 8, 12) === 'WEBP' ? 'webp' : body[0] === 0xff && body[1] === 0xd8 ? 'jpg' : null;
      if (!ext || !imageSize(body)) return null;
      fs.writeFileSync(path.join(imgDir, `${name}.${ext}`), body);
      if (wm) await wait(1200);
      return `/cache/${name}.${ext}`;
    } catch {
      if (!wm) return null;
      await wait(3000);
    }
  }
  return null;
}

let list = results;
if (only === 'picks') list = results.filter((r) => r.pick);
else if (only === 'none') list = results.filter((r) => !r.pick);
if (args.limit) list = list.slice(0, Number(args.limit));
const cases = [];
let n = 0;
for (const r of list) {
  n++;
  const before = r.before?.image ? await download(r.before.image) : null;
  const after = r.pick ? await download(r.pick.url) : null;
  cases.push({
    n: results.indexOf(r) + 1,
    programme: r.programme,
    title: r.title,
    grave: r.grave || !!r.plan?.flags?.grave,
    headline: r.title.length > 70 ? r.title.slice(0, 70).replace(/\s+\S*$/, '') : r.title,
    source: r.source,
    category: r.category,
    location: r.location,
    before: { img: before, source: r.source, note: r.before ? (before ? 'outlet photo (not cleared)' : 'outlet photo (would not download)') : 'no outlet photo' },
    after: r.pick ? { img: after, focus: r.pick.focus, fit: r.pick.kind === 'portrait' ? 'portrait' : null, credit: r.pick.credit, source: r.source.split(' / ')[0], note: `${r.pick.kind} · ${r.pick.subject?.label || ''}${r.pick.subject?.qid ? ` (${r.pick.subject.qid})` : ''} · ${decodeURIComponent(String(r.pick.page || r.pick.url).split('/').pop()).slice(0, 70)}` } : { img: null, source: r.source.split(' / ')[0], note: 'no cleared picture: the map' },
  });
  process.stdout.write(`\r[sheet] pictures ${n}/${list.length}   `);
}
console.log('');
fs.writeFileSync(path.join(dest, `cases-${only}.json`), JSON.stringify(cases, null, 1));

// ---- a local server: public/ and the pictures
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = u.pathname.startsWith('/cache/') ? path.join(imgDir, path.basename(u.pathname)) : path.join(ROOT, 'public', path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
if (port === 8711) throw new Error('refusing port 8711');

let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import('/opt/node-tools/node_modules/playwright/index.mjs');
}
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error('[page]', e.message));
const shoot = async (url, chunk, file) => {
  await page.goto(url);
  await page.waitForSelector('body[data-loaded="1"]');
  await page.evaluate((c) => window.__render(c), chunk);
  await page.waitForSelector('body[data-ready="1"]');
  await page.screenshot({ path: file, fullPage: true });
};
if (args.grid) {
  // the hand check: every cleared pick, twelve to a sheet, on the board with its credit
  const picked = cases.filter((c) => c.after.img);
  for (let i = 0; i < picked.length; i += 12) {
    const file = path.join(dest, `grid-${String(i / 12 + 1).padStart(2, '0')}.png`);
    await shoot(`http://127.0.0.1:${port}/lab/pictures.html?grid=1`, picked.slice(i, i + 12), file);
    console.log(`[sheet] ${file}`);
  }
} else {
  for (let i = 0; i < cases.length; i += per) {
    const file = path.join(dest, `${only}-${String(i / per + 1).padStart(2, '0')}.png`);
    await shoot(`http://127.0.0.1:${port}/lab/pictures.html`, cases.slice(i, i + per), file);
    console.log(`[sheet] ${file}`);
  }
}
if (args.big) {
  const bigCases = cases.filter((c) => c.after.img).slice(0, Number(args.big));
  for (let i = 0; i < bigCases.length; i += 3) {
    const file = path.join(dest, `big-${String(i / 3 + 1).padStart(2, '0')}.png`);
    await shoot(`http://127.0.0.1:${port}/lab/pictures.html?big=1`, bigCases.slice(i, i + 3), file);
    console.log(`[sheet] ${file}`);
  }
}
await browser.close();
server.close();
