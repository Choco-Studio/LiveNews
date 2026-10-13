#!/usr/bin/env node
// Pace tracer (owner: PACE stream): a fast, picture-light run of the real
// channel page on Playwright's fake clock that keeps only what the pace
// analyser needs - the director's timeline (shots, segments, captions, straps,
// stingers, pace traces of cuts / gestures / looks / ticker) - plus a contact
// sheet every few seconds. No audio render, no mix, no encode: a 10-minute
// programme traces in a few minutes, so pacing can be iterated between the
// full recordings with sound (tools/showcase/record-show.mjs), whose timeline
// format this writes (tools/pace/analyse.mjs reads both).
//
//   PORT=8710 VOICE_ENGINE=kokoro timeout 3000 npm run demo:offline &
//   node tools/pace/trace.mjs --port 8710 --v2 --start open --until next-open+20 --count 3 \
//        --seconds 1800 --out $SP/pace/after-trace
//   node tools/pace/analyse.mjs $SP/pace/after-trace-timeline.json
//
// Recorded voices (episodes carrying seg.audio, VOICE_ENGINE=kokoro on the server) are
// played by the channel itself and end on the fake clock at their real length (the
// showcase page-init.js), so the timing is the recorder's; lines spoken through
// speechSynthesis use the page-init estimate (no Kokoro here).
//
// Options: --port N | --url URL, --v2 (the default anyway), --v1 (the old renderer), --start now|open|break, --until next-open+S|break-end+S|episode-end+S,
//   --count N, --seconds N (max), --max-wait N, --skip N, --fps 15 (clock step), --sheet-every 12,
//   --cols 6, --out prefix (writes <prefix>-timeline.json, <prefix>-sheet.png, <prefix>-tiles/)
//   --item file.json   a saved episode / break served for the page's first /api/next (the server's history serves
//                      what follows it: the break and the next programme's open), so a before / after pair airs the
//                      same script with the same voices
//   --camera           the camera frame by frame (every clock step; use --fps 30): the shot on air, its framing and
//                      move, the Stage's camera as drawn (x, y, z, zoom, hy) and each presenter's voice (speaking, word,
//                      sentence) in the timeline's `camera` rows (tools/pace/camera.mjs measures them)
//   --frames a-b,c-d   every frame of those windows (seconds after the start event) as <prefix>-frames/*.png

