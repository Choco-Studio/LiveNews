#!/usr/bin/env node
// The render-ahead pipeline of pre-rendered playout (docs/publishing/playout.md §2-3, §6, §8). It plays the viewer's
// part for the station (tools/playout/station.mjs), about an hour ahead: it asks the station for the next item at the
// time it will AIR (the station's air clock follows), renders it in headless Chromium on the recorder's fake clock set
// to that time (tools/recorder/page.mjs: deterministic, every frame, faster or slower than real time as the machine
// allows), encodes it to a finished file, checks it (server/playout/gate.js) and queues it for the playout
// (tools/playout/air.mjs). A break and the programme it promotes pass or are held together; a held unit is never
// aired and the next unit is rendered for its air time instead (the hole is filled by programming, and no clock on
// screen is wrong). It keeps a target buffer (60 minutes) and waits when the buffer is full.
//
//   node tools/playout/render.mjs --station http://127.0.0.1:8790 [--dir data/playout] [--buffer 60] [--size 1280x720]
//        [--bitrate 3000k] [--start-lead 900] [--no-twin] [--capture png|raw] [--for <s>]
//
// Every programme's twin picture is drawn from the same frames: the publishing desk's clip-mode master (384x216,
// lossless, the factory's own format) with its report and the episode, in <dir>/masters/<episode id>/ as the rendered-
// master hook reads it (server/publish/masters.js: horizontal.mkv, horizontal.report.json), so the clip factory and the
// whole-programme upload cut from it and nothing is rendered twice (--no-twin: the air file only).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pageInit } from '../recorder/page.mjs';
import { PlayoutStore, renderPlan, SpeedMeter, PLAYOUT_DEFAULTS, endOf } from '../../server/playout/queue.js';
import { airVideoArgs, scaleFilter, AIR_DEFAULTS, parseSize } from '../../server/playout/encode.js';
import { airGate, gateOptionsFromEnv } from '../../server/playout/gate.js';
import { diskPlan, diskPolicyFromEnv } from '../../server/playout/disk.js';
import { voicedAir } from '../../server/airtime.js';
import * as compliance from '../../server/publish/compliance.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const STATION = String(opt('station', process.env.PLAYOUT_STATION || 'http://127.0.0.1:8790')).replace(/\/$/, '');
const DIR = path.resolve(opt('dir', process.env.PLAYOUT_DIR || path.join(root, 'data', 'playout')));
const TARGET = Number(opt('buffer', process.env.PLAYOUT_BUFFER_MIN || 60)) * 60;
const SIZE = opt('size', process.env.PLAYOUT_SIZE || AIR_DEFAULTS.size);
const BITRATE = opt('bitrate', process.env.PLAYOUT_BITRATE || AIR_DEFAULTS.bitrate);
const PRESET = opt('preset', process.env.PLAYOUT_PRESET || AIR_DEFAULTS.preset);
const FPS = AIR_DEFAULTS.fps;
const RATE = AIR_DEFAULTS.audioRate;
const START_LEAD = Number(opt('start-lead', 900));
const TWIN = !flag('no-twin');
const CAPTURE = opt('capture', 'png') === 'raw' ? 'raw' : 'png';
const FOR = Number(opt('for', 0));
const SEED = Number(opt('seed', 1)) || 1;
const gateOpts = { ...gateOptionsFromEnv(), ...(opt('verbatim') ? { verbatim: opt('verbatim') === 'warn' ? 'warn' : 'block' } : {}) };
const diskPolicy = diskPolicyFromEnv();
parseSize(SIZE);
airVideoArgs({ size: SIZE, bitrate: BITRATE, fps: FPS, preset: PRESET }); // (throws on a bad size, bitrate or preset before anything starts)

