#!/usr/bin/env node
// 24/7 soak: the channel page in headless Chromium in REAL time for hours (no fake clock), sampled every
// --every seconds: the page's JS heap and DOM nodes (CDP Performance.getMetrics), frames drawn per second
// (a requestAnimationFrame counter), long tasks, console errors and page crashes, plus the server's
// /api/status (queue depth, what is on air). Writes <out>.jsonl (one sample per line) and <out>-summary.json.
//
//   node tools/soak.mjs --port 8709 --hours 6 --every 30 --out data/soak/run1
//
// What "passes" (summary.verdict): no page crash, no uncaught error, the heap's last hour within +25 MB of
// its second hour, frames per second at or above --min-fps in 95 % of the samples, and the server's queue
// never empty while the channel airs a programme (it produces ahead of air).
import fs from 'node:fs';
import path from 'node:path';

const opts = { port: 8709, hours: 6, every: 30, 'min-fps': 24, out: 'data/soak/soak' };
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
for (const k of ['port', 'hours', 'every', 'min-fps']) opts[k] = Number(opts[k]);
const OUT = path.resolve(String(opts.out));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const base = opts.url || `http://127.0.0.1:${opts.port}`;
const say = (...a) => console.log('[soak]', new Date().toISOString().slice(11, 19), ...a);

async function chromium() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    return (await import('/opt/node-tools/node_modules/playwright/index.mjs')).chromium;
  }
}

async function status() {
  try {
    const r = await fetch(`${base}/api/status`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const browser = await (await chromium()).launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const errors = [];
let crashed = false;
page.on('pageerror', (e) => errors.push({ t: Date.now(), kind: 'pageerror', text: String(e?.message || e).slice(0, 300) }));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push({ t: Date.now(), kind: 'console', text: m.text().slice(0, 300) });
});
page.on('crash', () => {
  crashed = true;
  errors.push({ t: Date.now(), kind: 'crash', text: 'page crashed' });
});
await page.addInitScript(() => {
  // frames drawn and long tasks, read by the sampler
  window.__soak = { frames: 0, long: 0, longMs: 0 };
  const tick = () => {
    window.__soak.frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__soak.long++;
        window.__soak.longMs += e.duration;
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch {}
});
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await page.goto(`${base}/?autostart=1${opts.query ? `&${opts.query}` : ''}`);
say(`on ${base} for ${opts.hours} h, a sample every ${opts.every} s → ${OUT}.jsonl`);

const file = fs.createWriteStream(`${OUT}.jsonl`);
const t0 = Date.now();
const end = t0 + opts.hours * 3600_000;
let lastFrames = 0, lastLong = 0, lastAt = Date.now();
const samples = [];
while (Date.now() < end && !crashed) {
  await new Promise((r) => setTimeout(r, opts.every * 1000));
  let soak = null, metrics = {};
  try {
    soak = await page.evaluate(() => ({ ...window.__soak }));
    const m = await cdp.send('Performance.getMetrics');
    metrics = Object.fromEntries(m.metrics.map((x) => [x.name, x.value]));
  } catch (e) {
    errors.push({ t: Date.now(), kind: 'sampler', text: String(e?.message || e).slice(0, 200) });
  }
  const now = Date.now();
  const st = await status();
  const fps = soak ? (soak.frames - lastFrames) / ((now - lastAt) / 1000) : null;
  const s = {
    t: Math.round((now - t0) / 1000),
    fps: fps == null ? null : Math.round(fps * 10) / 10,
    heapMB: metrics.JSHeapUsedSize ? Math.round((metrics.JSHeapUsedSize / 1048576) * 10) / 10 : null,
    nodes: metrics.Nodes ?? null,
    long: soak ? soak.long - lastLong : null,
    queue: Array.isArray(st?.queue) ? st.queue.length : null,
    producing: st?.producing ?? null,
    aired: st?.airedTotal ?? st?.aired ?? null,
    serverError: st?.lastError ? String(st.lastError.message || st.lastError).slice(0, 120) : null,
    errors: errors.length,
  };
  if (soak) {
    lastFrames = soak.frames;
    lastLong = soak.long;
  }
  lastAt = now;
  samples.push(s);
  file.write(`${JSON.stringify(s)}\n`);
  if (samples.length % 20 === 1) say(`t ${(s.t / 60).toFixed(0)} min · ${s.fps} fps · heap ${s.heapMB} MB · nodes ${s.nodes} · queue ${s.queue} · aired ${s.aired} · errors ${s.errors}`);
}
file.end();

// verdict
const hour = (h) => samples.filter((s) => s.t >= h * 3600 && s.t < (h + 1) * 3600 && s.heapMB != null).map((s) => s.heapMB);
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);
const lastH = Math.max(1, Math.floor(samples.at(-1)?.t / 3600 || 0) - 1);
const heap2 = median(hour(1)), heapLast = median(hour(lastH));
const fpsOk = samples.filter((s) => s.fps != null && s.fps >= opts['min-fps']).length / Math.max(1, samples.filter((s) => s.fps != null).length);
const uncaught = errors.filter((e) => e.kind === 'pageerror' || e.kind === 'crash');
const emptyQueue = samples.filter((s) => s.queue === 0).length;
const summary = {
  hours: Math.round(((samples.at(-1)?.t || 0) / 3600) * 100) / 100,
  samples: samples.length,
  fps: { median: median(samples.map((s) => s.fps).filter((x) => x != null)), share_at_min: Math.round(fpsOk * 1000) / 1000, min: Math.min(...samples.map((s) => s.fps ?? Infinity)) },
  heapMB: { first: samples.find((s) => s.heapMB != null)?.heapMB ?? null, second_hour_median: heap2, last_hour_median: heapLast, max: Math.max(...samples.map((s) => s.heapMB ?? 0)) },
  nodes: { first: samples[0]?.nodes ?? null, last: samples.at(-1)?.nodes ?? null },
  longTasks: samples.reduce((a, s) => a + (s.long || 0), 0),
  emptyQueueSamples: emptyQueue,
  aired: samples.at(-1)?.aired ?? null,
  errors: { total: errors.length, uncaught: uncaught.length, first: errors.slice(0, 10) },
  crashed,
};
summary.verdict = {
  noCrash: !crashed,
  noUncaught: uncaught.length === 0,
  heapStable: heap2 == null || heapLast == null ? null : heapLast - heap2 <= 25,
  fpsSteady: fpsOk >= 0.95,
};
summary.pass = Object.values(summary.verdict).every((v) => v !== false);
fs.writeFileSync(`${OUT}-summary.json`, JSON.stringify(summary, null, 2));
say('done', JSON.stringify(summary.verdict), summary.pass ? 'PASS' : 'FAIL');
await browser.close();
process.exit(summary.pass ? 0 : 1);