import fs from 'node:fs';
import path from 'node:path';
import { FAKE_VOICES } from '../showcase/lib/voices.mjs';
import { deriveCues } from '../showcase/lib/music.mjs';
import { composeSheetInPage } from '../showcase/lib/sheet.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const opts = { port: 8710, start: 'open', until: null, count: 1, seconds: 900, 'max-wait': 300, skip: 0, fps: 15, 'sheet-every': 12, cols: 6 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  const n = argv[i + 1];
  if (n === undefined || n.startsWith('--')) opts[k] = true;
  else {
    opts[k] = n;
    i++;
  }
}
for (const k of ['port', 'count', 'seconds', 'max-wait', 'skip', 'fps', 'sheet-every', 'cols']) opts[k] = Number(opts[k]);
if (!opts.out) {
  console.error('usage: node tools/pace/trace.mjs --out prefix [--port 8710] [--v2] [--start open] [--until next-open+20] [--count 1] [--seconds 900]');
  process.exit(1);
}
const OUT = path.resolve(String(opts.out).replace(/(-timeline)?\.json$/i, ''));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const untilMatch = typeof opts.until === 'string' ? /^(next-open|break-end|episode-end)(?:\+(\d+(?:\.\d+)?))?$/.exec(opts.until) : null;
const url = (() => {
  const u = new URL(opts.url || `http://127.0.0.1:${opts.port}/?autostart=1&voice=tts`);
  if (opts.v2) u.searchParams.set('v2', '1');
  if (opts.v1) u.searchParams.set('v2', '0');
  return u.toString();
})();
const say = (...a) => console.log('[trace]', ...a);
const t0Real = Date.now();
const elapsed = () => `${((Date.now() - t0Real) / 1000).toFixed(0)}s`;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const context = await browser.newContext({ viewport: { width: 768, height: 432 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
});
// Same instrumentation as the showcase recorder (main.js gets one line appended in the served copy).
const INSTRUMENT = `
;try {
  window.__showcase = {
    audio: typeof audio !== 'undefined' ? audio : null,
    player: typeof player !== 'undefined' ? player : null,
    renderer: typeof renderer !== 'undefined' ? renderer : null,
    scene: typeof scene !== 'undefined' ? scene : (typeof player !== 'undefined' ? player.scene : null),
  };
  window.__sc?.instrument?.();
} catch (err) { console.warn('[trace] instrumentation failed', err); }
`;
await page.route(/\/js\/main\.js(\?.*)?$/, async (route) => {
  const res = await route.fetch();
  const body = `${await res.text()}\n${INSTRUMENT}`;
  await route.fulfill({ response: res, body, headers: { ...res.headers(), 'cache-control': 'no-store', 'content-length': String(Buffer.byteLength(body)) } });
});
// --js-root dir: the page's scripts from another checkout's public/js (a before / after pair on one server: the same
// items, voices and pictures, the old code); main.js keeps its instrumentation line
if (opts['js-root']) {
  const root = path.resolve(String(opts['js-root']));
  await page.route(/\/js\/(?!main\.js).+\.js(\?.*)?$/, async (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/js\//, '');
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file)) return route.continue();
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file, 'utf8'), headers: { 'cache-control': 'no-store' } });
  });
}
if (opts.item) {
  const item = fs.readFileSync(String(opts.item), 'utf8');
  let served = false;
  await page.route(/\/api\/next(\?.*)?$/, async (route) => {
    if (served) return route.continue();
    served = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: item });
  });
}
// --camera: one row per clock step, read right after the frame was rendered at that instant (pump)
const CAMERA_SAMPLE = `(async () => {
  const g = window.__showcase;
  const s = g?.scene;
  if (!s) return null;
  const C = (window.__camMod ||= await import('/js/v2/canvas25d/camera.js'));
  const st = g.renderer?.v2?.stage || null;
  const t = performance.now() / 1000;
  let cam = null;
  let base = null;
  if (st && st.base && (s.shot === 'wide' || s.shot === 'close')) {
    let c = st.base;
    if (st.spec?.move && typeof C.cameraAt === 'function') c = C.cameraAt(st.spec, t - st.moveSince) || c;
    cam = [c.x, c.y, c.z, c.zoom, c.hy].map((v) => Math.round(v * 1e4) / 1e4);
    base = [st.base.x, st.base.y, st.base.z, st.base.zoom, st.base.hy].map((v) => Math.round(v * 1e4) / 1e4);
  }
  const voice = {};
  const a = g.audio;
  for (const slot of new Set([...Object.keys(s.cast || {}), ...Object.keys(s.anchors || {})])) {
    if (!a || typeof a.speechFrame !== 'function') break;
    const f = a.speechFrame(t * 1000, slot, {});
    if (f && (f.speaking || f.voice > 0.05)) voice[slot] = [f.speaking ? 1 : 0, f.sentenceIndex, f.wordIndex, f.charIndex, Math.round((f.voice ?? -1) * 100) / 100, f.pause ? 1 : 0];
  }
  return { t: performance.now(), shot: s.shot, since: s.shotSince, framing: s.framing ?? null, focus: s.focus ?? null, move: s.cameraMove ? [s.cameraMove.type, s.cameraMove.amount, s.cameraMove.delay, s.cameraMove.dur] : null, moveSince: st?.moveSince ?? null, spec: st?.spec?.framing ?? null, cam, base, solo: st ? !!st.solo : null, voice, card: s.card ? String(s.card.quote?.text || s.card.fact || s.card.term?.term || (s.card.numbers ? 'numbers:' + s.card.numbers.map((n) => n.value).join('|') : '') || (s.card.known ? 'known' : '') || (s.card.timeline ? 'timeline' : '') || (s.card.change ? 'change' : '') || s.card.place || (s.card.index ?? '') || (s.card.items ? s.card.items.join('|') : '')).slice(0, 40) : null, weather: s.weather?.seg ? String(s.weather.seg.shot || s.weather.seg.kind || '') : null, sub: s.subtitle ? String(s.subtitle).slice(0, 48) : null, stinger: s.stinger?.start ?? null, seg: s.segPlan?.index ?? null };
})()`;
const cameraRows = [];
const maxSeconds = opts['max-wait'] + opts.skip + opts.seconds + 30;
// a low sample rate: nothing is rendered, the OfflineAudioContext only has to exist and decode
const cfg = { sampleRate: 8000, maxSeconds, speechLatencyMs: 45, voices: FAKE_VOICES };
await page.addInitScript({ content: `window.__SC_CFG = ${JSON.stringify(cfg)};\n${fs.readFileSync(path.join(HERE, '../showcase/page-init.js'), 'utf8')}` });
const T0 = Math.floor(Date.now() / 1000) * 1000;
await page.clock.install({ time: T0 });
await page.clock.pauseAt(T0 + 1000);
await page.goto(url, { waitUntil: 'domcontentloaded' });