const store = new PlayoutStore(DIR);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'playout-render-'));
const real = () => Date.now(); // (this process keeps the real clock: the station is the one on the air clock)
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 19);
const say = (m) => console.log(`[render ${hhmm(real())}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frameMs = 1000 / FPS;

// ---------------------------------------------------------------- the station (loopback HTTP, no timeout on a wait)

function request(method, url, { timeoutMs = 30 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: { host: new URL(url).host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: body ? JSON.parse(body) : null });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}
const setAirClock = (t) => request('POST', `${STATION}/api/playout/clock?t=${Math.round(t)}`, { timeoutMs: 5000 }).catch(() => null);

/**
 * Wait (real time) until the station has a finished programme, its air clock held at `airAt` meanwhile, so the unit's
 * air time is chosen once the station is ready (a slow production never makes a rendered unit late).
 */
async function waitReady(airAt) {
  const t0 = real();
  let said = 0;
  for (;;) {
    await setAirClock(typeof airAt === 'function' ? airAt() : airAt);
    try {
      const r = await request('GET', `${STATION}/api/status`, { timeoutMs: 10_000 });
      if (r.status === 200 && (r.json?.queue?.length || 0) > 0) return (real() - t0) / 1000;
      // (a playback server, tools/publish/playback-server.mjs, has no status: its items are ready by definition)
      if (r.status === 404) return 0;
      if (real() - said > 60_000) {
        said = real();
        say(`waiting for the station to finish a programme${r.json?.producing ? ` (making ${r.json.producing})` : ''}`);
      }
    } catch {
      /* the station is starting or busy */
    }
    status({ state: 'waiting for the station' });
    // (a test's length, --for, ends the wait too)
    if (stopping || (FOR > 0 && real() - started > FOR * 1000)) return (real() - t0) / 1000;
    await sleep(2000);
  }
}

// CPU seconds used by this process and everything under it (the browser, the encoders), from /proc: the measure of
// render cost that does not depend on what else the machine is doing
function treeCpu(root = process.pid) {
  const all = new Map();
  try {
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      try {
        const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
        const f = st.slice(st.lastIndexOf(')') + 2).split(' ');
        all.set(Number(d), { ppid: Number(f[1]), ticks: Number(f[11]) + Number(f[12]) + Number(f[13]) + Number(f[14]) });
      } catch {
        /* gone */
      }
    }
  } catch {
    return null;
  }
  const kids = new Map();
  for (const [pid, p] of all) (kids.get(p.ppid) || kids.set(p.ppid, []).get(p.ppid)).push(pid);
  let ticks = 0;
  const walk = (pid) => {
    ticks += all.get(pid)?.ticks || 0;
    for (const k of kids.get(pid) || []) walk(k);
  };
  walk(root);
  return ticks / 100;
}

/** The station's next item, for air time `airAt` (the station sets its air clock, then waits for a ready programme). */
async function nextItem(afterId, airAt) {
  for (let attempt = 0; ; attempt++) {
    try {
      const q = new URLSearchParams({ air: String(Math.round(airAt)) });
      if (afterId) q.set('after', afterId);
      const r = await request('GET', `${STATION}/api/next?${q}`);
      if (r.status === 200 && r.json?.kind) return r.json;
      say(`the station has nothing (${r.status}); asking again`);
    } catch (err) {
      say(`the station does not answer (${err.message}); asking again`);
    }
    await sleep(Math.min(60_000, 2000 * (attempt + 1)));
  }
}

// ---------------------------------------------------------------- the page

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}

// In the page, after the recorder's init: the frame grab (the air picture and its twin side by side, one image), a
// count of the director's requests for the next item (the second one marks the end of this item), the held frame
function grabInit(cfg) {
  if (cfg.hold) window.__playoutHold = cfg.hold;
  window.__nextAsked = 0;
  const of = window.fetch;
  window.fetch = function (u, ...a) {
    try {
      if (/\/api\/next(\?|$)/.test(String(u?.url || u))) window.__nextAsked++;
    } catch {
      /* counting only */
    }
    return of.call(this, u, ...a);
  };
  const b64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  window.__playoutGrab = (mode) => {
    const c = document.getElementById('screen');
    if (!c) return null;
    const tw = window.__twin || null;
    const W = c.width;
    const H = c.height;
    const w2 = tw ? W * 2 : W;
    let g = window.__grabCv;
    if (!g || g.width !== w2 || g.height !== H) {
      g = window.__grabCv = document.createElement('canvas');
      g.width = w2;
      g.height = H;
      g.__ctx = g.getContext('2d', { willReadFrequently: mode === 'raw' });
    }
    g.__ctx.drawImage(c, 0, 0);
    if (tw) g.__ctx.drawImage(tw, W, 0);
    const img = mode === 'raw' ? b64(g.__ctx.getImageData(0, 0, w2, H).data) : g.toDataURL('image/png').slice(22);
    window.__rec?.pump?.();
    return { img, w: w2, h: H, perf: performance.now(), inflight: window.__rec?.inflight ?? 0, asked: window.__nextAsked };
  };
  // the sound as interleaved 16-bit PCM, a chunk at a time (after window.__rec.render)
  window.__playoutPcm = (from, count) => {
    const [L, R] = window.__rec.audioOut;
    const out = new Int16Array(count * 2);
    for (let i = 0; i < count; i++) {
      const l = Math.max(-1, Math.min(1, L[from + i] || 0));
      const r = Math.max(-1, Math.min(1, R[from + i] || 0));
      out[2 * i] = l < 0 ? l * 32768 : l * 32767;
      out[2 * i + 1] = r < 0 ? r * 32768 : r * 32767;
    }
    return b64(new Uint8Array(out.buffer));
  };
}

const MAIN_HOOK = "\ntry { window.__recHook?.({ audio: typeof audio !== 'undefined' ? audio : null, director: typeof player !== 'undefined' ? player : null, renderer: typeof renderer !== 'undefined' ? renderer : null }); } catch (e) { /* recorder hook */ }\n";

let browser = null;
async function ensureBrowser() {
  if (browser?.isConnected()) return;
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
}
// One browser for the day, a fresh context for every item: Playwright's clock adds an init script to its context at
// every call (page.clock.runFor logs itself that way), so a context kept for a day would replay hundreds of thousands
// of them into every new page. The frames are stepped in the page instead (one round trip a frame, nothing added).
const newContext = () => browser.newContext({ viewport: { width: 400, height: 240 } });

function writeAsync(stream, buf) {
  return new Promise((resolve, reject) => {
    if (stream.write(buf)) return resolve();
    const done = (err) => {
      stream.off('drain', ok);
      stream.off('error', done);
      if (err) reject(err);
      else resolve();
    };
    const ok = () => done();
    stream.once('drain', ok);
    stream.once('error', done);
  });
}

function runFfmpeg(argv, { input = null } = {}) {
  const p = spawn('ffmpeg', argv, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
  const done = new Promise((resolve, reject) => p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.trim().slice(-600)}`)))));
  return { p, done };
}

