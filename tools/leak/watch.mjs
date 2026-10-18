#!/usr/bin/env node
// The page's memory over programmes: the channel page in headless Chromium for as long as asked (real time, or faster
// on a fake clock), the garbage collector forced before every sample, and what the page still holds counted from
// every side: the census (tools/leak/census.mjs: canvases and their bytes, images, videos, audio contexts, buffers
// and nodes, live after the collection), the DOM (attached and all nodes, listeners), the JS heap, and the browser's
// processes' memory (RSS + swap) and CPU by kind (renderer, GPU, utility, browser). Heap-snapshot summaries (objects by
// constructor, detached DOM nodes) at chosen moments, and a diff between them, name what accumulates.
//
//   node tools/leak/watch.mjs --port 8796 --minutes 30 --every 30 --snap-every 10 --out data/leak/run1
//   node tools/leak/watch.mjs --port 8796 --minutes 60 --speed 4 ...      (the page's clock 4x real time: programmes
//        back to back, compressed; its WebAudio still runs in real time)
//   --record   the live capture as tools/stream.mjs runs it in the page (what it sends is counted and dropped), to
//              measure what the capture itself holds
//   --capture png|frames|vp8|vp8hq|vp9   which capture (tools/live/capture.mjs; default the stream's)
//   --query "beds=0"   more page parameters
//   --allocators       Chromium's own breakdown of the renderer's and the GPU process's memory each sample (malloc,
//                      PartitionAlloc, Blink, V8, Skia, discardable, canvases...: tools/leak/allocators.mjs)
//
// Writes <out>.jsonl (one sample a line), <out>-snap-<n>.json (a heap summary each) and <out>-summary.json.
import fs from 'node:fs';
import path from 'node:path';
import { censusInit } from './census.mjs';
import { Writable } from 'node:stream';
import { capturePageInit, CAPTURES, DEFAULT_CAPTURE } from '../live/capture.mjs';
import { FrameSink } from '../live/sink.mjs';
import { procTree, summariseTree } from './proc.mjs';
import { summariseSnapshot, diffSummaries } from './snapshot.mjs';
import { allocatorDump, rendererOf } from './allocators.mjs';

const opts = { port: 8796, minutes: 30, every: 30, 'snap-every': 0, speed: 1, out: 'data/leak/watch', capture: DEFAULT_CAPTURE };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2), v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) opts[k] = true;
  else {
    opts[k] = v;
    i++;
  }
}
for (const k of ['port', 'minutes', 'every', 'snap-every', 'speed']) opts[k] = Number(opts[k]);
const OUT = path.resolve(String(opts.out));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const base = opts.url || `http://127.0.0.1:${opts.port}`;
const say = (...a) => console.log('[leak]', new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (opts.record && !CAPTURES[opts.capture]) {
  console.error(`--capture is one of ${Object.keys(CAPTURES).join(', ')}`);
  process.exit(1);
}

async function chromium() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    return (await import('/opt/node-tools/node_modules/playwright/index.mjs')).chromium;
  }
}

// what airs: the director's requests for the next item, answered (kind, programme, id), as the page saw them
function itemsInit() {
  window.__items = [];
  const of = window.fetch;
  window.fetch = function (u, ...a) {
    const p = of.call(this, u, ...a);
    try {
      if (/\/api\/next(\?|$)/.test(String(u?.url || u))) {
        p.then((res) => res.clone().json().then((j) => j?.kind && window.__items.push({ at: Date.now(), id: j.id, kind: j.kind, title: j.program?.title || (j.kind === 'break' ? 'break' : j.kind) }), () => {}), () => {});
      }
    } catch {
      /* counting only */
    }
    return p;
  };
}