async function settle(inflight, cap = 6000) {
  const t = Date.now();
  let n = inflight;
  while (n > 0 && Date.now() - t < cap) {
    await sleep(3);
    n = await page.evaluate(() => window.__sc?.inflight ?? 0);
  }
  return n;
}
for (let i = 0; i < 400; i++) {
  const ok = await page.evaluate(() => Boolean(window.__showcase?.player) && Boolean(window.__sc));
  if (ok) break;
  await settle(1, 200);
  await page.clock.runFor(50);
  if (i === 399) throw new Error('channel page never became ready (is the server running?)');
}
await page.evaluate(() => window.__sc.instrument());
await page.evaluate(() => window.__sc.manualRaf());
say(`page ready · ${elapsed()}`);

const allLog = [];
const pullLog = async () => {
  const l = await page.evaluate(() => window.__sc.takeLog());
  allLog.push(...l);
  return l;
};
const stepMs = Math.max(8, Math.round(1000 / opts.fps));
let sampling = false; // --camera rows from the start event on
async function step(ms, png = false) {
  const st = await page.evaluate((grab) => {
    window.__sc.takeRequests(); // estimate mode: nothing to synthesise
    window.__sc.pump();
    return { t: performance.now(), inflight: window.__sc.inflight, png: grab ? window.__sc.frame() : null };
  }, png);
  if (opts.camera && sampling) {
    const row = await page.evaluate(CAMERA_SAMPLE);
    if (row) cameraRows.push(row);
  }
  if (st.inflight > 0) await settle(st.inflight);
  await page.clock.runFor(ms);
  return st;
}
const pageNow = () => page.evaluate(() => performance.now());
const startEvent = { now: null, open: (e) => e.ev === 'shot' && e.shot === 'open', break: (e) => e.ev === 'playBreak' && e.phase === 'start' }[opts.start];
{
  const skipUntil = (await pageNow()) + opts.skip * 1000;
  while ((await pageNow()) < skipUntil) await step(100);
  if (startEvent) {
    const t0 = await pageNow();
    let found = false;
    let told = Date.now();
    while (!found) {
      await step(50);
      found = (await pullLog()).some(startEvent);
      const t = await pageNow();
      if (!found && t - t0 > opts['max-wait'] * 1000) throw new Error(`--start ${opts.start} not reached in ${opts['max-wait']} s`);
      if (Date.now() - told > 15000) {
        told = Date.now();
        say(`waiting for --start ${opts.start}: ${((t - t0) / 1000).toFixed(0)} s · ${elapsed()}`);
      }
    }
  }
}
await pullLog();
// R: page time of the first traced instant (the start event itself when there is one)
const startHit = startEvent ? allLog.filter(startEvent).pop() : null;
let R = startHit ? startHit.at ?? startHit.t : await pageNow();
sampling = true;
const tiles = [];
// --frames a-b,c-d: every frame of those windows (s after the start event) as PNG, for filmstrips
const frameWindows = String(opts.frames || '').split(',').map((w) => w.split('-').map(Number)).filter((w) => w.length === 2 && w.every(Number.isFinite));
let nextTile = R;
let stopAt = untilMatch ? Infinity : R + opts.seconds * 1000;
let hits = 0;
let lastReport = Date.now();
for (let i = 0; ; i++) {
  const now = await pageNow();
  const tile = now >= nextTile;
  const rel0 = (now - R) / 1000;
  const film = frameWindows.some(([a, b]) => rel0 >= a - 1e-3 && rel0 <= b + 1e-3);
  const st = await step(stepMs, tile || film);
  if (tile && st.png) {
    tiles.push({ t: (st.t - R) / 1000, png: st.png });
    nextTile += opts['sheet-every'] * 1000;
  }
  if (film && st.png) {
    fs.mkdirSync(`${OUT}-frames`, { recursive: true });
    fs.writeFileSync(`${OUT}-frames/f${((st.t - R) / 1000).toFixed(3).padStart(9, '0')}.png`, Buffer.from(st.png.split(',')[1], 'base64'));
  }
  if (i % 4 === 0) {
    const fresh = await pullLog();
    if (untilMatch && stopAt === Infinity) {
      const [, kind, plus] = untilMatch;
      for (const e of fresh) {
        const hit = (kind === 'next-open' && e.ev === 'shot' && e.shot === 'open' && (e.at ?? e.t) > R + 1000)
          || (kind === 'break-end' && e.ev === 'playBreak' && e.phase === 'end')
          || (kind === 'episode-end' && e.ev === 'playEpisode' && e.phase === 'end');
        if (!hit) continue;
        if (++hits >= opts.count) {
          stopAt = (e.at ?? e.t) + Number(plus || 0) * 1000;
          say(`stop: ${opts.until} #${hits} at ${(((e.at ?? e.t) - R) / 1000).toFixed(1)} s`);
          break;
        }
        say(`${kind} #${hits} of ${opts.count} at ${(((e.at ?? e.t) - R) / 1000).toFixed(1)} s`);
      }
    }
  }
  if (st.t >= stopAt || st.t - R > opts.seconds * 1000) break;
  if (Date.now() - lastReport > 15000) {
    lastReport = Date.now();
    say(`${((st.t - R) / 1000).toFixed(0)} s traced · ${elapsed()}`);
  }
}
await pullLog();
const seconds = ((await pageNow()) - R) / 1000;
say(`traced ${seconds.toFixed(1)} s of channel · ${elapsed()}`);