/** Expected air of an item in seconds (the director's own timeline in closed form; a break from its parts). */
function estimateSeconds(item) {
  if (item.kind === 'break') return 20 + 30 * (Number(item.ads) || 2) + (Number(item.hold) || 0) + 12;
  try {
    return voicedAir(item) || 600;
  } catch {
    return 600;
  }
}

/**
 * Render one item at air time `airAt` (its first frame), the page's opening stinger over `hold` (a PNG data URL: the
 * last frame of what airs before it). -> { frames, seconds, file, master, report, lastFrame, realSeconds, overrun }
 */
async function renderItem(item, airAt, hold, slot) {
  await ensureBrowser();
  const est = estimateSeconds(item);
  const maxSeconds = Math.ceil(est * 1.35 + 45);
  const context = await newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('crash', () => errors.push('page crashed'));
  // the fake clock stepped in the page (Playwright's own controller, installed by page.clock.install below)
  const runFor = (ms) => page.evaluate((m) => globalThis.__pwClock.controller.runFor(m), ms);
  const t0 = real();
  const cpu0 = treeCpu();
  let ff = null;
  try {
    await page.addInitScript(pageInit, { audio: true, sampleRate: RATE, maxSeconds: maxSeconds + 4, seed: SEED, progressive: true, chunk: 2, margin: 1, trace: false });
    await page.addInitScript(grabInit, { hold: hold || null });
    await page.route(/\/js\/main\.js(\?.*)?$/, async (route) => {
      const res = await route.fetch();
      const body = `${await res.text()}${MAIN_HOOK}`;
      await route.fulfill({ response: res, body, headers: { ...res.headers(), 'cache-control': 'no-store', 'content-length': String(Buffer.byteLength(body)) } });
    });
    let startRoute = null;
    await page.route(/\/api\/next(\?.*)?$/, async (route) => {
      if (!startRoute) {
        startRoute = route;
        return;
      }
      // the director asks for the item after this one: never answered (the page closes at the end of this item)
    });
    const T0 = Math.round(airAt - 20_000);
    await page.clock.install({ time: T0 });
    await page.clock.pauseAt(T0 + 1000);
    await page.goto(`${STATION}/?autostart=1&voice=tts${TWIN ? '&twin=1' : ''}`, { waitUntil: 'load' });
    // the page starts (its channel, its audio, the director) on the fake clock, until it asks for its item
    let stuck = 0;
    const settle = async (allowed = 0, cap = 8000) => {
      const t = real();
      for (;;) {
        const n = await page.evaluate(() => window.__rec?.inflight ?? 0);
        if (n < allowed + stuck) stuck = Math.max(0, n - allowed);
        if (n <= allowed + stuck) return;
        if (real() - t > cap) {
          stuck = n - allowed;
          return;
        }
        await sleep(4);
      }
    };
    for (let k = 0; !startRoute; k++) {
      if (k > 600) throw new Error('the page never asked for its item');
      await settle();
      await runFor(50);
    }
    // the item airs from airAt: the page's wall clock says so as it arrives (its monotonic clock runs on)
    await page.clock.setSystemTime(airAt - frameMs);
    await startRoute.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) });
    await settle();

    const [w, h] = [384, 216];
    const out = path.join(TMP, `${slot}`);
    fs.mkdirSync(out, { recursive: true });
    const airVideo = path.join(out, 'air.video.mkv');
    const masterVideo = path.join(out, 'master.video.mkv');
    const inW = TWIN ? w * 2 : w;
    const input = CAPTURE === 'raw' ? ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${inW}x${h}`, '-framerate', String(FPS), '-i', 'pipe:0'] : ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', 'pipe:0'];
    const graph = TWIN ? `[0:v]split=2[a][b];[a]crop=${w}:${h}:0:0,${scaleFilter({ size: SIZE })}[air];[b]crop=${w}:${h}:${w}:0,format=rgb24[m]` : `[0:v]${scaleFilter({ size: SIZE })}[air]`;
    ff = runFfmpeg(['-v', 'error', '-y', ...input, '-filter_complex', graph, '-map', '[air]', ...airVideoArgs({ size: SIZE, bitrate: BITRATE, fps: FPS, preset: PRESET }), '-an', airVideo, ...(TWIN ? ['-map', '[m]', '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'veryfast', '-pix_fmt', 'rgb24', '-an', masterVideo] : [])], { input: true });

    let stepped = 0;
    let frames = 0;
    let perf0 = null;
    let overrun = false;
    const maxFrames = Math.ceil(maxSeconds * FPS);
    for (;;) {
      const want = Math.round((frames + 1) * frameMs);
      // one round trip a frame: the clock stepped to the frame's time, then the frame grabbed
      const g = await page.evaluate(async ([ms, mode]) => {
        await globalThis.__pwClock.controller.runFor(ms);
        return window.__playoutGrab(mode);
      }, [want - stepped, CAPTURE]);
      stepped = want;
      if (!g) throw new Error('no canvas');
      if (perf0 === null) perf0 = g.perf;
      await writeAsync(ff.p.stdin, Buffer.from(g.img, 'base64'));
      frames++;
      if (frames % (FPS * 2) === 0) setAirClock(airAt + frames * frameMs);
      if (g.asked >= 2) break; // the director asked for the next item during this frame: the item is over
      if (frames >= maxFrames) {
        overrun = true;
        break;
      }
      if (g.inflight > stuck) await settle();
    }
    ff.p.stdin.end();
    const lastFrame = await page.evaluate(() => document.getElementById('screen').toDataURL('image/png'));

    // the sound: exactly the frames' length (frames x 1600 samples), rendered by the page, as 16-bit PCM
    const from = perf0;
    const to = from + frames * frameMs;
    const info = await page.evaluate(([a, b]) => window.__rec.render(a, b), [from, to]);
    const n = info.n;
    const pcm = path.join(out, 'audio.pcm');
    const fd = fs.openSync(pcm, 'w');
    const CH = 1 << 18;
    for (let off = 0; off < n; off += CH) {
      const count = Math.min(CH, n - off);
      fs.writeSync(fd, Buffer.from(await page.evaluate(([o, c]) => window.__playoutPcm(o, c), [off, count]), 'base64'));
    }
    fs.closeSync(fd);
    const events = (await page.evaluate(() => (window.__rec?.events || []).filter((e) => e.type !== 'audioContext'))).map(({ t, ...e }) => {
      const x = { ...e, v: (t - from) / 1000 };
      if (e.type === 'clip') x.va = (e.at - from) / 1000;
      if (e.type === 'sfx') x.va = (e.startAt - from) / 1000;
      return x;
    });
    await ff.done;
    ff = null;
    if (n !== Math.round((frames * RATE) / FPS)) throw new Error(`sound ${n} samples for ${frames} frames`);
    // the air file (H.264 + FLAC) and the master (lossless RGB + FLAC), each muxed once, nothing re-encoded
    const file = path.join(DIR, 'segments', `${slot}.mkv`);
    await runFfmpeg(['-v', 'error', '-y', '-i', airVideo, '-f', 's16le', '-ar', String(RATE), '-ac', '2', '-i', pcm, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'flac', file]).done;
    let master = null;
    if (TWIN && item.kind === 'episode') {
      master = path.join(out, 'master.mkv');
      await runFfmpeg(['-v', 'error', '-y', '-i', masterVideo, '-f', 's16le', '-ar', String(RATE), '-ac', '2', '-i', pcm, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'flac', master]).done;
    }
    const sentences = events.filter((e) => e.type === 'sentence');
    const report = {
      out: file,
      seconds: frames / FPS,
      fps: FPS,
      frames,
      airAt: new Date(airAt).toISOString(),
      item: { id: item.id, kind: item.kind, programme: item.program?.id || null },
      audio: { n, sampleRate: RATE, contexts: info.contexts },
      speech: { recorded: sentences.filter((e) => e.recorded).length, browser: sentences.filter((e) => !e.recorded).length },
      events,
      errors: errors.slice(0, 20),
    };
    const cpu1 = treeCpu();
    return { frames, seconds: frames / FPS, file, master, masterDir: out, report, lastFrame, realSeconds: (real() - t0) / 1000, cpuSeconds: cpu0 !== null && cpu1 !== null ? cpu1 - cpu0 : null, overrun, estimate: est, errors };
  } finally {
    if (ff) {
      try {
        ff.p.stdin.end();
        ff.p.kill('SIGKILL');
      } catch {
        /* gone */
      }
    }
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

// ---------------------------------------------------------------- the filler card (the playout loops it)

async function fillerCard() {
  const file = path.join(DIR, 'filler.png');
  if (fs.existsSync(file)) return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  await ensureBrowser();
  const context = await newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${STATION}/lab/clip.html`, { waitUntil: 'load' }).catch(() => page.goto(`${STATION}/`, { waitUntil: 'load' }));
    const url = await page.evaluate(async () => {
      const m = await import('/js/scenes/cards.js');
      const c = Object.assign(document.createElement('canvas'), { width: 384, height: 216 });
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      for (let i = 0; i < 3; i++) {
        m.drawStandby(g, 0, { channel: 'GLOBIT 24', title: 'BACK SHORTLY', message: 'GLOBIT 24 · NEWS 24 HOURS A DAY', clock: false });
        await new Promise((r) => setTimeout(r, 200));
      }
      return c.toDataURL('image/png');
    });
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    return url;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

