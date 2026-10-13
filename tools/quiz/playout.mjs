#!/usr/bin/env node
// Headless playout: takes the channel's items off /api/next at the pace they would air (an episode's voices or words,
// a break's spots and hold), so the server produces and archives programmes in real time with no browser. PAY ATTENTION
// is written from the archive of what aired (docs/programmes/pay-attention.md §9, step 1's gate: three real days of
// archive), and the archive only grows while something plays the channel.
//
//   node server/index.js &   (real feeds; the voices may stay 'browser')
//   node tools/quiz/playout.mjs --port 8711 [--hours 72]
import { episodeAir, breakAir } from '../../server/station.js';

const opts = { port: 8711, hours: 72 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) if (argv[i]?.startsWith('--')) opts[argv[i].slice(2)] = argv[i + 1];
const base = opts.url || `http://127.0.0.1:${Number(opts.port)}`;
const until = Date.now() + Number(opts.hours) * 3600_000;
const say = (...a) => console.log('[playout]', new Date().toISOString().slice(0, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let last = null;
let aired = 0;
while (Date.now() < until) {
  let item = null;
  try {
    const res = await fetch(`${base}/api/next${last ? `?after=${encodeURIComponent(last)}` : ''}`);
    if (res.status === 200) item = await res.json();
  } catch (err) {
    say(`server unreachable (${err.message}); retrying in 30 s`);
    await sleep(30_000);
    continue;
  }
  if (!item) {
    await sleep(10_000); // standby: nothing ready yet
    continue;
  }
  last = item.id;
  const seconds = item.kind === 'break' ? breakAir(item) : episodeAir(item);
  if (item.kind !== 'break') say(`#${++aired} ${item.program?.title || item.program?.id || 'episode'} · ${(item.storyIds || []).length} stories · ${Math.round(seconds)} s`);
  await sleep(Math.max(5, seconds) * 1000);
}
say(`done: ${aired} programmes`);
