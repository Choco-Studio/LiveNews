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
//   --out file.mp4            output (work files go to <out>.work/, kept with --keep)
//   --seconds N               recording length (with --until: the maximum)
//   --start now|open|break|endcard   begin at the next programme open / break / end card (default now)
//   --skip N                  run N s of channel time (no recording) before looking for --start
//   --until next-open+S|break-end+S|episode-end+S   stop S s after that event (else after --seconds)
//   --max-wait N              seconds of channel time allowed to reach --start (default 240)
//   --fps 30 --scale 5        video
//   --music lofi|broadcast|none   bed engine (default lofi)
//   --bed-db N                bed trim in dB (default 0); --duck-db N minimum extra bed duck under speech (default -6;
//                             deeper where the engine's own duck is shallow, so the total is >= 16 dB)
//   --lufs -16 --tp -1.5      loudness targets
//   --cache DIR               voice clip cache (default ~/.cache/globit-showcase/voices)
//   --time ISO                wall-clock time the channel shows at start (default now)
//   --sheet-every S           contact-sheet sampling (default: 20 tiles over the recording)
//   --voice-engine auto|fallback   use the voice stream's engine when it loads (auto) or the built-in one

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { VoiceWorker, voiceFor, loadPresets, FAKE_VOICES } from './lib/voices.mjs';
import { deriveCues, speechRegions, quietIntervals, renderBedsInPage, bedChunkInPage } from './lib/music.mjs';
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
  seconds: 90, skip: 0, fps: 30, scale: 5, start: 'now', until: null, 'max-wait': 240, music: 'lofi',
  'bed-db': 0, 'duck-db': -6, lufs: -16, tp: -1.5, sr: 48000, port: 8602, 'voice-engine': 'auto',
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
for (const k of ['seconds', 'skip', 'fps', 'scale', 'max-wait', 'bed-db', 'duck-db', 'lufs', 'tp', 'sr', 'port']) opts[k] = Number(opts[k]);
if (!opts.out) {
  console.error('usage: node tools/showcase/record-show.mjs --out show.mp4 [--port 8602 | --url URL] [--seconds 90] [--start now|open|break|endcard] [--until next-open+20] [--music lofi|broadcast|none]');
  process.exit(1);
}
const url = opts.url || `http://127.0.0.1:${opts.port}/?autostart=1&voice=tts`;
const origin = new URL(url).origin;
const OUT = path.resolve(opts.out);
const WORK = `${OUT.replace(/\.mp4$/i, '')}.work`;
fs.mkdirSync(WORK, { recursive: true });
const CACHE = path.resolve(opts.cache || path.join(os.homedir(), '.cache', 'globit-showcase', 'voices'));
const FPS = opts.fps;
const SR = opts.sr;
const untilMatch = typeof opts.until === 'string' ? /^(next-open|break-end|episode-end)(?:\+(\d+(?:\.\d+)?))?$/.exec(opts.until) : null;
if (opts.until && !untilMatch) {
  console.error(`bad --until ${opts.until} (next-open+S | break-end+S | episode-end+S)`);
  process.exit(1);
}
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
const voices = new VoiceWorker({ cache: CACHE, env: { SHOWCASE_VOICE_ENGINE: opts['voice-engine'] } });
const voiceReady = voices.ready.then((r) => (say(`voice worker ready (${r.engine})`), r));

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
const synthStats = { requests: 0, cached: 0, seconds: 0, synthTime: 0, errors: 0 };
async function serviceSpeech(reqs) {
  for (const r of reqs) {
    synthStats.requests++;
    const v = voiceFor(r, presets);
    await voiceReady;
    const res = await voices.request({ id: r.id, text: r.text, voice: v.voice, speed: v.speed ?? null, lang: v.lang ?? null, effect: null });
    if (!res.ok) {
      synthStats.errors++;
      say(`voice error for #${r.id}: ${res.error}`);
      await page.evaluate(([id, e]) => window.__sc.deliver(id, { error: e }), [r.id, res.error || 'synthesis failed']);
      continue;
    }
    if (res.cached) synthStats.cached++;
    else synthStats.synthTime += res.elapsed || 0;
    synthStats.seconds += res.duration;
    clips.set(r.id, { out: res.out, label: v.label, engine: res.engine, cached: res.cached, words: res.words });
    await page.evaluate(([id, d]) => window.__sc.deliver(id, d), [r.id, { duration: res.duration, words: res.words, clip: res.out, voice: v.label }]);
  }
}