// ---------------------------------------------------------------- the loop

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const speed = new SpeedMeter({ initial: 1 });
let typicalUnit = 420; // s on air of a unit (a break and its programme), a running mean: the next unit's expected size

/** Where the queue ends: the last queued segment's end (a restart carries on from it), else null. */
function frontierFromStore() {
  const q = store.queued();
  if (!q.length) return null;
  const last = q.reduce((a, b) => (endOf(b) > endOf(a) ? b : a));
  return endOf(last) > real() ? endOf(last) : null;
}

let frontier = frontierFromStore();
let lastItemId = null;
let lastFrame = null; // the last frame of the unit that airs before the next one (null: filler airs before it)
let units = 0;
let heldUnits = 0;
let lateUnits = 0;
const started = real();
let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

function status(extra = {}) {
  const ahead = frontier ? (frontier - real()) / 1000 : 0;
  store.status('render', { pid: process.pid, frontier: frontier ? new Date(frontier).toISOString() : null, bufferMinutes: +(ahead / 60).toFixed(1), targetMinutes: TARGET / 60, speed: +speed.speed.toFixed(3), units, held: heldUnits, late: lateUnits, size: SIZE, bitrate: BITRATE, twin: TWIN, gate: gateOpts, ...extra });
}

function cleanDisk() {
  const masters = [];
  try {
    for (const d of fs.readdirSync(path.join(DIR, 'masters'))) {
      const dir = path.join(DIR, 'masters', d);
      let meta = null;
      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, 'unit.json'), 'utf8'));
      } catch {
        continue;
      }
      const cut = fs.existsSync(path.join(dir, 'factory.json'));
      let cutAt = null;
      if (cut) cutAt = fs.statSync(path.join(dir, 'factory.json')).mtimeMs;
      masters.push({ dir, airEnd: Date.parse(meta.airEnd), cut, cutAt });
    }
  } catch {
    /* no masters */
  }
  const plan = diskPlan({ aired: store.airedList(), held: store.held(), masters, now: real(), policy: diskPolicy });
  for (const d of plan) {
    if (!fs.existsSync(d.path)) continue;
    fs.rmSync(d.path, { recursive: true, force: true });
    store.event('delete', { path: path.relative(DIR, d.path), kind: d.kind, reason: d.reason });
  }
}

