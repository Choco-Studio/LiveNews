#!/usr/bin/env node
// Showcase recorder WITH SOUND: records the real GLOBIT 24 channel page
// deterministically - picture, neural voices, every WebAudio jingle/sting/ad
// bed exactly as the channel schedules it, and music beds - into an MP4
// (1920x1080 H.264 + AAC at -16 LUFS, true peak <= -1.5 dBTP), plus
// timeline.json, a contact sheet and A/V sync measurements.
//
//   PORT=8602 timeout 1800 npm run demo:offline &
//   node tools/showcase/record-show.mjs --port 8602 --start open --seconds 90 --out /tmp/show.mp4
//   node tools/showcase/record-show.mjs --port 8602 --start open --until next-open+20 --out /tmp/long.mp4
//
// How (see README.md next to this file):
//  - Playwright's fake clock is installed PAUSED: page time only moves when we
//    call clock.runFor(1/fps). Before each step we wait for fetches/images in
//    flight (network looks instant) and for any pending voice synthesis.
//  - page-init.js swaps AudioContext for an OfflineAudioContext on the fake
//    clock (rendered after the last frame), installs a fake speechSynthesis
//    whose speak() asks us for Kokoro audio + word times, and logs the
//    director's timeline.
//  - lib/music.mjs turns the timeline into bed cues and renders them offline
//    with a music proposal; mix.py mixes voices + WebAudio + beds and levels.
//
// Options:
//   --url URL | --port N      channel page (default http://127.0.0.1:<port>/?autostart=1&voice=tts)
//   --voices auto|harness     auto (default): the server's recorded voices when the episode has them (played
//                             by the channel through WebAudio and captured with it), Kokoro here for anything
//                             spoken through speechSynthesis; harness: adds voices=browser, so every line is
//                             spoken through the fake speechSynthesis and synthesised here with the channel's casting
//   --v2                      adds v2=1 (the v2 presenters/studio: the channel's default anyway)
//   --v1                      adds v2=0 (the old renderer)
//   --out file.mp4            output (work files go to <out>.work/, kept with --keep)
//   --seconds N               recording length (with --until: the maximum)
//   --start now|open|break|endcard   begin at the next programme open / break / end card (default now)
//   --skip N                  run N s of channel time (no recording) before looking for --start
//   --until next-open+S|break-end+S|episode-end+S|endcard+S   stop S s after that event (else after --seconds);
//                             the cut never lands inside speech: it waits for the segment on air to end and
//                             stops 1.5 s after its last word, or just before the next shot, whichever is first
//                             (no new shot in the last 2 s), then fades picture and sound out over --fade s
//   --fade S                  fade-out at the end (default 1.5 with --until, else 0)
//   --count N                 stop at the Nth occurrence of the --until event (default 1): with --start open,
//                             --until next-open+20 --count 2 records two programmes, their breaks and the third open
//   --max-wait N              seconds of channel time allowed to reach --start (default 240)
//   --fps 30 --scale 5        video
//   --music lofi|broadcast|none   bed engine (default lofi)
//   --stories soft|off|drone  lofi's bedUnderStories switch: soft (default, the owner's soft bed under light and
//                             neutral story copy), off (the bibles' dry story copy), drone
//   --bed-under-voice N|off   bed rider (default 18, the WORLD NOW bible): the bed's loudness sits N LU under the
//                             voice while someone speaks (each speech region kept within N-2..N+2) and rises to
//                             --bed-gap LU under the voice in every real pause of 0.6 s or more (word timings from
//                             the voice stems); off = the composer's level with a fixed >= 16 dB extra duck
//   --bed-gap N               where the bed sits in pauses, LU under the voice (default 11)
//   --room-tone DB|off        studio air under every studio segment, open to end card (default -58 dBFS RMS),
//                             so no pause is digital silence
//   --bed-db N                extra bed trim in dB (default 0); --duck-db N minimum extra bed duck under speech (default 0;
//                             deeper where the engine's own duck is shallow, so the total is >= 16 dB)
//   --lufs -16 --tp -1.5      loudness targets
//   --cache DIR               voice clip cache (default ~/.cache/globit-showcase/voices)
//   --time ISO                wall-clock time the channel shows at start (default now)
//   --sheet-every S           contact-sheet sampling (default: 20 tiles over the recording)
//   --voice-engine auto|fallback   use the voice stream's engine when it loads (auto) or the built-in one
//   --voice-workers N         Kokoro processes (default 2; idle ones prefetch the sentences already on air)
//   --preset veryfast         x264 preset of the final 5x encode (veryfast: 2x faster than fast, same size here)
//   --measure-duck [off]      also render the beds without speech to measure the duck (default for <= 900 s; off skips it)
//   --raf frame|throttle|native   how the page renders: frame (default) = the recorder runs the page's
//                             requestAnimationFrame callbacks at each video frame's exact page time, right before
//                             grabbing it; throttle = first fake 16 ms tick of each frame slot (the picture can lag
//                             the sound by up to a frame); native = every fake 16 ms tick (--no-raf-throttle)
//   --keep                    keep the raw float renders and the lossless native-size video in <out>.work/

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { VoicePool, voiceFor, workerRequest, loadPresets, FAKE_VOICES } from './lib/voices.mjs';
import { deriveCues, speechRegions, quietIntervals, renderBedsInPage, bedChunkInPage, bedPace } from './lib/music.mjs';
import { syncReport, loadMono, levels } from './lib/analysis.mjs';
import { composeSheetInPage, composeAudioSheetInPage } from './lib/sheet.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}