// --------------------------------------------------------------- timeline
const rel = (ms) => +((ms - R) / 1000).toFixed(4);
const events = allLog.filter((e) => e.ev !== 'speech').map((e) => {
  const o = { ...e, t: rel(e.t) };
  if (e.at != null) o.at = rel(e.at);
  if (e.ref != null) o.ref = rel(e.ref);
  return o;
});
const clipsPlayed = allLog.filter((e) => e.ev === 'clip').map((e) => ({ start: rel(e.at), end: rel(e.at) + e.duration, duration: e.duration }));
// Sentences of the recorded voices for the music cue rules: each caption to the next one (or its clip's end).
const subs = allLog.filter((e) => e.ev === 'subtitle').sort((a, b) => a.t - b.t);
const clipsAbs = allLog.filter((e) => e.ev === 'clip').map((e) => ({ start: e.at, end: e.at + e.duration * 1000 }));
const recordedSentences = [];
subs.forEach((e, i) => {
  if (!e.text) return;
  const clip = clipsAbs.find((c) => e.t >= c.start - 200 && e.t <= c.end);
  if (!clip) return;
  const end = Math.min(clip.end, i + 1 < subs.length ? subs[i + 1].t : clip.end);
  recordedSentences.push({ ev: 'speech', t: e.t, end: Math.max(end, e.t + 200), text: e.text, volume: 1, recorded: true });
});
const cues = deriveCues([...allLog, ...recordedSentences]);
const timeline = {
  meta: { url, out: OUT, tracer: 'tools/pace/trace.mjs', seconds, fps: opts.fps, start: opts.start, until: opts.until, count: opts.count, recordedAt: new Date().toISOString(), realSeconds: (Date.now() - t0Real) / 1000 },
  speech: allLog.filter((e) => e.ev === 'speech').map((e) => ({ start: rel(e.t), end: rel(e.end ?? e.t), text: e.text, slot: e.slot, presenter: e.presenter, volume: e.volume, estimated: true, firstWord: 0 })),
  recordedClips: clipsPlayed,
  music: cues.filter((c) => c.t >= R).map((c) => ({ t: rel(c.t), moment: c.moment, opts: c.opts, why: c.why })),
  events,
  ...(opts.camera ? { camera: cameraRows.map((r) => ({ ...r, t: rel(r.t), since: Number.isFinite(r.since) ? rel(r.since * 1000) : null, moveSince: Number.isFinite(r.moveSince) ? rel(r.moveSince * 1000) : null, stinger: Number.isFinite(r.stinger) ? rel(r.stinger * 1000) : null })) } : {}),
  reports: { pageErrors: pageErrors.slice(0, 50) },
};
fs.writeFileSync(`${OUT}-timeline.json`, JSON.stringify(timeline, null, 1));