async function renderUnit(airAt) {
  const unit = { id: `u${stamp(airAt)}`, airAt, segments: [], items: [] };
  let t = airAt;
  let hold = lastFrame || (await fillerCard());
  let afterId = lastItemId;
  for (let k = 0; k < 3; k++) {
    const item = await nextItem(afterId, t);
    afterId = item.id;
    const slot = `${stamp(t)}-${item.kind === 'break' ? 'break' : item.program?.id || 'episode'}-${item.id}`;
    say(`rendering ${item.kind === 'break' ? `break (${item.ads} ads${item.hold ? `, ${item.hold} s countdown` : ''}${item.next ? `, then ${item.next.title}` : ''})` : `${item.program?.title} ${item.id}${item.replay ? ' (replay)' : ''}`} for ${new Date(t).toISOString()}`);
    const r = await renderItem(item, t, hold, slot);
    const seg = { id: slot, kind: item.kind, unit: unit.id, itemId: item.id, programId: item.program?.id || null, title: item.kind === 'break' ? 'Break' : item.program?.title || item.id, airAt: Math.round(t), frames: r.frames, fps: FPS, file: r.file, size: SIZE, bitrate: BITRATE, preset: PRESET, render: { realSeconds: +r.realSeconds.toFixed(1), speed: +(r.seconds / r.realSeconds).toFixed(3), cpuSeconds: r.cpuSeconds === null ? null : +r.cpuSeconds.toFixed(1), cpuPerAirSecond: r.cpuSeconds === null ? null : +(r.cpuSeconds / r.seconds).toFixed(3), estimate: Math.round(r.estimate), overrun: r.overrun, pageErrors: r.errors.length } };
    say(`  ${seg.title}: ${r.seconds.toFixed(1)} s on air in ${r.realSeconds.toFixed(1)} s (${seg.render.speed}x, ${seg.render.cpuPerAirSecond ?? '?'} CPU-s per air second)${r.overrun ? ' OVERRUN' : ''}`);
    store.event('rendered', { id: slot, kind: item.kind, programme: seg.title, airAt: new Date(t).toISOString(), seconds: +r.seconds.toFixed(2), realSeconds: seg.render.realSeconds, speed: seg.render.speed, cpuSeconds: seg.render.cpuSeconds, cpuPerAirSecond: seg.render.cpuPerAirSecond, load1: +os.loadavg()[0].toFixed(2) });
    speed.add(r.seconds, r.realSeconds);
    unit.segments.push(seg);
    unit.items.push({ item, r });
    t += r.frames * frameMs;
    hold = r.lastFrame;
    if (item.kind === 'episode' || item.filler) break;
  }
  unit.lastItemId = afterId;
  unit.end = t;
  unit.lastFrame = hold;
  return unit;
}