// One step of page time: settle network, run the clock, serve speech asked for.
async function step(ms) {
  let st = await page.evaluate(() => ({ reqs: window.__sc.takeRequests(), inflight: window.__sc.inflight }));
  if (st.reqs.length) await serviceSpeech(st.reqs);
  if (st.inflight > 0) await settle(st.inflight);
  await page.clock.runFor(ms);
  st = await page.evaluate(() => ({ reqs: window.__sc.takeRequests(), inflight: window.__sc.inflight }));
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
say(`page ready${instrumented ? '' : ' (director not instrumented: timeline from shots only)'} · ${elapsed()}`);

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
    const limit = (await pageNow()) + opts['max-wait'] * 1000;
    let found = false;
    while (!found) {
      await step(50);
      found = (await pullLog()).some(startEvent);
      if (!found && (await pageNow()) > limit) throw new Error(`--start ${opts.start} not reached within ${opts['max-wait']} s of channel time`);
    }
  }
}
await pullLog();
await page.evaluate(() => {
  window.__sc.mode = 'record';
});

// ------------------------------------------------------------------ record
const videoPath = path.join(WORK, 'video.mp4');
const ff = spawn('ffmpeg', [
  '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-vf', `scale=iw*${opts.scale}:ih*${opts.scale}:flags=neighbor`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', '-tune', 'animation', '-movflags', '+faststart', videoPath,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = once(ff, 'close');

const maxFrames = Math.round(opts.seconds * FPS);
const sheetTiles = [];
const sheetEvery = Number(opts['sheet-every']) || (untilMatch ? 15 : Math.max(2, opts.seconds / 20));
let R = null; // page time (ms) of frame 0
let stopAt = untilMatch ? Infinity : null;
let frames = 0;
let lastReport = Date.now();
for (let i = 0; i < maxFrames; i++) {
  const st = await page.evaluate(() => {
    const s = window.__sc.step();
    s.t = performance.now();
    return s;
  });
  if (R === null) R = st.t;
  if (!st.png) throw new Error('no #screen canvas');
  const png = Buffer.from(st.png.split(',')[1], 'base64');
  if (!ff.stdin.write(png)) await once(ff.stdin, 'drain');
  frames++;
  if (i % Math.max(1, Math.round(sheetEvery * FPS)) === 0) sheetTiles.push({ i, t: i / FPS, png: st.png });
  if (st.reqs.length) await serviceSpeech(st.reqs);
  if (st.inflight > 0) await settle(st.inflight);
  // Stop conditions measured on the page clock.
  if (i % 3 === 0) {
    const fresh = await pullLog();
    if (untilMatch && stopAt === Infinity) {
      const [, kind, plus] = untilMatch;
      for (const e of fresh) {
        const hit = (kind === 'next-open' && e.ev === 'shot' && e.shot === 'open')
          || (kind === 'break-end' && e.ev === 'playBreak' && e.phase === 'end')
          || (kind === 'episode-end' && e.ev === 'playEpisode' && e.phase === 'end');
        if (hit) {
          stopAt = (e.at ?? e.t) + Number(plus || 0) * 1000;
          say(`stop condition ${opts.until} at ${(((e.at ?? e.t) - R) / 1000).toFixed(1)} s`);
          break;
        }
      }
    }
    if (stopAt && stopAt !== Infinity && st.t >= stopAt) break;
  }
  const ms = Math.round(((i + 1) * 1000) / FPS) - Math.round((i * 1000) / FPS);
  await page.clock.runFor(ms);
  if (Date.now() - lastReport > 15000) {
    lastReport = Date.now();
    say(`${(i / FPS).toFixed(1)} s recorded · ${synthStats.requests} utterances (${synthStats.cached} cached, ${synthStats.synthTime.toFixed(0)} s synth) · ${elapsed()}`);
  }
}
const Rend = R + Math.round((frames * 1000) / FPS);
const seconds = frames / FPS;
ff.stdin.end();
await pullLog();
const pageStats = await page.evaluate(() => ({ stats: window.__sc.stats, errors: window.__sc.errors, contexts: window.__sc.contexts.length }));
say(`recorded ${frames} frames (${seconds.toFixed(1)} s) · ${elapsed()}; rendering WebAudio`);

// --------------------------------------------------------- WebAudio render
const rendered = await page.evaluate(([a, b]) => window.__sc.renderAudio(a, b), [R, Rend]);
{
  const fd = fs.openSync(path.join(WORK, 'webaudio.f32'), 'w');
  const CH = SR * 5;
  for (let from = 0; from < rendered.n; from += CH) {
    const count = Math.min(CH, rendered.n - from);
    const [l, r] = await Promise.all([0, 1].map((ch) => page.evaluate(([c, f, n]) => window.__sc.audioChunk(c, f, n), [ch, from, count])));
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
const events = allLog
  .filter((e) => e.ev !== 'speech')
  .map((e) => {
    const o = { ...e, t: rel(e.t) };
    if (e.at != null) o.at = rel(e.at);
    if (e.ref != null) o.ref = rel(e.ref);
    return o;
  });

// ------------------------------------------------------------------- beds
let cues = [];
let bedsInfo = null;
const PREROLL = 20;
if (opts.music !== 'none') {
  cues = deriveCues(allLog);
  const B = R - PREROLL * 1000; // the bed render starts before the window, so a bed is already playing
  const before = cues.filter((c) => c.t < B);
  const engineCues = [...(before.length ? [{ ...before[before.length - 1], t: B }] : []), ...cues.filter((c) => c.t >= B && c.t < Rend)]
    .map((c) => ({ t: (c.t - B) / 1000, moment: c.moment, opts: c.opts }));
  const regionsB = speechRegions(heard.map((s) => ({ start: s.start + PREROLL, end: s.end + PREROLL })));
  const bedPage = await context.newPage();
  await bedPage.route(`${origin}/__showcase/blank`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>beds</title>' }));
  await bedPage.goto(`${origin}/__showcase/blank`);
  const total = PREROLL + seconds + 1;
  try {
    const tb = Date.now();
    bedsInfo = await bedPage.evaluate(renderBedsInPage, { engine: opts.music, cues: engineCues, speech: regionsB, seconds: total, sampleRate: SR, dry: true });
    bedsInfo.ms = Date.now() - tb; // the page clock is the context's paused fake clock
    for (const which of ['wet', 'dry']) {
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
  } catch (err) {
    say(`beds failed (${err.message}); mixing without music`);
    bedsInfo = { error: err.message };
  }
  await bedPage.close();
}

// -------------------------------------------------------------------- mix
const regions = speechRegions(heard.map((s) => ({ start: s.start, end: s.end })));
const manifest = {
  sr: SR,
  seconds,
  webaudio: path.join(WORK, 'webaudio.f32'),
  beds: bedsInfo && !bedsInfo.error ? path.join(WORK, 'beds.f32') : null,
  bedsDry: bedsInfo && !bedsInfo.error ? path.join(WORK, 'beds-dry.f32') : null,
  voices: heard.map((s) => ({ path: s.clip, start: s.start, cut: s.cut, gain: s.volume })),
  voiceGain: 0.8, // the engine's master volume: browser TTS plays at utterance.volume = 0.8 too
  speech: regions,
  quiet: quietIntervals(allLog, R),
  bedGainDb: opts['bed-db'],
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

const mux = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', videoPath, '-i', manifest.aac, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-shortest', '-movflags', '+faststart', OUT], { encoding: 'utf8' });
if (mux.status !== 0) throw new Error(`mux failed: ${mux.stderr}`);

// ------------------------------------------------------- checks and sheet
const stem = (name) => loadMono(path.join(WORK, `${name}.wav`));
const stemWeb = stem('webaudio');
const stemVoice = stem('voice');
const sync = syncReport({ events, speech: heard, webaudio: stemWeb, voice: stemVoice, sr: SR });
const shotAt = (t) => {
  let shot = null;
  for (const e of events) if (e.ev === 'shot' && (e.at ?? e.t) <= t + 1e-3) shot = e;
  return shot;
};
const tiles = sheetTiles.map((tile) => {
  const s = shotAt(tile.t);
  const sp = heard.find((x) => x.start <= tile.t && x.end >= tile.t);
  const mm = `${Math.floor(tile.t / 60)}:${(tile.t % 60).toFixed(1).padStart(4, '0')}`;
  const who = sp ? (sp.presenter || (sp.ad ? `VO ${sp.ad}` : sp.slot)) : '';
  return {
    png: tile.png,
    label: `${mm}  ${s?.shot ?? '?'}${s?.programId ? ` · ${s.programId}` : ''}${s?.card?.ad ? ` · ${s.card.ad}` : ''}`,
    sub: sp ? `${who}: "${sp.text}"` : '(no voice)',
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
    { name: 'webaudio', color: '#e8b04f', values: levels(stemWeb, SR, HOP) },
    { name: 'beds', color: '#a77fe8', values: levels(stem('beds'), SR, HOP) },
    { name: 'mix', color: '#9ad47a', values: levels(loadMono(manifest.out), SR, HOP) },
  ],
  shots: shotMarks,
  speech: heard.map((x) => ({ start: x.start, end: x.end, who: x.presenter || (x.ad ? 'VO' : x.slot || '?') })),
  cues: cues.map((c) => ({ t: rel(c.t), label: `${c.moment}${c.opts.emotion && c.opts.emotion !== 'neutral' ? `(${c.opts.emotion})` : ''}` })).filter((c) => c.t >= 0 && c.t <= seconds),
  quiet: manifest.quiet,
});
const audioPath = OUT.replace(/\.mp4$/i, '') + '-audio.png';
fs.writeFileSync(audioPath, Buffer.from(audioUrl.split(',')[1], 'base64'));
await sheetPage.close();
await browser.close();

const timeline = {
  meta: {
    url, out: OUT, fps: FPS, seconds, frames, sampleRate: SR, start: opts.start, until: opts.until, music: opts.music,
    recordedAt: new Date().toISOString(), wallClockStart: new Date(T0 + (R ?? 0)).toISOString(), voiceCache: CACHE,
    voicePresets: presets.file, realSeconds: (Date.now() - t0Real) / 1000,
  },
  speech: speech.map(({ clip, ...s }) => ({ ...s, clip: clip ? path.basename(clip) : null })),
  music: cues.map((c) => ({ t: rel(c.t), moment: c.moment, opts: c.opts, why: c.why })),
  events,
  reports: { mix: mixReport, sync, synth: synthStats, page: pageStats, webaudio: rendered, beds: bedsInfo, pageErrors: pageErrors.slice(0, 50) },
};
const timelinePath = OUT.replace(/\.mp4$/i, '') + '-timeline.json';
fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 1));
if (!opts.keep) {
  for (const f of ['webaudio.f32', 'beds.f32', 'beds-dry.f32', 'mix-raw.wav']) fs.rmSync(path.join(WORK, f), { force: true });
}
say(`done in ${elapsed()}: ${OUT}`);
say(`sheet ${sheetPath}`);
say(`audio picture ${audioPath}`);
say(`timeline ${timelinePath}`);
say(`loudness ${mixReport.final?.I} LUFS, TP ${mixReport.final?.TP} dBTP, LRA ${mixReport.final?.LRA} LU; bed duck ${JSON.stringify(mixReport.bedDuckDb)}`);
say(`sync ${JSON.stringify(sync.summary)}`);
if (pageErrors.length) say(`${pageErrors.length} page errors, first: ${pageErrors.slice(0, 3).join(' | ')}`);
