#!/usr/bin/env node
// Deterministic video recorder WITH SOUND. Freezes the page clock (Date,
// timers, performance.now, requestAnimationFrame) with Playwright's fake
// clock, then advances it 1/fps per frame (in whole milliseconds, never
// drifting: the clock rounds fractions up) and grabs the #screen canvas. The video is perfectly smooth however loaded the machine is (live
// screen recording drops frames). Frames are upscaled with nearest neighbour
// so pixels stay crisp and encoded to H.264; the sound is muxed as AAC.
//
//   node tools/record.mjs --url "http://127.0.0.1:8080/?autostart=1&voice=tts" \
//     --seconds 30 [--skip 0] [--fps 30] [--scale 5] --out /tmp/clip.mp4
//
// Sound: an init script replaces window.AudioContext by an OfflineAudioContext
// subclass whose currentTime follows the fake clock and whose state is always
// 'running' (resume/suspend/close resolve at once). Everything the channel
// schedules (recorded voices, themes, stingers, ad beds, music beds, ducking)
// lands on the offline timeline at the fake time it was asked for, and is
// rendered after the last frame. Offline, two WebAudio habits need help:
// `param.value = v` would apply from t = 0, so it becomes setValueAtTime(v, now)
// (and reading `param.value` evaluates the automation at now), and
// `node.disconnect()` would remove a node for the whole render, so it is a
// no-op (the channel only disconnects nodes that already stopped), and a
// source's 'ended' event (offline it only fires during the final render) is
// fired by a fake-clock timer when its sound stops, so code that waits for a
// voice clip to end carries on at the right moment. While a
// fetch, an image or an audio decode is in flight the clock is held, so replies
// land at the fake time they were asked for (network looks instant, runs
// repeat). Math.random is seeded (--seed) so the director's choices repeat too.
//
// --skip     seconds of channel time to run (fast, not recorded) before recording
// --eval     optional JS run once after load (e.g. window.__lab.set({ demo: 'rig' }))
// --step     optional JS run before each frame with T = time since recording started,
//            for lab pages that render a given instant (no clock, no sound)
// --no-audio picture only (as before)
// --rate     audio sample rate (48000)
// --seed     Math.random seed (default 1; 'off' keeps the real one)
// --time     wall-clock time the page sees at start (ISO; default now)
// --report   write events, loudness and A/V sync measurements to this JSON file
// --wav      keep the rendered sound as this WAV file
// --item     a saved episode/break JSON served for the page's first /api/next (re-record
//            the same item; nothing advances the channel for it)
// --trace    the director's timeline in the report: every music cue and countdown, the pace trace and the quiz trace
// --progressive  render the sound while the frames are taken, two seconds at a time and always a second
//            behind the page's clock (OfflineAudioContext suspend/resume), instead of all at the end: a busy
//            music bed over several minutes renders in minutes, not an hour; the same sound
// --lossless a master for the publishing desk (tools/publish): the frames as they are, lossless RGB H.264 (libx264rgb,
//            crf 0) in an .mkv, no chroma subsampling, --scale applied by nearest neighbour as ever (1: the page's own
//            pixels); the clips are cut, titled and scaled from it, so nothing is ever encoded twice lossily

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pageInit, writeWav } from './recorder/page.mjs';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node-tools/node_modules/playwright/index.mjs');
  }
}

const opts = { seconds: 10, skip: 0, fps: 30, scale: 5, selector: '#screen', rate: 48000, seed: '1' };
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
for (const k of ['seconds', 'skip', 'fps', 'scale', 'rate']) opts[k] = Number(opts[k]);
if (!opts.url || !opts.out) {
  console.error('usage: node tools/record.mjs --url <url> --out <file.mp4> [--seconds n] [--skip n] [--fps n] [--scale n] [--step js] [--no-audio] [--report f.json]');
  process.exit(1);
}
const withAudio = !opts['no-audio'] && !opts.step;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => process.stdout.write(`${m}\n`);