function gateUnit(unit) {
  const getStory = compliance.archiveGetStory({ dataDir: path.join(root, 'data') });
  const register = compliance.register(path.join(root, 'data'));
  const verdicts = [];
  for (const { item, r } of unit.items) {
    if (item.kind !== 'episode') continue;
    const v = airGate(item, { ...gateOpts, recording: r.report, getStory, register, dataDir: path.join(root, 'data'), now: Date.parse(r.report.airAt) });
    if (r.overrun) {
      v.ok = false;
      v.violations.push({ rule: 'render-overrun', message: `the programme ran past ${Math.round(r.seconds)} s without ending (estimate ${Math.round(r.estimate)} s)` });
    }
    verdicts.push({ id: item.id, programme: item.program?.title, ...v });
  }
  return { ok: verdicts.every((v) => v.ok), verdicts };
}

function queueUnit(unit, gate) {
  for (const [i, seg] of unit.segments.entries()) {
    const { item, r } = unit.items[i];
    seg.gate = gate.verdicts.find((v) => v.id === item.id) ? { ok: true, warnings: gate.verdicts.find((v) => v.id === item.id).warnings.slice(0, 10), skipped: gate.verdicts.find((v) => v.id === item.id).skipped.map((x) => x.rule) } : null;
    if (item.kind === 'episode' && r.master && /^[a-z0-9_-]{1,80}$/i.test(String(item.id))) {
      // the publishing desk's master, as the rendered-master hook reads it (server/publish/masters.js): masters/<episode
      // id>/horizontal.mkv and its report, the episode as aired. An episode aired again whose clips were cut already
      // (factory.json there) keeps its first master: nothing is cut twice.
      const dir = path.join(DIR, 'masters', String(item.id));
      if (!fs.existsSync(path.join(dir, 'factory.json'))) {
        fs.mkdirSync(dir, { recursive: true });
        fs.renameSync(r.master, path.join(dir, 'horizontal.mkv'));
        fs.writeFileSync(path.join(dir, 'horizontal.report.json'), JSON.stringify(r.report, null, 1));
        fs.writeFileSync(path.join(dir, 'episode.json'), JSON.stringify({ ...item, airedAt: new Date(seg.airAt).toISOString() }, null, 1));
        fs.writeFileSync(path.join(dir, 'unit.json'), JSON.stringify({ unit: unit.id, segment: seg.id, airAt: new Date(seg.airAt).toISOString(), airEnd: new Date(endOf(seg)).toISOString() }, null, 1));
      }
      seg.master = dir;
    }
    store.enqueue(seg);
  }
  store.event('queued', { unit: unit.id, airAt: new Date(unit.airAt).toISOString(), end: new Date(unit.end).toISOString(), segments: unit.segments.map((s) => s.title) });
}

