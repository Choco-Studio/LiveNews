#!/usr/bin/env node
// The face reader: reads the faces in the pictures the picture desk queued (server/faces.js FaceStore), with a face
// detector (UltraFace RFB-320) and an expression model (FER+, emotion-ferplus-8), both ONNX, run by onnxruntime-web in
// headless Chromium (tools/pictures/faces.html). The station runs no model itself: it runs this tool as a child process
// in its watch mode and starts it again if it stops (server/facereader.js, FACE_READER=off: not run); after a
// measurement it is run by hand. The desk reads what it wrote.
//
//   NODE_USE_ENV_PROXY=1 node tools/pictures/faces.mjs --dir data/pictures [--img <cache dir>] [--limit 200]
//        [--urls <file with one URL a line>]   (read these too)
//        [--watch <seconds>]   (keep running: read the queue again every so many seconds; a picture that would not
//                              download is tried again half an hour later)
//
// Models and runtime are fetched once into data/models (Hugging Face: huggingface.co, which redirects to its CDN
// us.aws.cdn.hf.co; jsDelivr for onnxruntime-web 1.18.0). Pictures are fetched with the desk's own User-Agent, one at a
// time, a 429's Retry-After obeyed (a long one skips the picture).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { wikimediaAgent } from '../../server/wikimedia.js';
import { FaceStore, faceVerdict } from '../../server/faces.js';
import { imageSize } from '../../server/pictures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, [])
);
const dir = path.resolve(args.dir || 'data/pictures');
const imgDir = path.resolve(args.img || path.join(dir, 'img'));
const models = path.join(ROOT, 'data', 'models');
fs.mkdirSync(imgDir, { recursive: true });
fs.mkdirSync(path.join(models, 'ort'), { recursive: true });
const agent = wikimediaAgent(process.env.WIKIMEDIA_CONTACT || undefined);

const MODEL_FILES = [
  ['version-RFB-320.onnx', 'https://huggingface.co/onnxmodelzoo/version-RFB-320/resolve/main/version-RFB-320.onnx'],
  ['emotion-ferplus-8.onnx', 'https://huggingface.co/onnxmodelzoo/emotion-ferplus-8/resolve/main/emotion-ferplus-8.onnx'],
  ['ort/ort.wasm.min.js', 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.wasm.min.js'],
  ['ort/ort-wasm-simd.wasm', 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-simd.wasm'],
  ['ort/ort-wasm.wasm', 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm.wasm'],
];
for (const [name, url] of MODEL_FILES) {
  const file = path.join(models, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) continue;
  console.log(`[faces] fetching ${name}`);
  const res = await fetch(url, { headers: { 'user-agent': agent } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const store = new FaceStore({ dir });
const watch = args.watch ? Math.max(5, Number(args.watch) || 60) : 0;
const limit = Number(args.limit || 400);
const extra = args.urls ? fs.readFileSync(args.urls, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean) : [];
// (watch mode: a picture that would not download waits half an hour before it is tried again)
const missed = new Map();
function todoNow() {
  // the station's desk adds to the queue while this runs: its file is read again each time
  store.reloadQueue();
  const urls = store.queue().map((x) => x.url);
  for (const u of extra) if (!store.readings.has(u) && !urls.includes(u)) urls.push(u);
  return urls.filter((u) => !(missed.get(u) > Date.now())).slice(0, limit);
}
const first = todoNow();
console.log(`[faces] ${first.length} pictures to read (${store.readings.size} read before)${watch ? `, then the queue again every ${watch} s` : ''}`);
if (!first.length && !watch) process.exit(0);

// ---- the pictures, fetched once
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pauseUntil = 0;
async function download(url) {
  const name = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  for (const ext of ['jpg', 'png', 'webp']) if (fs.existsSync(path.join(imgDir, `${name}.${ext}`))) return `${name}.${ext}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (Date.now() < pauseUntil) await wait(pauseUntil - Date.now());
    try {
      const res = await fetch(url, { headers: { 'user-agent': agent, accept: 'image/*' }, signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status === 503) {
        const ask = Number(res.headers.get('retry-after')) || 30;
        if (ask > 120) return null;
        pauseUntil = Date.now() + Math.max(5, ask) * 1000;
        continue;
      }
      if (!res.ok) return null;
      const body = Buffer.from(await res.arrayBuffer());
      const ext = body[0] === 0x89 ? 'png' : body.toString('latin1', 8, 12) === 'WEBP' ? 'webp' : body[0] === 0xff && body[1] === 0xd8 ? 'jpg' : null;
      if (!ext || !imageSize(body)) return null;
      fs.writeFileSync(path.join(imgDir, `${name}.${ext}`), body);
      await wait(1000);
      return `${name}.${ext}`;
    } catch {
      await wait(2000);
    }
  }
  return null;
}

// ---- the page: the reader, the models, the pictures (a free port, never 8711)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let file;
  if (u.pathname === '/') file = path.join(ROOT, 'tools/pictures/faces.html');
  else if (u.pathname.startsWith('/models/')) file = path.join(models, path.normalize(u.pathname.slice(8)).replace(/^(\.\.[/\\])+/, ''));
  else if (u.pathname.startsWith('/cache/')) file = path.join(imgDir, path.basename(u.pathname));
  else file = null;
  if (!file) {
    res.writeHead(404);
    return res.end();
  }
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
if (server.address().port === 8711) throw new Error('refusing port 8711');
let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import('/opt/node-tools/node_modules/playwright/index.mjs');
}
const browser = await playwright.chromium.launch();
// (stopped by the station, or by hand: the browser goes with it)
let closing = false;
const close = async (code = 0) => {
  if (closing) return;
  closing = true;
  // the readings so far are kept; the queue file stays the desk's (never written over from here)
  store.save({ queue: false });
  await browser.close().catch(() => {});
  server.close();
  process.exit(code);
};
process.on('SIGTERM', () => close(0));
process.on('SIGINT', () => close(0));
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => document.body.dataset.loaded === '1' || document.body.dataset.loaded === 'error', null, { timeout: 120000 });
if ((await page.evaluate(() => document.body.dataset.loaded)) === 'error') throw new Error(await page.evaluate(() => document.body.dataset.error));

async function readAll(todo) {
  let n = 0;
  let failed = 0;
  for (const url of todo) {
    if (closing) return;
    n++;
    const local = await download(url);
    // (a picture that would not download stays queued: read on a later run, never taken for "no face")
    if (!local) {
      failed++;
      missed.set(url, Date.now() + 30 * 60_000);
      continue;
    }
    try {
      const reading = await page.evaluate((u) => window.__score(u), `/cache/${local}`);
      store.record(url, reading);
      const v = faceVerdict(reading);
      if (args.verbose) console.log(`[faces] ${url.split('/').pop().slice(0, 60)} faces ${v.faces} share ${v.share} ${v.expression} happy ${v.happiness} -> ${v.sober ? 'SOBER' : v.why}`);
    } catch (err) {
      console.warn(`[faces] ${url}: ${err.message}`);
    }
    if (n % 20 === 0) store.save({ queue: false });
    if (!args.verbose && process.stdout.isTTY) process.stdout.write(`\r[faces] ${n}/${todo.length}   `);
  }
  store.save({ queue: false });
  console.log(`[faces] read ${n - failed}, ${failed} would not download (still queued)`);
}

await readAll(first);
if (!watch) await close(0);
for (;;) {
  await wait(watch * 1000);
  const todo = todoNow();
  if (todo.length) await readAll(todo);
}