// --------------------------------------------------------------- node side

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const seed = opts.seed === 'off' ? null : Number(opts.seed) || 1;
const maxSeconds = 2 + opts.skip + opts.seconds + 8;
if (!opts.step) {
  await page.addInitScript(pageInit, { audio: withAudio, sampleRate: opts.rate, maxSeconds, seed, progressive: !!opts.progressive, chunk: 2, margin: 1, trace: !!opts.trace });
  // Hand the channel's AudioEngine and Director to the instrumentation (recorder only;
  // the product code is untouched). main.js keeps them as top-level `audio` and `player`.
  await page.route(/\/js\/main\.js(\?.*)?$/, async (route) => {
    const res = await route.fetch();
    const hook = "\ntry { window.__recHook?.({ audio: typeof audio !== 'undefined' ? audio : null, director: typeof player !== 'undefined' ? player : null, renderer: typeof renderer !== 'undefined' ? renderer : null }); } catch (e) { /* recorder hook */ }\n";
    const body = `${await res.text()}${hook}`;
    await route.fulfill({ response: res, body, headers: { ...res.headers(), 'cache-control': 'no-store', 'content-length': String(Buffer.byteLength(body)) } });
  });
  if (opts.item) {
    const item = fs.readFileSync(opts.item, 'utf8');
    let served = false;
    await page.route(/\/api\/next(\?.*)?$/, async (route) => {
      if (served) return route.continue();
      served = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: item });
    });
  }
  const T0 = opts.time ? new Date(opts.time).getTime() : Math.floor(Date.now() / 1000) * 1000;
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
}
await page.goto(opts.url, { waitUntil: 'load' });
if (opts.eval) await page.evaluate(opts.eval); // e.g. pick a demo in a lab page

const frameMs = 1000 / opts.fps;
let stepped = 0; // fake ms advanced since the first frame was asked for
let held = 0;
let stuck = 0; // work in flight that never finished (a hung request): not waited for again
// Wait (real time) for fetches, images and decodes in flight, so they land at
// the fake time they were asked for.
async function settle(cap = 8000) {
  const t = Date.now();
  for (;;) {
    const n = await page.evaluate(() => window.__rec?.inflight ?? 0);
    if (n < stuck) stuck = n;
    if (n <= stuck) return;
    if (Date.now() - t > cap) {
      held++;
      stuck = n;
      return;
    }
    await sleep(4);
  }
}
async function advance(ms) {
  if (opts.step) return;
  await settle();
  await page.clock.runFor(ms);
  await new Promise((r) => setImmediate(r));
  if (opts.progressive && withAudio) await page.evaluate(() => window.__rec?.pump?.());
}
async function runFake(seconds) {
  const steps = Math.round((seconds * 1000) / 50);
  for (let i = 0; i < steps; i++) await advance(50);
}
await runFake(1 + opts.skip);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-'));
const total = Math.round(opts.seconds * opts.fps);
const perfs = []; // fake performance.now() at each captured frame
const sigs = []; // 64x36 luma of each frame, for the sync report
const scenes = []; // what the director had on screen at each frame (caption, shot)
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  if (opts.step) await page.evaluate(String(opts.step).replace(/\bT\b/g, String(i / opts.fps)));
  else {
    // Whole milliseconds: Playwright's clock rounds a fractional runFor() UP
    // (30 x runFor(33.3) = 1020 ms), which would run the page 2 % faster than
    // the video and the sound. Stepping to round((i + 1) * frameMs) keeps every
    // frame within 0.5 ms of its true time.
    const want = Math.round((i + 1) * frameMs);
    await advance(want - stepped);
    stepped = want;
  }
  const shot = await page.evaluate((sel) => {
    const c = document.querySelector(sel);
    if (!c) return null;
    const g = (window.__recSig ||= Object.assign(document.createElement('canvas'), { width: 64, height: 36 })).getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.drawImage(c, 0, 0, 64, 36);
    const d = g.getImageData(0, 0, 64, 36).data;
    let sig = '';
    for (let k = 0; k < d.length; k += 4) sig += String.fromCharCode(Math.round(d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11));
    const sc = window.__rec?.director?.scene;
    // (the LATEST band's item on screen: the ticker's own words, for a check of what scrolls under a programme)
    const tk = window.__rec?.renderer?.graphics?.ticker?.cur;
    return { url: c.toDataURL('image/png'), perf: performance.now(), sig: btoa(sig), sub: sc?.subtitle ?? null, shot: sc?.shot ?? null, tick: tk ? String(tk.base ?? tk.text ?? '') : null };
  }, opts.selector);
  if (!shot) throw new Error(`no canvas matches ${opts.selector}`);
  perfs.push(shot.perf);
  sigs.push(Buffer.from(shot.sig, 'base64'));
  scenes.push({ sub: shot.sub, shot: shot.shot, tick: shot.tick });
  fs.writeFileSync(path.join(dir, `f${String(i).padStart(6, '0')}.png`), Buffer.from(shot.url.split(',')[1], 'base64'));
  if (i % (opts.fps * 10) === 0) {
    // (with --progressive, how far the sound has rendered: seconds of each context's timeline)
    const done = opts.progressive && withAudio ? await page.evaluate(() => (window.__rec?.contexts || []).map((c) => Math.round(c.__done || 0))) : null;
    process.stdout.write(`  ${Math.round((i / total) * 100)}%${done?.length ? ` (sound rendered to ${done.join(', ')} s)` : ''}\r`);
  }
}
say(`${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s${held ? ` (${held} steps did not wait for slow network)` : ''}`);