// ------------------------------------------------------------------ options
const opts = {
  seconds: 90, skip: 0, fps: 30, scale: 5, start: 'now', until: null, count: 1, 'max-wait': 240, music: 'lofi', stories: 'soft',
  'bed-db': 0, 'duck-db': 0, lufs: -16, tp: -1.5, sr: 48000, port: 8602, 'voice-engine': 'auto', 'voice-workers': 2,
  'bed-under-voice': 18, 'bed-gap': 11, 'room-tone': -58,
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const key = argv[i].slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) opts[key] = true;
  else {
    opts[key] = next;
    i++;
  }
}
for (const k of ['seconds', 'skip', 'fps', 'scale', 'max-wait', 'bed-db', 'duck-db', 'lufs', 'tp', 'sr', 'port', 'voice-workers', 'count']) opts[k] = Number(opts[k]);
opts.count = Math.max(1, Math.round(opts.count) || 1);
if (!opts.out) {
  console.error('usage: node tools/showcase/record-show.mjs --out show.mp4 [--port 8602 | --url URL] [--seconds 90] [--start now|open|break|endcard] [--until next-open+20] [--music lofi|broadcast|none]');
  process.exit(1);
}
const url = (() => {
  const u = new URL(opts.url || `http://127.0.0.1:${opts.port}/?autostart=1&voice=tts`);
  if (opts.voices === 'harness') u.searchParams.set('voices', 'browser');
  if (opts.v2) u.searchParams.set('v2', '1');
  if (opts.v1) u.searchParams.set('v2', '0');
  return u.toString();
})();
if (opts.voices && !['auto', 'harness'].includes(opts.voices)) {
  console.error(`bad --voices ${opts.voices} (auto | harness)`);
  process.exit(1);
}
const origin = new URL(url).origin;
const OUT = path.resolve(opts.out);
const WORK = `${OUT.replace(/\.mp4$/i, '')}.work`;
fs.mkdirSync(WORK, { recursive: true });
const CACHE = path.resolve(opts.cache || path.join(os.homedir(), '.cache', 'globit-showcase', 'voices'));
const FPS = opts.fps;
const SR = opts.sr;
const untilMatch = typeof opts.until === 'string' ? /^(next-open|break-end|episode-end|endcard)(?:\+(\d+(?:\.\d+)?))?$/.exec(opts.until) : null;
if (opts.until && !untilMatch) {
  console.error(`bad --until ${opts.until} (next-open+S | break-end+S | episode-end+S | endcard+S)`);
  process.exit(1);
}
const FADE = opts.fade != null && opts.fade !== true ? Math.max(0, Number(opts.fade) || 0) : (untilMatch ? 1.5 : 0);
const RIDER = opts['bed-under-voice'] === 'off' || opts['bed-under-voice'] === true ? null : Number(opts['bed-under-voice']);
const ROOM_TONE = opts['room-tone'] === 'off' || opts['room-tone'] === true ? null : Number(opts['room-tone']);
const maxSeconds = opts['max-wait'] + opts.skip + opts.seconds + 30;
const say = (...a) => console.log('[showcase]', ...a);
const t0Real = Date.now();
const elapsed = () => `${((Date.now() - t0Real) / 1000).toFixed(0)}s`;