let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));
const browser = await (await chromium()).launch({ handleSIGINT: false, handleSIGTERM: false, args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const errors = [];
let crashed = false;
page.on('pageerror', (e) => errors.push({ t: Date.now(), kind: 'pageerror', text: String(e?.message || e).slice(0, 300) }));
page.on('crash', () => {
  crashed = true;
  errors.push({ t: Date.now(), kind: 'crash' });
});
await page.addInitScript(censusInit);
await page.addInitScript(itemsInit);
// --public <dir>: the page's own files (js, css, assets) from another copy of public/, for a before-and-after on one
// station (e.g. `git archive HEAD public` unpacked somewhere)
if (opts.public) {
  const pub = path.resolve(String(opts.public));
  const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml' };
  await page.route(/^https?:\/\/[^/]+\/(js|css|assets|lab)\//, async (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '');
    const f = path.resolve(pub, rel);
    if (!f.startsWith(pub + path.sep) || !fs.existsSync(f)) return route.continue();
    await route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f), headers: { 'cache-control': 'no-store' } });
  });
}
let recBytes = 0;
let sink = null;
if (opts.record) {
  await page.exposeFunction('__chunk', (b64) => {
    recBytes += Buffer.byteLength(b64, 'base64');
  });
  await page.addInitScript(capturePageInit);
}
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');
const browserCdp = opts.allocators ? await browser.newBrowserCDPSession() : null;
const speed = opts.speed > 0 ? opts.speed : 1;
const T0 = Date.now();
if (speed !== 1) {
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  // the picture drawn speed times less often on the page's clock (the same frames a real second as at 1x): the
  // programmes' timers run fast, the drawing does not eat the gain
  await page.addInitScript((k) => {
    const raf = window.requestAnimationFrame.bind(window);
    let frameT = -1;
    let run = false;
    let last = -1e9;
    window.requestAnimationFrame = (cb) =>
      raf(function step(t) {
        if (t !== frameT) {
          frameT = t;
          run = t - last >= 16 * k - 1;
          if (run) last = t;
        }
        if (run) cb(t);
        else raf(step);
      });
  }, speed);
}
await page.goto(`${base}/?autostart=1&voice=tts${opts.query ? `&${opts.query}` : ''}`, { waitUntil: 'load' });
if (opts.record) {
  await page.waitForFunction(() => !!document.getElementById('screen'), null, { timeout: 30_000 });
  await sleep(3000);
  const cfg = CAPTURES[opts.capture];
  let r;
  if (cfg.kind === 'frames') {
    // the frames capture posts to a sink, as the stream's: here the sink's writer drops what it is given
    const drop = () => new Writable({ write: (c, e, cb) => cb() });
    sink = new FrameSink({ fps: 30 });
    r = await page.evaluate((c) => window.__startCapture(c), { ...cfg, fps: 30, sink: await sink.listen() });
    sink.start(r, { video: drop(), audio: r.audio ? drop() : null });
  } else r = await page.evaluate((c) => window.__startCapture(c), { ...cfg, fps: 30 });
  say(`recording the page (${opts.capture}${r.audio ? ', with sound' : ', WITHOUT sound'})`);
}
say(`on ${base} for ${opts.minutes} min${speed !== 1 ? ` at ${speed}x (fake clock)` : ''}, a sample every ${opts.every} s → ${OUT}.jsonl`);

// the fake clock, driven from here: the page's time runs `speed` times real time (or as fast as it can draw)
let fakeMs = 1000;
let driving = speed !== 1;
const driver = (async () => {
  const t0 = Date.now();
  while (driving) {
    const want = (Date.now() - t0) * speed;
    const step = Math.min(500, Math.max(0, want - fakeMs + 50));
    if (step < 16) {
      await sleep(10);
      continue;
    }
    try {
      await page.evaluate((ms) => globalThis.__pwClock.controller.runFor(ms), step);
      fakeMs += step;
    } catch (err) {
      if (!driving) break;
      errors.push({ t: Date.now(), kind: 'clock', text: String(err?.message || err).slice(0, 200) });
      await sleep(200);
    }
  }
})();

async function gc() {
  for (let i = 0; i < 2; i++) await cdp.send('HeapProfiler.collectGarbage');
  // (finalisers run as tasks after the collection)
  await page.evaluate(() => new Promise((r) => (globalThis.__pwClock ? queueMicrotask(r) : setTimeout(r, 0))));
  await sleep(300);
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(100);
}

async function snapshot() {
  const chunks = [];
  const on = ({ chunk }) => chunks.push(chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', on);
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', on);
  }
  return summariseSnapshot(JSON.parse(chunks.join('')));
}