// ---------------------------------------------------------------- sound
let wavFile = null;
let audioInfo = null;
let events = [];
let traces = null; // --trace: { pace, quiz }
let samples = null; // mono mix for the report
if (withAudio) {
  // Frame i shows the page at fake time perfs[i]; it is displayed from i/fps on.
  const from = perfs[0];
  const to = from + total * frameMs;
  audioInfo = await page.evaluate(([a, b]) => (window.__rec?.render ? window.__rec.render(a, b) : null), [from, to]);
  events = await page.evaluate(() => (window.__rec?.events || []).filter((e) => e.type !== 'audioContext'));
  const hooked = await page.evaluate(() => ({ hooked: !!window.__rec?.hooked, error: window.__rec?.hookError || null, contexts: window.__rec?.contexts?.length ?? 0 }));
  if (!audioInfo || !hooked.contexts) say('  no AudioContext was created by the page: silent track');
  if (!hooked.hooked) say(`  instrumentation not attached${hooked.error ? `: ${hooked.error}` : ''} (no sync report)`);
  const n = audioInfo?.n ?? Math.round((total / opts.fps) * opts.rate);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  if (audioInfo) {
    const CH = 1 << 19;
    for (let ch = 0; ch < 2; ch++) {
      for (let off = 0; off < n; off += CH) {
        const count = Math.min(CH, n - off);
        const b = Buffer.from(await page.evaluate(([c, o, k]) => window.__rec.chunk(c, o, k), [ch, off, count]), 'base64');
        (ch ? R : L).set(new Float32Array(b.buffer, b.byteOffset, count), off);
      }
    }
  }
  wavFile = opts.wav || path.join(dir, 'audio.wav');
  writeWav(wavFile, [L, R], opts.rate);
  samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = (L[i] + R[i]) / 2;
  for (const e of events) e.v = (e.t - from) / 1000; // video time of each event
  for (const e of events) if (e.type === 'clip' || e.type === 'sfx') e.va = ((e.type === 'clip' ? e.at : e.startAt) - from) / 1000;
  for (const e of events) if (e.type === 'music' && e.endsAt !== null) e.endsAtV = (e.endsAt - from) / 1000;
  if (opts.trace) {
    // --trace: the pace trace (ms) and the quiz director's trace (s, its T0 / end / planned likewise) in video time
    const raw = await page.evaluate(() => ({ pace: window.__sc?.log || [], quiz: window.__rec?.director?.quizTrace || [] })).catch(() => ({ pace: [], quiz: [] }));
    const secs = new Set(['t', 'T0', 'end', 'planned']);
    traces = {
      pace: raw.pace.map((e) => ({ ...e, v: (e.t - from) / 1000 })),
      quiz: raw.quiz.map((e) => Object.fromEntries(Object.entries(e).map(([k, x]) => [secs.has(k) && Number.isFinite(x) ? `${k}V` : k, secs.has(k) && Number.isFinite(x) ? x - from / 1000 : x]))),
    };
  }
}
await browser.close();