// ----------------------------------------------------------- contact sheet
const shotAt = (t) => {
  let s = null;
  for (const e of events) if (e.ev === 'shot' && (e.at ?? e.t) <= t + 1e-3) s = e;
  return s;
};
const capAt = (t) => {
  let c = null;
  for (const e of events) if (e.ev === 'subtitle' && e.t <= t + 1e-3) c = e.text;
  return c;
};
const framingAt = (t) => {
  let c = null;
  for (const e of events) if (e.ev === 'pace' && e.k === 'cut' && e.t <= t + 1e-3) c = e;
  return c;
};
const sheetTiles = tiles.map((tile) => {
  const s = shotAt(tile.t);
  const f = framingAt(tile.t);
  const mm = `${Math.floor(tile.t / 60)}:${(tile.t % 60).toFixed(1).padStart(4, '0')}`;
  const since = s ? tile.t - (s.at ?? s.t) : 0;
  return { png: tile.png, label: `${mm} ${s?.shot ?? '?'}${f && s && Math.abs(f.t - (s.at ?? s.t)) < 0.3 && f.framing ? `/${f.framing}` : ''} +${since.toFixed(1)}s${s?.programId ? ` ${s.programId}` : ''}`, sub: capAt(tile.t) || '' };
});
if (sheetTiles.length) {
  const sheetPage = await context.newPage();
  const per = 48; // tiles per sheet (several sheets for long runs)
  for (let k = 0; k < sheetTiles.length; k += per) {
    const part = sheetTiles.slice(k, k + per);
    const u = await sheetPage.evaluate(composeSheetInPage, { tiles: part, cols: opts.cols, scale: 1, title: `${path.basename(OUT)} · ${part[0].label.split(' ')[0]}-${part[part.length - 1].label.split(' ')[0]} · every ${opts['sheet-every']} s` });
    const file = sheetTiles.length > per ? `${OUT}-sheet-${String(k / per + 1).padStart(2, '0')}.png` : `${OUT}-sheet.png`;
    fs.writeFileSync(file, Buffer.from(u.split(',')[1], 'base64'));
    say(`sheet ${file}`);
  }
  await sheetPage.close();
}
await browser.close();
say(`timeline ${OUT}-timeline.json (${events.length} events, ${clipsPlayed.length} recorded clips, ${cues.length} music cues) · ${elapsed()}`);
if (pageErrors.length) say(`${pageErrors.length} page errors, first: ${pageErrors.slice(0, 3).join(' | ')}`);