// ---------------------------------------------------------------- the page
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const context = await browser.newContext({ viewport: { width: 1152, height: 648 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
});

// Expose the channel's objects (audio engine, director, scene) to the
// instrumentation without editing main.js: the served copy gets one line
// appended (typeof guards: a renamed variable just leaves a field null).
const INSTRUMENT = `
;try {
  window.__showcase = {
    audio: typeof audio !== 'undefined' ? audio : null,
    player: typeof player !== 'undefined' ? player : null,
    renderer: typeof renderer !== 'undefined' ? renderer : null,
    scene: typeof scene !== 'undefined' ? scene : (typeof player !== 'undefined' ? player.scene : null),
  };
  window.__sc?.instrument?.();
} catch (err) { console.warn('[showcase] instrumentation failed', err); }
`;
await page.route(/\/js\/main\.js(\?.*)?$/, async (route) => {
  const res = await route.fetch();
  const body = `${await res.text()}\n${INSTRUMENT}`;
  await route.fulfill({ response: res, body, headers: { ...res.headers(), 'cache-control': 'no-store', 'content-length': String(Buffer.byteLength(body)) } });
});
const cfg = { sampleRate: SR, maxSeconds, speechLatencyMs: 45, voices: FAKE_VOICES };
await page.addInitScript({ content: `window.__SC_CFG = ${JSON.stringify(cfg)};\n${fs.readFileSync(path.join(HERE, 'page-init.js'), 'utf8')}` });

const T0 = opts.time ? new Date(opts.time).getTime() : Math.floor(Date.now() / 1000) * 1000;
await page.clock.install({ time: T0 });
await page.clock.pauseAt(T0 + 1000);

const presets = loadPresets();
const voices = new VoicePool({ size: opts['voice-workers'], cache: CACHE, env: { SHOWCASE_VOICE_ENGINE: opts['voice-engine'] } });
const voiceReady = voices.ready.then((r) => (say(`voice workers ready (${r.engine}, ${opts['voice-workers']} processes)`), r));

// speechSynthesis.speak() calls this binding: the synthesis starts at once
// (urgent, ahead of the prefetch queue). The page still waits for the result,
// which step() delivers before the clock moves again.
await page.exposeBinding('__scSpeak', (_source, r) => {
  try {
    voiceReady.then(() => voices.request(workerRequest(r.text, voiceFor(r, presets)), { urgent: true }));
  } catch { /* the between-frames pickup still serves it */ }
  return true;
});

await page.goto(url, { waitUntil: 'domcontentloaded' });

// Wait (real time) for fetches and images in flight, so replies land at the
// fake time they were requested.
async function settle(inflight, cap = 6000) {
  const t = Date.now();
  let n = inflight;
  while (n > 0 && Date.now() - t < cap) {
    await sleep(3);
    n = await page.evaluate(() => window.__sc?.inflight ?? 0);
  }
  return n;
}

const clips = new Map(); // speech id -> { out, label, engine, cached, elapsed }
const synthStats = { requests: 0, cached: 0, seconds: 0, synthTime: 0, waitTime: 0, errors: 0 };
async function serviceSpeech(reqs) {
  for (const r of reqs) {
    synthStats.requests++;
    const v = voiceFor(r, presets);
    await voiceReady;
    const tw = Date.now();
    const res = await voices.request(workerRequest(r.text, v), { urgent: true });
    if (!res.ok) {
      synthStats.errors++;
      say(`voice error for #${r.id}: ${res.error}`);
      await page.evaluate(([id, e]) => window.__sc.deliver(id, { error: e }), [r.id, res.error || 'synthesis failed']);
      continue;
    }
    const waited = (Date.now() - tw) / 1000;
    synthStats.waitTime += waited;
    if (res.cached || waited < 0.5) synthStats.cached++;
    synthStats.synthTime += res.cached ? 0 : res.elapsed || 0;
    synthStats.seconds += res.duration;
    clips.set(r.id, { out: res.out, label: v.label, engine: res.engine, cached: res.cached, words: res.words });
    await page.evaluate(([id, d]) => window.__sc.deliver(id, d), [r.id, { duration: res.duration, words: res.words, clip: res.out, voice: v.label }]);
  }
}

// Sentences predicted by the page (episode / ad on air, next episode) are
// synthesised by idle workers in the background.
function prefetch(list) {
  for (const r of list || []) {
    const v = voiceFor(r, presets);
    voices.request(workerRequest(r.text, v), { urgent: false });
  }
}
// After a break starts, predict the next ready episode from the server's queue.
const predictedNext = new Set();
async function predictNextEpisode() {
  try {
    const q = await (await fetch(`${origin}/api/queue`)).json();
    const ep = Array.isArray(q) ? q.find((e) => !predictedNext.has(e.id)) : null;
    if (!ep) return;
    predictedNext.add(ep.id);
    await page.evaluate((e) => window.__sc.predictEpisode(e), ep);
  } catch { /* dev endpoint missing: no prefetch */ }
}

// One step of page time: settle network, run the clock, serve speech asked for.
async function step(ms) {
  let st = await page.evaluate(() => ({ reqs: window.__sc.takeRequests(), inflight: window.__sc.inflight, pre: window.__sc.takePrefetch() }));
  prefetch(st.pre);
  if (st.reqs.length) await serviceSpeech(st.reqs);
  if (st.inflight > 0) await settle(st.inflight);
  await page.clock.runFor(ms);
  st = await page.evaluate(() => {
    window.__sc.pump(); // frame-exact mode: render at this instant (no-op otherwise)
    return { reqs: window.__sc.takeRequests(), inflight: window.__sc.inflight };
  });
  if (st.reqs.length) await serviceSpeech(st.reqs);
}

// Ready: main.js fetched /api/channel and exposed the director.
for (let i = 0; i < 400; i++) {
  const ok = await page.evaluate(() => Boolean(window.__showcase?.player) && Boolean(window.__sc));
  if (ok) break;
  await settle(1, 200);
  await page.clock.runFor(50);
  if (i === 399) throw new Error('channel page never became ready (is the server running?)');
}
const instrumented = await page.evaluate(() => window.__sc.instrument());
const predictors = await page.evaluate(() => window.__sc.loadPredictors());
const rafMode = opts['no-raf-throttle'] ? 'native' : String(opts.raf || 'frame');
if (!['frame', 'throttle', 'native'].includes(rafMode)) throw new Error(`bad --raf ${rafMode} (frame | throttle | native)`);
if (rafMode === 'frame') await page.evaluate(() => window.__sc.manualRaf());
else if (rafMode === 'throttle') await page.evaluate((fps) => window.__sc.throttleRaf(fps), FPS);
say(`page ready${instrumented ? '' : ' (director not instrumented: timeline from shots only)'}${predictors ? '' : ' (no sentence predictor: no prefetch)'} · ${elapsed()}`);

// ------------------------------------------------------------- skip/start
const pageNow = () => page.evaluate(() => performance.now());
const allLog = [];
const pullLog = async () => {
  const l = await page.evaluate(() => window.__sc.takeLog());
  allLog.push(...l);
  return l;
};
const startEvent = { now: null, open: (e) => e.ev === 'shot' && e.shot === 'open', break: (e) => e.ev === 'playBreak' && e.phase === 'start', endcard: (e) => e.ev === 'shot' && e.shot === 'endcard' }[opts.start];
if (startEvent === undefined) throw new Error(`bad --start ${opts.start}`);
{
  const skipUntil = (await pageNow()) + opts.skip * 1000;
  while ((await pageNow()) < skipUntil) await step(100);
  if (startEvent) {
    const t0 = await pageNow();
    const limit = t0 + opts['max-wait'] * 1000;
    let found = false;
    let told = Date.now();
    while (!found) {
      await step(50);
      found = (await pullLog()).some(startEvent);
      const t = await pageNow();
      if (!found && t > limit) throw new Error(`--start ${opts.start} not reached within ${opts['max-wait']} s of channel time`);
      if (Date.now() - told > 15000) {
        told = Date.now();
        say(`waiting for --start ${opts.start}: ${((t - t0) / 1000).toFixed(0)} s of channel time · ${elapsed()}`);
      }
    }
  }
}
await pullLog();
await page.evaluate(() => {
  window.__sc.mode = 'record';
});

// ------------------------------------------------------------------ record
// Frames go to a lossless native-size file while recording (cheap, never
// back-pressures the capture loop); the 5x nearest-neighbour H.264 encode runs
// once at the end, together with the mux.
const videoPath = path.join(WORK, 'video-native.mkv');
const ff = spawn('ffmpeg', [
  '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', videoPath,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = once(ff, 'close');

const maxFrames = Math.round(opts.seconds * FPS);
const sheetTiles = [];
const sheetEvery = Number(opts['sheet-every']) || (untilMatch ? 15 : Math.max(2, opts.seconds / 20));
let R = null; // page time (ms) of frame 0
let stopAt = untilMatch ? Infinity : null;
let untilHits = 0;
// Where the cut may land (page clock, ms): segments on air (say start -> end), the last word's end
// and every shot start, so the recording never stops inside speech or right after a new shot.
const openSays = new Set();
let lastSayEnd = -Infinity;
const shotStarts = [];
let frames = 0;
let lastReport = Date.now();
const timing = { frame: 0, encode: 0, speech: 0, clock: 0, other: 0 };
let tMark = Date.now();
const lap = (k) => {
  const n = Date.now();
  timing[k] += n - tMark;
  tMark = n;
};
for (let i = 0; i < maxFrames; i++) {
  lap('other');
  const st = await page.evaluate(() => {
    const s = window.__sc.step();
    s.t = performance.now();
    s.pre = window.__sc.takePrefetch();
    return s;
  });
  if (R === null) R = st.t;
  if (!st.png) throw new Error('no #screen canvas');
  const png = Buffer.from(st.png.split(',')[1], 'base64');
  lap('frame');
  if (!ff.stdin.write(png)) await once(ff.stdin, 'drain');
  lap('encode');
  frames++;
  if (i % Math.max(1, Math.round(sheetEvery * FPS)) === 0) sheetTiles.push({ i, t: i / FPS, png: st.png });
  prefetch(st.pre);
  if (st.reqs.length) await serviceSpeech(st.reqs);
  if (st.inflight > 0) await settle(st.inflight);
  lap('speech');
  // Stop conditions measured on the page clock.
  if (i % 3 === 0) {
    const fresh = await pullLog();
    if (fresh.some((e) => e.ev === 'playBreak' && e.phase === 'start')) predictNextEpisode();
    for (const e of fresh) {
      if (e.ev === 'say' && e.phase === 'start') openSays.add(e.t);
      else if (e.ev === 'say' && e.phase === 'end') {
        openSays.delete(e.ref);
        lastSayEnd = Math.max(lastSayEnd, e.t);
      } else if (e.ev === 'shot') shotStarts.push(e.at ?? e.t);
    }
    if (untilMatch && stopAt === Infinity) {
      const [, kind, plus] = untilMatch;
      for (const e of fresh) {
        const hit = (kind === 'next-open' && e.ev === 'shot' && e.shot === 'open')
          || (kind === 'endcard' && e.ev === 'shot' && e.shot === 'endcard')
          || (kind === 'break-end' && e.ev === 'playBreak' && e.phase === 'end')
          || (kind === 'episode-end' && e.ev === 'playEpisode' && e.phase === 'end');
        if (hit && ++untilHits >= opts.count) {
          stopAt = (e.at ?? e.t) + Number(plus || 0) * 1000;
          say(`stop condition ${opts.until}${opts.count > 1 ? ` (#${untilHits})` : ''} at ${(((e.at ?? e.t) - R) / 1000).toFixed(1)} s`);
          break;
        }
        if (hit) say(`${kind} #${untilHits} of ${opts.count} at ${(((e.at ?? e.t) - R) / 1000).toFixed(1)} s`);
      }
    }
    if (stopAt && stopAt !== Infinity && st.t >= stopAt) {
      // Never inside speech: let the segment on air finish, then record up to 1.6 s of its tail (or
      // until the next shot); the exact cut is chosen after the loop.
      if (!untilMatch) break;
      const tailFrom = lastSayEnd >= stopAt - 2000 ? lastSayEnd : -Infinity;
      if (!openSays.size && (tailFrom === -Infinity || st.t >= tailFrom + 1600 || shotStarts.some((t) => t > tailFrom + 1))) break;
    }
  }
  const ms = Math.round(((i + 1) * 1000) / FPS) - Math.round((i * 1000) / FPS);
  lap('other');
  await page.clock.runFor(ms);
  lap('clock');
  if (Date.now() - lastReport > 15000) {
    lastReport = Date.now();
    say(`${(i / FPS).toFixed(1)} s recorded · ${synthStats.requests} utterances (${synthStats.cached} ready from cache/prefetch, ${synthStats.waitTime.toFixed(0)} s waited) · queue ${voices.pending} · ${elapsed()}`);
  }
}
ff.stdin.end();
await pullLog();
// The cut: after the stop point, at the end of the last segment's tail (its last word + 1.5 s) or
// one frame before the next shot, whichever is first, and never with a shot starting in the last 2 s.
let cutNote = null;
if (untilMatch && stopAt !== Infinity && stopAt != null) {
  const frameMs = 1000 / FPS;
  for (const e of allLog) {
    if (e.ev === 'say' && e.phase === 'end') lastSayEnd = Math.max(lastSayEnd, e.t);
    if (e.ev === 'shot' && !shotStarts.includes(e.at ?? e.t)) shotStarts.push(e.at ?? e.t);
  }
  const recEnd = R + frames * frameMs;
  let cut = stopAt;
  if (lastSayEnd >= stopAt - 2000) {
    cut = lastSayEnd + 1500;
    const next = shotStarts.filter((t) => t > lastSayEnd + 1).sort((a, b) => a - b)[0];
    if (next != null && next - frameMs < cut) cut = Math.max(lastSayEnd + 300, next - frameMs);
  }
  for (let k = 0; k < 4; k++) {
    const late = shotStarts.filter((t) => t > cut - 2000 && t <= cut && t > stopAt - 4000).sort((a, b) => a - b)[0];
    if (late == null || late - frameMs <= R) break;
    cut = late - frameMs;
  }
  cut = Math.min(cut, recEnd);
  const keep = Math.max(1, Math.round((cut - R) / frameMs));
  if (keep < frames) {
    cutNote = `cut at ${((keep * frameMs) / 1000).toFixed(2)} s (${frames - keep} tail frames dropped; last word ends at ${((lastSayEnd - R) / 1000).toFixed(2)} s)`;
    frames = keep;
    while (sheetTiles.length && sheetTiles[sheetTiles.length - 1].i >= frames) sheetTiles.pop();
  }
}
const Rend = R + Math.round((frames * 1000) / FPS);
const seconds = frames / FPS;
if (cutNote) say(cutNote);
const pageStats = await page.evaluate(() => ({ stats: window.__sc.stats, errors: window.__sc.errors, contexts: window.__sc.contexts.length }));
say(`recorded ${frames} frames (${seconds.toFixed(1)} s) · ${elapsed()}; real time spent (s): ${Object.entries(timing).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)}`).join(', ')}; rendering WebAudio`);

// --------------------------------------------------------- WebAudio render
const rendered = await page.evaluate(([a, b]) => window.__sc.renderAudio(a, b), [R, Rend]);
// webaudio.f32: everything the channel played; speechbus.f32: its speech bus
// alone (the server's recorded voices, when the channel played them itself).
fs.rmSync(path.join(WORK, 'speechbus.f32'), { force: true });
for (const [which, file] of [['mix', 'webaudio.f32'], ...(rendered.speechTapped && rendered.speechPeak > 1e-4 ? [['speech', 'speechbus.f32']] : [])]) {
  const fd = fs.openSync(path.join(WORK, file), 'w');
  const CH = SR * 5;
  for (let from = 0; from < rendered.n; from += CH) {
    const count = Math.min(CH, rendered.n - from);
    const [l, r] = await Promise.all([0, 1].map((ch) => page.evaluate(([c, f, n, w]) => window.__sc.audioChunk(c, f, n, w), [ch, from, count, which])));
    const L = new Float32Array(Buffer.from(l, 'base64').buffer.slice(0));
    const Rr = new Float32Array(Buffer.from(r, 'base64').buffer.slice(0));
    const inter = new Float32Array(count * 2);
    for (let k = 0; k < count; k++) {
      inter[2 * k] = L[k];
      inter[2 * k + 1] = Rr[k];
    }
    fs.writeSync(fd, Buffer.from(inter.buffer));
  }
  fs.closeSync(fd);
}
const speechInWebaudio = fs.existsSync(path.join(WORK, 'speechbus.f32'));
const stemSpeechBus = speechInWebaudio ? loadMono(path.join(WORK, 'speechbus.f32')) : null;
say(`WebAudio: ${rendered.contexts.length} context(s), peak ${(20 * Math.log10(rendered.peak || 1e-9)).toFixed(1)} dBFS, ${JSON.stringify(rendered.stats)} · ${elapsed()}`);
await page.close();
await ffDone;
await voices.close();

// ---------------------------------------------------------------- timeline
const rel = (ms) => +((ms - R) / 1000).toFixed(4);
const speech = allLog
  .filter((e) => e.ev === 'speech')
  .map((e) => {
    const c = clips.get(e.id);
    const end = e.cut != null ? Math.min(e.cut, e.end) : e.end;
    return {
      id: e.id, start: rel(e.t), end: rel(end), cut: e.cut != null && e.cut < e.end ? rel(e.cut) : null, called: rel(e.called),
      slot: e.slot, presenter: e.presenter, ad: e.ad?.id ?? null, programId: e.programId, emotion: e.emotion, voice: e.voice,
      text: e.text, clip: c?.out ?? null, cached: c?.cached ?? null, engine: c?.engine ?? null, volume: e.volume,
      firstWord: c?.words?.[0]?.t ?? 0, estimated: e.estimated, error: e.error,
    };
  });
const heard = speech.filter((s) => s.clip && s.end > 0 && s.start < seconds && s.volume > 0);
// Intervals where the engine says a voice is heard (browser TTS, recorded clips
// from the server's voice service, blips): the duck reference in every mode.
const voiced = [];
{
  let on = null;
  for (const e of allLog.filter((x) => x.ev === 'voiced').sort((a, b) => a.t - b.t)) {
    if (e.on && on === null) on = e.t;
    else if (!e.on && on !== null) {
      voiced.push({ start: rel(on), end: rel(e.t) });
      on = null;
    }
  }
  if (on !== null) voiced.push({ start: rel(on), end: seconds + 1 });
}
// Recorded voices the channel played itself (decoded clips started on the speech bus).
const clipsPlayed = allLog.filter((e) => e.ev === 'clip').map((e) => ({ start: rel(e.at), end: rel(e.at) + e.duration, duration: e.duration }));
// Where a voice is really heard: with the server's recorded voices, the speech bus's own envelope
// (10 ms, > -48 dBFS), so the pauses between sentences and segments are real gaps for the bed engine's
// duck and the bed rider (a clip span covers its whole segment, pauses included); else the spans the
// engine reports.
function activitySpans(x, thresholdDb = -48) {
  const hopN = Math.round(SR * 0.01);
  const out = [];
  let on = null;
  for (let k = 0; (k + 1) * hopN <= x.length; k++) {
    let sum = 0;
    for (let i = k * hopN; i < (k + 1) * hopN; i++) sum += x[i] * x[i];
    const loud = 10 * Math.log10(sum / hopN + 1e-20) > thresholdDb;
    if (loud && on === null) on = k;
    else if (!loud && on !== null) {
      out.push({ start: on * 0.01, end: k * 0.01 });
      on = null;
    }
  }
  if (on !== null) out.push({ start: on * 0.01, end: x.length / SR });
  return out;
}
const busActivity = stemSpeechBus && clipsPlayed.length ? activitySpans(stemSpeechBus) : null;
const voiceSpans = busActivity
  ? [...heard.map((s) => ({ start: s.start, end: s.end })), ...busActivity]
  : [
    ...heard.map((s) => ({ start: s.start, end: s.end })),
    ...voiced.filter((v) => v.end > 0 && v.start < seconds),
    ...clipsPlayed.filter((c) => c.end > 0 && c.start < seconds),
  ];
const events = allLog
  .filter((e) => e.ev !== 'speech')
  .map((e) => {
    const o = { ...e, t: rel(e.t) };
    if (e.at != null) o.at = rel(e.at);
    if (e.ref != null) o.ref = rel(e.ref);
    return o;
  });

// Sentences of the recorded voices the channel played: each starts when its
// caption appears (onSentence fires as its first recorded word is heard) and
// ends at the last sound on the speech bus before the next caption. The music
// cue rules read them like the utterances synthesised here (headline lines,
// pips, the greeting, the last word of the sign-off).
const recordedSentences = [];
if (stemSpeechBus && clipsPlayed.length) {
  const HOPS = Math.round(SR * 0.01);
  const env = new Float32Array(Math.floor(stemSpeechBus.length / HOPS));
  for (let k = 0; k < env.length; k++) {
    let sum = 0;
    for (let i = k * HOPS; i < (k + 1) * HOPS; i++) sum += stemSpeechBus[i] * stemSpeechBus[i];
    env[k] = 10 * Math.log10(sum / HOPS + 1e-12);
  }
  const subs = allLog.filter((e) => e.ev === 'subtitle').sort((a, b) => a.t - b.t);
  subs.forEach((e, i) => {
    if (!e.text) return;
    const start = rel(e.t);
    const clip = clipsPlayed.find((c) => start >= c.start - 0.2 && start <= c.end);
    if (!clip) return;
    const limit = Math.min(clip.end, i + 1 < subs.length ? rel(subs[i + 1].t) : clip.end, seconds);
    let end = start;
    for (let k = Math.max(0, Math.floor(start * 100)); k < Math.min(env.length, Math.floor(limit * 100)); k++) if (env[k] > -45) end = (k + 1) / 100;
    if (start < 0 || start >= seconds) return; // outside the recording: no stem to measure
    recordedSentences.push({ ev: 'speech', t: e.t, end: R + Math.max(end, start + 0.2) * 1000, text: e.text, volume: 1, recorded: true });
  });
}

// ------------------------------------------------------------------- beds
let cues = [];
let bedsInfo = null;
const measureDuck = opts['measure-duck'] === 'off' ? false : Boolean(opts['measure-duck']) || seconds <= 900; // off: the rider does not need the dry render
const PREROLL = 8;
if (opts.music !== 'none') {
  cues = deriveCues([...allLog, ...recordedSentences]);
  const B = R - PREROLL * 1000; // the bed render starts before the window, so a bed is already playing
  const before = cues.filter((c) => c.t < B);
  const engineCues = [...(before.length ? [{ ...before[before.length - 1], t: B }] : []), ...cues.filter((c) => c.t >= B && c.t < Rend)]
    .map((c) => ({ t: (c.t - B) / 1000, moment: c.moment, opts: c.opts }));
  const regionsB = speechRegions(voiceSpans.map((s) => ({ start: s.start + PREROLL, end: s.end + PREROLL })));
  const bedPage = await context.newPage();
  await bedPage.route(`${origin}/__showcase/blank`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>beds</title>' }));
  await bedPage.goto(`${origin}/__showcase/blank`);
  const total = PREROLL + seconds + 1;
  try {
    const tb = Date.now();
    bedsInfo = await bedPage.evaluate(renderBedsInPage, { engine: opts.music, cues: engineCues, speech: regionsB, seconds: total, sampleRate: SR, dry: measureDuck, stories: opts.stories });
    bedsInfo.ms = Date.now() - tb; // the page clock is the context's paused fake clock
    for (const which of measureDuck ? ['wet', 'dry'] : ['wet']) {
      const fd = fs.openSync(path.join(WORK, which === 'wet' ? 'beds.f32' : 'beds-dry.f32'), 'w');
      const from0 = Math.round(PREROLL * SR);
      const n = Math.round(seconds * SR);
      const CH = SR * 5;
      for (let k = 0; k < n; k += CH) {
        const count = Math.min(CH, n - k);
        const [l, r] = await Promise.all([0, 1].map((ch) => bedPage.evaluate(bedChunkInPage, [which, ch, from0 + k, count])));
        const L = new Float32Array(Buffer.from(l, 'base64').buffer.slice(0));
        const Rr = new Float32Array(Buffer.from(r, 'base64').buffer.slice(0));
        const inter = new Float32Array(count * 2);
        for (let j = 0; j < count; j++) {
          inter[2 * j] = L[j] || 0;
          inter[2 * j + 1] = Rr[j] || 0;
        }
        fs.writeSync(fd, Buffer.from(inter.buffer));
      }
      fs.closeSync(fd);
    }
    say(`beds (${opts.music}): ${engineCues.length} cues rendered in ${bedsInfo.ms} ms · ${elapsed()}`);
    // What the bed engine did, on the recording clock, against the pace rules
    // (public/js/pace.js music: minBed, maxChangesPerMin), when both exist.
    if (Array.isArray(bedsInfo.actions)) {
      bedsInfo.actions = bedsInfo.actions.map((a) => ({ ...a, t: +(a.t - PREROLL).toFixed(3) }));
      let rulesFor = () => null;
      try {
        const pace = await import(path.join(HERE, '..', '..', 'public', 'js', 'pace.js'));
        if (typeof pace.paceFor === 'function') rulesFor = (id) => pace.paceFor(id)?.music ?? null;
      } catch {
        // no pace table: the report carries the measurements without limits
      }
      bedsInfo.pace = bedPace(bedsInfo.actions, { seconds, rulesFor });
      say(`bed changes vs pace: ${Object.entries(bedsInfo.pace).map(([id, p]) => `${id} ${p.changes} in ${p.seconds} s (${p.perMin}/min, max ${p.maxPerMin}), shortest bed ${p.shortestBed} s (min ${p.minBed}), ${p.short.length} short`).join('; ') || '(none)'}`);
    }
  } catch (err) {
    say(`beds failed (${err.message}); mixing without music`);
    bedsInfo = { error: err.message };
  }
  await bedPage.close();
}

// -------------------------------------------------------------------- mix
const regions = speechRegions(voiceSpans);
// Studio windows (recording clock): from the first shot after each programme open to its end card
// (or the end of the recording). The room tone and the silence check cover these.
const studio = [];
{
  const shots = events.filter((e) => e.ev === 'shot').map((e) => ({ shot: e.shot, at: e.at ?? e.t })).sort((a, b) => a.at - b.at);
  for (let i = 0; i < shots.length; i++) {
    if (shots[i].shot !== 'open') continue;
    const first = shots.slice(i + 1).find((x) => x.shot !== 'open');
    if (!first) continue;
    const end = shots.slice(i + 1).find((x) => x.at > first.at && ['endcard', 'ident', 'ad', 'promo', 'open', 'standby'].includes(x.shot));
    const a = Math.max(0, first.at);
    const b = Math.min(seconds, end ? end.at : seconds);
    if (b - a > 1) studio.push([a, b]);
  }
}
const manifest = {
  sr: SR,
  seconds,
  webaudio: path.join(WORK, 'webaudio.f32'),
  beds: bedsInfo && !bedsInfo.error ? path.join(WORK, 'beds.f32') : null,
  bedsDry: bedsInfo && !bedsInfo.error && measureDuck ? path.join(WORK, 'beds-dry.f32') : null,
  voices: heard.map((s) => ({ path: s.clip, start: s.start, cut: s.cut, gain: s.volume })),
  voiceGain: 1, // each clip already carries utterance.volume (= the engine's master volume, like WebAudio's)
  speech: regions,
  quiet: quietIntervals(allLog, R),
  bedGainDb: opts['bed-db'],
  bedUnderVoiceDb: null, // the old auto level (superseded by the rider)
  bedRider: RIDER != null && Number.isFinite(RIDER) ? { underDb: RIDER, window: [-RIDER - 2, -RIDER + 2], gapDb: Number(opts['bed-gap']) || 11, gapMin: 0.6, maxLift: 8, ceilDb: 6 } : null,
  roomTone: ROOM_TONE != null && Number.isFinite(ROOM_TONE) ? { db: ROOM_TONE, fade: 0.5 } : null,
  studio,
  fadeOut: FADE,
  webSpeech: speechInWebaudio ? path.join(WORK, 'speechbus.f32') : null, // voices inside the WebAudio stem (duck reference)
  extraDuckDb: opts['duck-db'],
  lufs: opts.lufs,
  tp: opts.tp,
  out: path.join(WORK, 'mix.wav'),
  aac: path.join(WORK, 'mix.m4a'),
  stems: WORK,
};
fs.writeFileSync(path.join(WORK, 'mix.json'), JSON.stringify(manifest, null, 1));
const mixRun = spawnSync(process.env.PYTHON || 'python3', [path.join(HERE, 'mix.py'), path.join(WORK, 'mix.json')], { encoding: 'utf8', maxBuffer: 64 << 20 });
if (mixRun.status !== 0) {
  console.error(mixRun.stderr);
  throw new Error('mix failed');
}
const mixReport = JSON.parse(mixRun.stdout.trim().split('\n').pop());
say(`mix: ${JSON.stringify(mixReport.final)} · ${elapsed()}`);
if (mixReport.bedRider) say(`bed rider: ${JSON.stringify(mixReport.bedRider)}`);
if (mixReport.silentRuns) say(`silent runs (< -70 dBFS for > 0.25 s, open to end card): ${mixReport.silentRuns.count}${mixReport.silentRuns.count ? ` ${JSON.stringify(mixReport.silentRuns.runs.slice(0, 5))}` : ''}`);

const tEnc = Date.now();
const mux = spawnSync('ffmpeg', [
  '-v', 'error', '-y', '-i', videoPath, '-i', manifest.aac, '-map', '0:v', '-map', '1:a',
  '-vf', `scale=iw*${opts.scale}:ih*${opts.scale}:flags=neighbor${FADE > 0 ? `,fade=t=out:st=${Math.max(0, seconds - FADE).toFixed(3)}:d=${FADE.toFixed(3)}` : ''}`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', String(opts.preset || 'veryfast'),
  // -t, not -shortest: with -shortest the frames still queued in x264's
  // lookahead/B-frames when the audio ends were dropped (2697 of 2700 frames).
  '-c:a', 'copy', '-t', seconds.toFixed(4), '-movflags', '+faststart', OUT,
], { encoding: 'utf8', maxBuffer: 16 << 20 });
if (mux.status !== 0) throw new Error(`encode/mux failed: ${mux.stderr}`);
say(`encoded ${opts.scale}x H.264 + AAC in ${((Date.now() - tEnc) / 1000).toFixed(0)} s · ${elapsed()}`);

// ------------------------------------------------------- checks and sheet
const stem = (name) => loadMono(path.join(WORK, `${name}.wav`));
const stemWeb = stem('webaudio');
const stemVoice = stem('voice');
const sync = syncReport({ events, speech: heard, webaudio: stemWeb, voice: stemVoice, speechBus: stemSpeechBus, clips: clipsPlayed, sr: SR });
const shotAt = (t) => {
  let shot = null;
  for (const e of events) if (e.ev === 'shot' && (e.at ?? e.t) <= t + 1e-3) shot = e;
  return shot;
};
// Who speaks when: utterances synthesised here, else the segment on air (its
// anchor, cast from the episode) while the channel plays a recorded voice.
const sayStarts = events.filter((e) => e.ev === 'say' && e.phase === 'start');
const sayEnds = new Map(events.filter((e) => e.ev === 'say' && e.phase === 'end').map((e) => [e.ref, e.t]));
const castAt = (t) => {
  let cast = null;
  for (const e of events) if (e.ev === 'playEpisode' && e.phase === 'start' && e.t <= t) cast = e.cast;
  return cast;
};
const segmentAt = (t) => sayStarts.filter((e) => e.t <= t && (sayEnds.get(e.t) ?? Infinity) >= t).pop() ?? null;
const captionAt = (t) => {
  let c = null;
  for (const e of events) if (e.ev === 'subtitle' && e.t <= t + 1e-3) c = e.text;
  return c;
};
const speakerAt = (t) => {
  const sp = heard.find((x) => x.start <= t && x.end >= t);
  if (sp) return { who: sp.presenter || (sp.ad ? `VO ${sp.ad}` : sp.slot), text: sp.text };
  const clip = clipsPlayed.find((c) => c.start <= t && c.end >= t);
  if (!clip) return null;
  const seg = segmentAt(t);
  const who = seg ? castAt(t)?.[seg.anchor] ?? seg.anchor : 'VO';
  return { who: `${who} (server voice)`, text: captionAt(t) ?? '' };
};
const tiles = sheetTiles.map((tile) => {
  const s = shotAt(tile.t);
  const sp = speakerAt(tile.t);
  const mm = `${Math.floor(tile.t / 60)}:${(tile.t % 60).toFixed(1).padStart(4, '0')}`;
  return {
    png: tile.png,
    label: `${mm}  ${s?.shot ?? '?'}${s?.programId ? ` · ${s.programId}` : ''}${s?.card?.ad ? ` · ${s.card.ad}` : ''}`,
    sub: sp ? (sp.text ? `${sp.who}: "${sp.text}"` : sp.who) : '(no voice)', // ads carry no captions
  };
});
const sheetPage = await context.newPage();
const sheetUrl = await sheetPage.evaluate(composeSheetInPage, { tiles, cols: 4, scale: 2, title: `GLOBIT 24 showcase · ${path.basename(OUT)} · ${seconds.toFixed(1)} s · every ${sheetEvery.toFixed(1)} s` });
const sheetPath = OUT.replace(/\.mp4$/i, '') + '-sheet.png';
fs.writeFileSync(sheetPath, Buffer.from(sheetUrl.split(',')[1], 'base64'));
// The audio picture: stems on the recording clock with shots, voices, cues, quiet zones.
const HOP = 0.05;
const shotMarks = events.filter((e) => e.ev === 'shot' && (e.at ?? e.t) >= 0 && (e.at ?? e.t) <= seconds)
  .map((e) => ({ t: e.at ?? e.t, label: `${e.shot}${e.card?.ad ? `:${e.card.ad}` : ''}` }));
const audioUrl = await sheetPage.evaluate(composeAudioSheetInPage, {
  title: `${path.basename(OUT)} · audio · final ${mixReport.final?.I} LUFS / TP ${mixReport.final?.TP} dBTP · bed duck median ${mixReport.bedDuckDb?.median} dB`,
  hop: HOP,
  seconds,
  lanes: [
    { name: 'voice', color: '#4fb8e8', values: levels(stemVoice, SR, HOP) },
    ...(stemSpeechBus ? [{ name: 'srv voice', color: '#4fe8c8', values: levels(stemSpeechBus, SR, HOP) }] : []),
    { name: 'webaudio', color: '#e8b04f', values: levels(stemWeb, SR, HOP) },
    { name: 'beds', color: '#a77fe8', values: levels(stem('beds'), SR, HOP) },
    { name: 'mix', color: '#9ad47a', values: levels(loadMono(manifest.out), SR, HOP) },
  ],
  shots: shotMarks,
  speech: [
    ...heard.map((x) => ({ start: x.start, end: x.end, who: x.presenter || (x.ad ? 'VO' : x.slot || '?') })),
    ...clipsPlayed.map((c) => {
      const seg = segmentAt(c.start + 0.2);
      return { start: c.start, end: c.end, who: seg ? castAt(c.start)?.[seg.anchor] ?? seg.anchor : 'VO' };
    }),
  ],
  cues: cues.map((c) => ({ t: rel(c.t), label: `${c.moment}${c.opts.emotion && c.opts.emotion !== 'neutral' ? `(${c.opts.emotion})` : ''}` })).filter((c) => c.t >= 0 && c.t <= seconds),
  quiet: manifest.quiet,
});
const audioPath = OUT.replace(/\.mp4$/i, '') + '-audio.png';
fs.writeFileSync(audioPath, Buffer.from(audioUrl.split(',')[1], 'base64'));
await sheetPage.close();
await browser.close();

const timeline = {
  meta: {
    url, out: OUT, fps: FPS, seconds, frames, sampleRate: SR, start: opts.start, until: opts.until, count: opts.count, raf: rafMode, music: opts.music, stories: opts.stories,
    recordedAt: new Date().toISOString(), wallClockStart: new Date(T0 + (R ?? 0)).toISOString(), voiceCache: CACHE,
    voicePresets: presets.file, realSeconds: (Date.now() - t0Real) / 1000,
  },
  speech: speech.map(({ clip, ...s }) => ({ ...s, clip: clip ? path.basename(clip) : null })),
  recordedClips: clipsPlayed,
  music: cues.map((c) => ({ t: rel(c.t), moment: c.moment, opts: c.opts, why: c.why })),
  events,
  reports: { mix: mixReport, sync, timingMs: timing, synth: { ...synthStats, pool: voices.stats }, page: pageStats, webaudio: rendered, beds: bedsInfo, pageErrors: pageErrors.slice(0, 50) },
};
const timelinePath = OUT.replace(/\.mp4$/i, '') + '-timeline.json';
fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 1));
if (!opts.keep) {
  for (const f of ['webaudio.f32', 'speechbus.f32', 'beds.f32', 'beds-dry.f32', 'mix-raw.wav', 'video-native.mkv']) fs.rmSync(path.join(WORK, f), { force: true });
}
say(`done in ${elapsed()}: ${OUT}`);
say(`sheet ${sheetPath}`);
say(`audio picture ${audioPath}`);
say(`timeline ${timelinePath}`);
say(`loudness ${mixReport.final?.I} LUFS, TP ${mixReport.final?.TP} dBTP, LRA ${mixReport.final?.LRA} LU; bed duck ${mixReport.bedDuckDb ? JSON.stringify(mixReport.bedDuckDb) : '(not measured: --measure-duck)'}; quiet zones ${JSON.stringify((mixReport.quiet || []).map((q) => `${q.kind} ${q.bedRmsDb} dB`))}`);
say(`sync ${JSON.stringify(sync.summary)}`);
if (pageErrors.length) say(`${pageErrors.length} page errors, first: ${pageErrors.slice(0, 3).join(' | ')}`);