const args = ['-v', 'error', '-y', '-framerate', String(opts.fps), '-i', path.join(dir, 'f%06d.png')];
if (wavFile) args.push('-i', wavFile);
if (opts.lossless) args.push(...(opts.scale !== 1 ? ['-vf', `scale=iw*${opts.scale}:ih*${opts.scale}:flags=neighbor`] : []), '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'veryfast', '-pix_fmt', 'rgb24');
else args.push('-vf', `scale=iw*${opts.scale}:ih*${opts.scale}:flags=neighbor`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium');
if (wavFile) args.push(...(opts.lossless ? ['-c:a', 'flac'] : ['-c:a', 'aac', '-b:a', '192k']), '-ar', '48000', '-map', '0:v', '-map', '1:a');
args.push(...(opts.lossless ? [] : ['-movflags', '+faststart']), opts.out);
await new Promise((resolve, reject) => {
  const ff = spawn('ffmpeg', args, { stdio: 'inherit' });
  ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
});

// ---------------------------------------------------------------- report
let report = null;
if (withAudio && samples) report = buildReport();
if (opts.report && report) fs.writeFileSync(opts.report, JSON.stringify(report, null, 1));
if (!opts.wav) fs.rmSync(dir, { recursive: true, force: true });
else {
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.png')) fs.rmSync(path.join(dir, f));
}
say(`${total} frames @ ${opts.fps} fps${withAudio ? ' + sound' : ''} -> ${opts.out}${errors.length ? ` (${errors.length} page errors: ${errors.slice(0, 3).join(' | ')})` : ''}`);
if (report) {
  const l = report.loudness;
  say(`  sound: ${l ? `${l.lufs} LUFS integrated, true peak ${l.truePeak} dBTP, ` : ''}${report.speech.recorded} recorded-voice sentences, ${report.speech.browser} browser/silent`);
  const clips = report.speech.clips;
  const mute = clips.filter((c) => !c.audible);
  if (clips.length) say(`  voice clips: ${clips.length} started, ${clips.length - mute.length} audible${mute.length ? ` — SILENT at ${mute.map((c) => `${c.at.toFixed(2)}s`).join(', ')}` : ''}`);
  for (const s of report.sync.slice(0, 8)) say(`  sync ${s.kind.padEnd(8)} @${s.at.toFixed(2)}s  audio ${fmt(s.audioMs)}  picture ${fmt(s.pictureMs)}  ${s.label}`);
}

function fmt(ms) {
  return ms === null || ms === undefined ? '   n/a ' : `${ms >= 0 ? '+' : ''}${Math.round(ms)} ms`.padStart(7);
}

// Loudness by ffmpeg (EBU R128), the onset of sound near each scheduled
// cue / voice, and the first picture change near the same moment.
function buildReport() {
  const sr = opts.rate;
  let loud = null;
  try {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', opts.out, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
    const txt = r.stderr || '';
    const I = /I:\s+(-?[\d.]+) LUFS/.exec(txt.slice(txt.lastIndexOf('Summary')));
    const P = /Peak:\s+(-?[\d.]+) dBFS/.exec(txt.slice(txt.lastIndexOf('Summary')));
    loud = { lufs: I ? Number(I[1]) : null, truePeak: P ? Number(P[1]) : null };
  } catch { /* no ffmpeg */ }
  // 10 ms RMS (dBFS) of the mix
  const hop = Math.round(sr / 100);
  const rms = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let s = 0;
    for (let k = i; k < i + hop; k++) s += samples[k] * samples[k];
    rms.push(10 * Math.log10(s / hop + 1e-12));
  }
  // Sound onset: first 10 ms frame within [-60, +250] ms of `at` whose level
  // jumps 12 dB over the 100 ms before it (or above -45 dBFS from near silence).
  const onset = (at) => {
    const c = Math.round(at * 100);
    for (let f = Math.max(10, c - 6); f <= Math.min(rms.length - 1, c + 25); f++) {
      let base = -120;
      for (let k = f - 10; k < f; k++) base = Math.max(base, rms[k]);
      if (rms[f] > base + 12 || (base < -55 && rms[f] > -45)) return (f - at * 100) * 10;
    }
    return null;
  };
  // Picture change for a cue: the first frame within [-2, +8] frames of `at`
  // whose difference to the previous frame stands out of the ongoing motion.
  const diffs = sigs.map((s, i) => {
    if (!i) return 0;
    let d = 0;
    for (let k = 0; k < s.length; k++) d += Math.abs(s[k] - sigs[i - 1][k]);
    return d / s.length;
  });
  const change = (at) => {
    const c = Math.round(at * opts.fps);
    for (let f = Math.max(1, c - 2); f <= Math.min(diffs.length - 1, c + 8); f++) {
      const prev = diffs.slice(Math.max(1, f - 30), f).sort((x, y) => x - y);
      const typical = prev.length ? prev[prev.length >> 1] : 0;
      if (diffs[f] > Math.max(1.5, typical * 4)) return (f / opts.fps - at) * 1000;
    }
    return null;
  };
  // Caption on the picture: the first frame whose caption is this sentence.
  const captionAt = (text, at) => {
    const c = Math.round(at * opts.fps);
    const key = String(text).slice(0, 24);
    for (let f = Math.max(0, c - 15); f <= Math.min(scenes.length - 1, c + 15); f++) {
      if (scenes[f].sub && String(scenes[f].sub).startsWith(key) && !(f > 0 && scenes[f - 1].sub && String(scenes[f - 1].sub).startsWith(key))) return (f / opts.fps - at) * 1000;
    }
    return null;
  };
  // the LATEST band's items as they were on screen: [{ text, from, to }] in video seconds
  const tickerRuns = () => {
    const out = [];
    scenes.forEach((x, f) => {
      const last = out[out.length - 1];
      if (x.tick && last && last.text === x.tick && last.to >= (f - 1) / opts.fps - 1e-6) last.to = f / opts.fps;
      else if (x.tick) out.push({ text: x.tick, from: f / opts.fps, to: f / opts.fps });
    });
    return out;
  };
  const sync = [];
  for (const e of events) {
    if (e.type === 'sfx' && e.va >= 0.1 && e.va < opts.seconds - 0.3) sync.push({ kind: 'sfx', at: e.va, label: e.name, audioMs: onset(e.va), pictureMs: change(e.va) });
    if (e.type === 'sentence' && e.recorded && e.v >= 0.1 && e.v < opts.seconds - 0.3) sync.push({ kind: 'caption', at: e.v, label: `${e.slot}: "${e.text}"`, audioMs: onset(e.v), pictureMs: captionAt(e.text, e.v) });
  }
  sync.sort((a, b) => a.at - b.at);
  const sentences = events.filter((e) => e.type === 'sentence');
  // Every recorded voice clip that started inside the recording, and whether it
  // is actually HEARD in the mix (mean level over its length): a clip handed to
  // the engine is not proof that it sounded.
  const clips = events
    .filter((e) => e.type === 'clip' && e.va < opts.seconds && e.va + e.duration > 0)
    .map((e) => {
      const a = Math.max(0, Math.round(e.va * 100));
      const b = Math.min(rms.length, Math.round((e.va + e.duration) * 100));
      let sum = 0;
      for (let f = a; f < b; f++) sum += 10 ** (rms[f] / 10);
      const db = b > a ? Math.round(10 * Math.log10(sum / (b - a) + 1e-12) * 10) / 10 : null;
      return { at: Math.round(e.va * 1000) / 1000, duration: e.duration, db, audible: db !== null && db > -40 };
    });
  return {
    out: opts.out,
    seconds: opts.seconds,
    fps: opts.fps,
    loudness: loud,
    audio: audioInfo,
    speech: { recorded: sentences.filter((e) => e.recorded).length, browser: sentences.filter((e) => !e.recorded).length, clips },
    events: events.map(({ t, ...e }) => e),
    sync,
    ticker: tickerRuns(),
    ...(traces ? { trace: traces } : {}),
  };
}