const file = fs.createWriteStream(`${OUT}.jsonl`);
const end = T0 + opts.minutes * 60_000;
const samples = [];
const snaps = [];
let lastSnap = Date.now();
let lastCpu = null;
let lastAt = Date.now();
let k = 0;
while (Date.now() < end && !crashed && !stopping) {
  const wake = T0 + (k + 1) * opts.every * 1000;
  while (Date.now() < wake && !stopping) await sleep(Math.min(1000, wake - Date.now()));
  if (stopping) break;
  k++;
  let s;
  try {
    await gc();
    const census = await page.evaluate(() => window.__census.read());
    const items = await page.evaluate(() => window.__items.slice());
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const dom = await cdp.send('Memory.getDOMCounters');
    const tree = summariseTree(procTree(process.pid));
    let alloc;
    if (browserCdp) {
      const dump = await allocatorDump(browserCdp);
      const gpu = Object.values(dump).find((r) => /gpu/i.test(r.label));
      alloc = { renderer: rendererOf(dump)?.allocators, gpu: gpu?.allocators };
    }
    const now = Date.now();
    const cpu = Object.fromEntries(Object.entries(tree).map(([kind, v]) => [kind, v.cpu]));
    const cores = lastCpu ? Object.fromEntries(Object.entries(cpu).map(([kind, v]) => [kind, +((v - (lastCpu[kind] || 0)) / ((now - lastAt) / 1000)).toFixed(3)])) : null;
    lastCpu = cpu;
    lastAt = now;
    s = {
      t: Math.round((now - T0) / 1000),
      air: Math.round((speed !== 1 ? fakeMs : now - T0) / 1000),
      items: items.length,
      on: items.at(-1)?.title || null,
      heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1),
      nodes: dom.nodes,
      attached: census.attachedNodes,
      listeners: dom.jsEventListeners,
      documents: dom.documents,
      canvases: census.canvases.live,
      canvasMB: +(census.canvases.bytes / 1048576).toFixed(1),
      live: census.live,
      bytesMB: Object.fromEntries(Object.entries(census.bytes).filter(([, v]) => v > 0).map(([kk, v]) => [kk, +(v / 1048576).toFixed(2)])),
      made: census.made,
      audioContexts: census.audioContexts,
      objectUrls: census.objectUrls,
      canvasSites: census.canvasSites.slice(0, 25).map((x) => [x.s, x.live, +(x.bytes / 1048576).toFixed(2)]),
      sites: census.sites.slice(0, 40).map((x) => [x.s, x.live, x.made]),
      bytesBySite: census.bytesBySite.slice(0, 30).map((x) => [x.s, x.live, +(x.bytes / 1048576).toFixed(2)]),
      rssMB: Object.fromEntries(Object.entries(tree).map(([kind, v]) => [kind, Math.round(v.rss / 1024)])),
      swapMB: Object.fromEntries(Object.entries(tree).map(([kind, v]) => [kind, Math.round(v.swap / 1024)])),
      cores,
      alloc,
      recordedMB: opts.record ? +((sink ? sink.stats.bytes : recBytes) / 1048576).toFixed(1) : undefined,
      errors: errors.length,
    };
  } catch (err) {
    errors.push({ t: Date.now(), kind: 'sampler', text: String(err?.message || err).slice(0, 200) });
    continue;
  }
  samples.push(s);
  file.write(`${JSON.stringify(s)}\n`);
  const audioLive = Object.entries(s.live).filter(([kk]) => kk.startsWith('audio:')).reduce((a, [, v]) => a + v, 0);
  say(`t ${(s.t / 60).toFixed(1)} min (air ${(s.air / 60).toFixed(1)}) · ${s.items} items · ${s.on} · heap ${s.heapMB} MB · nodes ${s.nodes} (${s.attached} attached) · canvases ${s.canvases} (${s.canvasMB} MB) · audio nodes ${audioLive} · buffers ${s.live.AudioBuffer || 0} · renderer ${s.rssMB.renderer} MB`);
  if (opts['snap-every'] > 0 && Date.now() - lastSnap >= opts['snap-every'] * 60_000) {
    lastSnap = Date.now();
    try {
      const sum = await snapshot();
      sum.t = s.t;
      sum.items = s.items;
      snaps.push(sum);
      fs.writeFileSync(`${OUT}-snap-${snaps.length}.json`, JSON.stringify(sum, null, 1));
      if (snaps.length > 1) {
        const d = diffSummaries(snaps[0], sum, 25);
        say(`heap since the first snapshot: ${d.map((x) => `${x.name} ${x.dCount >= 0 ? '+' : ''}${x.dCount}`).slice(0, 12).join(', ')}`);
      }
    } catch (err) {
      errors.push({ t: Date.now(), kind: 'snapshot', text: String(err?.message || err).slice(0, 200) });
    }
  }
}
driving = false;
await driver;
file.end();

const first = samples[0] || {};
const last = samples.at(-1) || {};
const keys = new Set([...Object.keys(first.live || {}), ...Object.keys(last.live || {})]);
const growth = [...keys].map((kk) => ({ k: kk, first: first.live?.[kk] || 0, last: last.live?.[kk] || 0 })).filter((x) => x.last !== x.first).sort((a, b) => b.last - b.first - (a.last - a.first));
const summary = {
  minutes: +(((last.t || 0) / 60).toFixed(1)),
  airMinutes: +(((last.air || 0) / 60).toFixed(1)),
  speed,
  items: last.items || 0,
  samples: samples.length,
  heapMB: { first: first.heapMB, last: last.heapMB, max: Math.max(...samples.map((x) => x.heapMB || 0)) },
  nodes: { first: first.nodes, last: last.nodes, max: Math.max(...samples.map((x) => x.nodes || 0)) },
  canvases: { first: first.canvases, last: last.canvases, max: Math.max(...samples.map((x) => x.canvases || 0)) },
  canvasMB: { first: first.canvasMB, last: last.canvasMB },
  rendererMB: { first: first.rssMB?.renderer, last: last.rssMB?.renderer, max: Math.max(...samples.map((x) => x.rssMB?.renderer || 0)) },
  totalMB: { first: Object.values(first.rssMB || {}).reduce((a, b) => a + b, 0), last: Object.values(last.rssMB || {}).reduce((a, b) => a + b, 0) },
  liveGrowth: growth.slice(0, 30),
  snapshots: snaps.length > 1 ? diffSummaries(snaps[0], snaps.at(-1), 40) : null,
  errors: { total: errors.length, first: errors.slice(0, 10) },
  crashed,
};
fs.writeFileSync(`${OUT}-summary.json`, JSON.stringify(summary, null, 2));
say('done', JSON.stringify({ nodes: summary.nodes, canvases: summary.canvases, rendererMB: summary.rendererMB }));
await browser.close();
process.exit(0);