function holdUnit(unit, gate) {
  const files = unit.segments.map((s) => s.file); // (the air files stay a while for a look; the masters go)
  const violations = gate.verdicts.flatMap((v) => v.violations.map((x) => ({ ...x, programme: v.programme })));
  store.hold({ id: unit.id, stage: 'air', airAt: unit.airAt, programId: unit.segments.at(-1)?.programId, title: unit.segments.at(-1)?.title, segments: unit.segments.map((s) => ({ id: s.id, kind: s.kind, title: s.title, frames: s.frames })), violations, warnings: gate.verdicts.flatMap((v) => v.warnings || []).slice(0, 20), skipped: gate.verdicts.flatMap((v) => (v.skipped || []).map((x) => x.rule)), files });
  store.event('held', { stage: 'air', unit: unit.id, airAt: new Date(unit.airAt).toISOString(), programme: unit.segments.at(-1)?.title, rules: violations.map((v) => v.rule) });
  say(`  HELD ${unit.segments.at(-1)?.title}: ${violations.map((v) => `${v.rule}: ${v.message}`).join(' | ').slice(0, 400)}`);
}

say(`station ${STATION} · ${DIR} · buffer ${TARGET / 60} min · ${SIZE} ${BITRATE} · twin ${TWIN ? 'on' : 'off'} · capture ${CAPTURE} · gate verbatim ${gateOpts.verbatim}, review ${gateOpts.requireReview ? 'required' : 'not required'}`);
while (!stopping) {
  if (FOR > 0 && real() - started > FOR * 1000) break;
  cleanDisk();
  // (a cold start, or after a late unit: the first unit renders far enough ahead to be ready, filler airs meanwhile)
  const restart = units ? speed.expect(typicalUnit) + PLAYOUT_DEFAULTS.minLeadSeconds : START_LEAD;
  // the buffer full: wait before asking anything of the station
  const ahead0 = frontier ? (frontier - real()) / 1000 : 0;
  if (ahead0 >= TARGET) {
    status({ state: 'waiting (buffer full)' });
    await sleep(Math.min(30, ahead0 - TARGET + 1) * 1000);
    continue;
  }
  // a programme ready at the station first (its clock held where the next unit would air), then the plan
  const waited = await waitReady(() => frontier ?? real() + restart * 1000);
  if (waited > 5) store.event('waited', { seconds: +waited.toFixed(1), why: 'the station was still making the next programme' });
  if (stopping || (FOR > 0 && real() - started > FOR * 1000)) break;
  // (the unit's size from the programme the station has ready, when it says: a break and that programme)
  let unitSeconds = typicalUnit;
  try {
    const q = await request('GET', `${STATION}/api/queue`, { timeoutMs: 5000 });
    const ep = Array.isArray(q.json) ? q.json.find((x) => x?.kind === 'episode') : null;
    if (ep) unitSeconds = 90 + estimateSeconds(ep);
  } catch {
    /* the running mean */
  }
  const plan = renderPlan({ frontier: frontier ?? real() + restart * 1000, now: real(), target: TARGET, expect: frontier ? speed.expect(unitSeconds) : 0, minLead: PLAYOUT_DEFAULTS.minLeadSeconds });
  status({ state: plan.action === 'wait' ? 'waiting (buffer full)' : 'rendering' });
  if (plan.action === 'wait') {
    await sleep(Math.min(30, plan.waitSeconds) * 1000);
    continue;
  }
  if (frontier && plan.gap > 0) {
    store.event('gap', { from: new Date(frontier).toISOString(), to: new Date(plan.airAt).toISOString(), seconds: plan.gap, why: 'the buffer ran short: the next unit renders for a later time, the playout fills the gap' });
    say(`the frontier fell behind: ${plan.gap.toFixed(0)} s of filler before the next unit`);
    lastFrame = null;
  }
  let unit;
  try {
    unit = await renderUnit(plan.airAt);
  } catch (err) {
    say(`render failed: ${err.stack || err.message}`);
    store.event('render-error', { error: String(err.message).slice(0, 400) });
    await browser?.close().catch(() => {});
    browser = null;
    lastFrame = null;
    await sleep(5000);
    continue;
  }
  lastItemId = unit.lastItemId;
  // late: it would start before the playout could reach it (its clock would lie): never queued; the next unit
  // renders for a later time
  // (30 s: the playout writes a few seconds ahead of the clock, and its encoder's queue holds a few more)
  if (unit.airAt < real() + 30_000) {
    lateUnits++;
    store.event('late', { unit: unit.id, airAt: new Date(unit.airAt).toISOString(), by: (real() - unit.airAt) / 1000 });
    say(`  LATE by ${((real() - unit.airAt) / 1000).toFixed(0)} s: not queued`);
    for (const s of unit.segments) fs.rmSync(s.file, { force: true });
    for (const { r } of unit.items) fs.rmSync(r.masterDir, { recursive: true, force: true });
    frontier = null;
    lastFrame = null;
    continue;
  }
  const gate = gateUnit(unit);
  if (gate.ok) {
    queueUnit(unit, gate);
    units++;
    typicalUnit = 0.7 * typicalUnit + 0.3 * ((unit.end - unit.airAt) / 1000);
    frontier = unit.end;
    lastFrame = unit.lastFrame;
  } else {
    heldUnits++;
    holdUnit(unit, gate);
    // the hole is filled by the next unit, rendered for the same air time (frontier and held frame unchanged)
    frontier = unit.airAt;
  }
  for (const { r } of unit.items) fs.rmSync(r.masterDir, { recursive: true, force: true });
  status({ state: 'rendered', lastUnit: unit.id });
}
status({ state: 'stopped' });
await browser?.close().catch(() => {});
fs.rmSync(TMP, { recursive: true, force: true });
say(`stopped: ${units} units queued, ${heldUnits} held, ${lateUnits} late`);
process.exit(0);
