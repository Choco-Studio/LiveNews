#!/usr/bin/env node
// The playout of pre-rendered playout (docs/publishing/playout.md §4-5): the programmes the renderer queued
// (tools/playout/render.mjs, <dir>/queue/), aired back to back at the times baked into them, through ONE long-lived
// ffmpeg. The video is copied, never re-encoded (every file has the same H.264 settings, server/playout/encode.js,
// and starts on an IDR frame, so the raw streams join byte to byte); the sound arrives as PCM and is encoded to AAC
// once, continuously, so the joins carry no gap and picture and sound never drift (each file holds exactly 1600
// samples a frame). When nothing is queued for the moment on air, never black: the filler card (BACK SHORTLY) under a
// quiet bed, until the next programme's time, where the schedule is joined again; every underrun is logged.
//
// Files only by default (a test; nothing leaves the machine):
//   node tools/playout/air.mjs --out data/playout/air/air-%03d.ts --segment 3600 [--dir data/playout] [--for <s>]
//   node tools/playout/air.mjs --out /tmp/air-{n}.flv
// On air (the owner's guide, docs/publishing/setup.md §8; refused unless PUBLISH_LIVE=1, as tools/publish/live.mjs):
//   PUBLISH_LIVE=1 node tools/playout/air.mjs --rtmp rtmp://a.rtmp.youtube.com/live2 --key-env YOUTUBE_STREAM_KEY
//
// The live video's title follows what is on air, truthfully (no LIVE: server/publish/live.js recorded titles), through
// the live supervisor's rate limits, as a dry run unless every live switch is on (publisher rules, unchanged).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PlayoutStore, planAir, PLAYOUT_DEFAULTS, samplesOf, endOf } from '../../server/playout/queue.js';
import { airVideoArgs, scaleFilter, AIR_DEFAULTS } from '../../server/playout/encode.js';
import { LiveSupervisor } from '../../server/publish/live.js';
import { YouTubeAdapter } from '../../server/publish/adapters/youtube.js';
import { PublishQueue } from '../../server/publish/queue.js';
import { usingStub } from '../../server/publish/compliance.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const DIR = path.resolve(opt('dir', process.env.PLAYOUT_DIR || path.join(root, 'data', 'playout')));
const out = opt('out');
const rtmp = opt('rtmp');
const SEGMENT = Number(opt('segment', 0));
const FOR = Number(opt('for', 0));
const FPS = AIR_DEFAULTS.fps;
const RATE = AIR_DEFAULTS.audioRate;
if (!out && !rtmp) {
  console.error('usage: node tools/playout/air.mjs (--out <file> [--segment <s>] | --rtmp <server> --key-env <VAR>) [--dir data/playout] [--for s]');
  process.exit(1);
}
if (rtmp && process.env.PUBLISH_LIVE !== '1') {
  console.error('refused: streaming to a server needs PUBLISH_LIVE=1 (docs/publishing/setup.md §8). Test with --out first.');
  process.exit(1);
}
let target = out ? path.resolve(out) : null;
if (rtmp) {
  const key = process.env[opt('key-env', 'YOUTUBE_STREAM_KEY')];
  if (!key) {
    console.error(`the stream key is read from an environment variable: --key-env <VAR> and ${opt('key-env', 'YOUTUBE_STREAM_KEY')} set`);
    process.exit(1);
  }
  target = `${String(rtmp).replace(/\/$/, '')}/${key}`;
}
const store = new PlayoutStore(DIR);
const say = (m) => console.log(`[air ${new Date().toISOString().slice(11, 19)}] ${m}`);
const frameMs = 1000 / FPS;

// ---------------------------------------------------------------- the title (dry run unless every switch is on)

const pq = new PublishQueue({ dir: path.join(root, 'data', 'publish') });
const s = pq.settings();
const live = !!rtmp && process.env.PUBLISH_LIVE === '1' && s.dryRun === false && !!s.live?.youtube && !usingStub;
const titles = new LiveSupervisor({ youtube: new YouTubeAdapter({ env: process.env, dryRun: !live }), live, recorded: true, videoId: process.env.YOUTUBE_LIVE_VIDEO_ID || null, outbox: path.join(root, 'data', 'publish', 'outbox-live.jsonl'), log: (m) => say(m) });

// ---------------------------------------------------------------- the filler (encoded with the programmes' settings)

/** The air settings of what is queued (the filler matches them), else the defaults. */
function airSettings() {
  const q = store.queued()[0] || store.airedList().at(-1);
  return { size: q?.size || opt('size', AIR_DEFAULTS.size), bitrate: q?.bitrate || opt('bitrate', AIR_DEFAULTS.bitrate), preset: q?.preset || opt('preset', AIR_DEFAULTS.preset) };
}
const fillerPng = () => {
  const f = path.join(DIR, 'filler.png');
  if (fs.existsSync(f)) return f;
  // (before the renderer has drawn the card: a plain one from ffmpeg, the channel's ink with nothing on it)
  const plain = path.join(DIR, 'filler-plain.png');
  if (!fs.existsSync(plain)) spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0d1020:s=384x216', '-frames:v', '1', plain]);
  return plain;
};
const granuleCache = new Map();
/** `frames` of the filler card as a raw H.264 stream (an IDR first, the programmes' settings). */
function fillerVideo(frames) {
  const st = airSettings();
  const png = fillerPng();
  const key = `${frames}|${st.size}|${st.bitrate}|${st.preset}|${png}|${fs.statSync(png).mtimeMs}`;
  if (granuleCache.has(key)) return granuleCache.get(key);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-loop', '1', '-framerate', String(FPS), '-i', png, '-frames:v', String(frames), '-vf', scaleFilter({ size: st.size }), ...airVideoArgs({ size: st.size, bitrate: st.bitrate, fps: FPS, preset: st.preset }), '-an', '-f', 'h264', 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`filler: ${String(r.stderr).slice(-400)}`);
  if (frames === FPS * PLAYOUT_DEFAULTS.granuleSeconds) granuleCache.set(key, r.stdout);
  return r.stdout;
}
let padAt = 0; // samples of pad played so far (the bed's phase runs on across fillers)
/**
 * The quiet bed under the filler card: three soft sines breathing slowly, about -30 dBFS, as 16-bit stereo PCM. It
 * fades in at the start of a filler run (`fadeIn`) and out before the programme it leads to (`fadeOut`), half a second.
 */
function fillerAudio(frames, { fadeIn = false, fadeOut = false } = {}) {
  const n = samplesOf(frames, FPS, RATE);
  const buf = Buffer.alloc(n * 4);
  const F = Math.min(n, RATE / 2);
  for (let i = 0; i < n; i++) {
    const t = (padAt + i) / RATE;
    const breathe = 0.65 + 0.35 * Math.sin(2 * Math.PI * 0.08 * t);
    let g = 1;
    if (fadeIn && i < F) g *= i / F;
    if (fadeOut && i >= n - F) g *= (n - 1 - i) / F;
    const v = g * 0.022 * breathe * (Math.sin(2 * Math.PI * 110 * t) + 0.55 * Math.sin(2 * Math.PI * 164.81 * t) + 0.35 * Math.sin(2 * Math.PI * 220 * t));
    const x = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
    buf.writeInt16LE(x, i * 4);
    buf.writeInt16LE(x, i * 4 + 2);
  }
  padAt += n;
  return buf;
}

// ---------------------------------------------------------------- the one ffmpeg

let run = 0;
let air = null;
function startAir() {
  run++;
  const outArgs = [];
  if (rtmp) outArgs.push('-f', 'flv', target);
  else {
    const file = target.replace('{n}', String(run));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const ext = path.extname(file).slice(1).toLowerCase();
    const fmt = { flv: 'flv', ts: 'mpegts', mkv: 'matroska', mp4: 'mp4' }[ext] || 'mpegts';
    if (SEGMENT > 0) outArgs.push('-f', 'segment', '-segment_time', String(SEGMENT), '-segment_format', fmt, '-reset_timestamps', '1', ...(fmt === 'mp4' ? ['-segment_format_options', 'movflags=+frag_keyframe+empty_moov'] : []), file);
    else outArgs.push(...(fmt === 'mp4' ? ['-movflags', '+frag_keyframe+empty_moov'] : []), '-f', fmt, file);
  }
  const argv = ['-hide_banner', '-loglevel', 'warning', '-y',
    '-re', '-thread_queue_size', '256', '-fflags', '+genpts', '-f', 'h264', '-framerate', String(FPS), '-i', 'pipe:0',
    '-re', '-thread_queue_size', '256', '-f', 's16le', '-ar', String(RATE), '-ac', '2', '-i', 'pipe:3',
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', AIR_DEFAULTS.audioBitrate, '-ar', String(RATE), '-ac', '2',
    ...outArgs];
  const p = spawn('ffmpeg', argv, { stdio: ['pipe', 'ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => {
    err = (err + d).slice(-2000);
    const line = String(d).trim();
    if (line && !/Guessed Channel Layout/.test(line)) say(`ffmpeg: ${line.replace(target, rtmp ? `${rtmp}/<key>` : target).slice(0, 300)}`);
  });
  p.stdin.on('error', () => {});
  p.stdio[3].on('error', () => {});
  air = { p, v: p.stdin, a: p.stdio[3], dead: false, err };
  p.on('exit', (code) => {
    air.dead = true;
    say(`ffmpeg ended (${code})`);
  });
  say(`→ ${rtmp ? `${rtmp}/<key>` : target.replace('{n}', String(run))}${SEGMENT ? ` in ${SEGMENT} s files` : ''}`);
  return air;
}

function write(stream, buf) {
  return new Promise((resolve) => {
    if (air.dead) return resolve(false);
    if (stream.write(buf)) return resolve(true);
    const t = setInterval(() => {
      if (air.dead) {
        clearInterval(t);
        resolve(false);
      }
    }, 1000);
    stream.once('drain', () => {
      clearInterval(t);
      resolve(true);
    });
  });
}
function pump(src, dest) {
  return new Promise((resolve, reject) => {
    src.on('data', async (d) => {
      src.pause();
      const ok = await write(dest, d);
      if (!ok) {
        src.destroy();
        resolve(false);
        return;
      }
      src.resume();
    });
    src.on('end', () => resolve(true));
    src.on('error', reject);
  });
}

/** One queued file into the two pipes: its video copied as Annex B, its sound decoded to PCM. */
async function airSegment(seg) {
  const v = spawn('ffmpeg', ['-v', 'error', '-i', seg.file, '-map', '0:v', '-c:v', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'h264', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const a = spawn('ffmpeg', ['-v', 'error', '-i', seg.file, '-map', '0:a', '-f', 's16le', '-ar', String(RATE), '-ac', '2', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const [okV, okA] = await Promise.all([pump(v.stdout, air.v), pump(a.stdout, air.a)]);
  return okV && okA;
}

// ---------------------------------------------------------------- the loop

const started = Date.now();
let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));
const stats = { segments: 0, fillerSeconds: 0, underruns: 0, underrunSeconds: 0, gaps: 0, dropped: 0, restarts: 0 };
let underrunSince = null;
let onAir = null;
startAir();
// the playhead: the air time of the next frame written (the stream's time since it started, from a whole second)
let playhead = Math.ceil(Date.now() / 1000) * 1000;
say(`playout from ${new Date(playhead).toISOString()} · ${DIR}`);
store.event('air-start', { run, playhead: new Date(playhead).toISOString(), out: rtmp ? null : target, segment: SEGMENT || null });

function status() {
  store.status('air', { pid: process.pid, run, onAir, playhead: new Date(playhead).toISOString(), ahead: +((playhead - Date.now()) / 1000).toFixed(1), queued: store.queued().length, bufferMinutes: +(store.queued().reduce((n, q) => n + Math.max(0, endOf(q) - Math.max(q.airAt, Date.now())), 0) / 60000).toFixed(1), stats, out: rtmp ? `${rtmp}/<key>` : target, live, title: titles.title });
}

while (!stopping) {
  if (FOR > 0 && Date.now() - started > FOR * 1000) break;
  if (air.dead) {
    // a dead encoder (an RTMP drop): a new one from now on; what should have aired meanwhile is skipped, the schedule
    // is joined again at the next programme's time
    stats.restarts++;
    store.event('air-restart', { run, at: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 2000));
    startAir();
    playhead = Math.ceil(Date.now() / 1000) * 1000;
    store.event('air-start', { run, playhead: new Date(playhead).toISOString(), out: rtmp ? null : target, segment: SEGMENT || null });
  }
  const step = planAir(store.queued(), playhead, { fps: FPS });
  if (step.type === 'drop') {
    stats.dropped++;
    store.aired(step.seg, { dropped: true, late: step.late, at: new Date().toISOString() });
    store.event('drop', { id: step.seg.id, title: step.seg.title, late: +step.late.toFixed(2), why: 'its time on air had passed: its clock would be wrong' });
    say(`dropped ${step.seg.title} (${step.late.toFixed(1)} s late)`);
    continue;
  }
  if (step.type === 'filler') {
    const secs = step.frames / FPS;
    if (step.reason === 'underrun') {
      if (underrunSince === null) {
        underrunSince = playhead;
        stats.underruns++;
        store.event('underrun', { at: new Date(playhead).toISOString(), why: 'nothing queued for the moment on air: filler until the next programme' });
        say('UNDERRUN: nothing queued; filler on air');
      }
      stats.underrunSeconds += secs;
    } else {
      if (underrunSince !== null) {
        store.event('underrun-end', { from: new Date(underrunSince).toISOString(), to: new Date(playhead).toISOString(), seconds: +((playhead - underrunSince) / 1000).toFixed(1) });
        underrunSince = null;
      }
      stats.gaps++;
      store.event('filler', { from: new Date(playhead).toISOString(), until: new Date(step.until).toISOString(), seconds: +secs.toFixed(2), next: step.next });
      say(`filler ${secs.toFixed(1)} s until ${new Date(step.until).toISOString().slice(11, 19)}`);
    }
    const runStart = onAir?.kind !== 'filler';
    if (runStart) onAir = { kind: 'filler', title: 'BACK SHORTLY', since: new Date(playhead).toISOString() };
    status();
    // the card in whole granules (cached) and the remainder, the bed under it (faded in at the start of the run, out
    // before the programme a gap leads to)
    const G = FPS * PLAYOUT_DEFAULTS.granuleSeconds;
    let left = step.frames;
    let first = runStart;
    while (left > 0 && !air.dead) {
      // (never far ahead of the clock: a programme queued meanwhile joins at its time, not after a long filler)
      while (playhead - Date.now() > 3000 && !air.dead && !stopping) await new Promise((r) => setTimeout(r, 200));
      const n = left >= G ? G : left;
      const last = step.reason === 'gap' && left - n <= 0;
      const [okV, okA] = await Promise.all([write(air.v, fillerVideo(n)), write(air.a, fillerAudio(n, { fadeIn: first, fadeOut: last }))]);
      first = false;
      if (!okV || !okA) break;
      left -= n;
      playhead += n * frameMs;
    }
    stats.fillerSeconds += secs;
    continue;
  }
  // a programme (or a break) at its time
  const seg = step.seg;
  if (underrunSince !== null) {
    store.event('underrun-end', { from: new Date(underrunSince).toISOString(), to: new Date(playhead).toISOString(), seconds: +((playhead - underrunSince) / 1000).toFixed(1) });
    underrunSince = null;
  }
  if (!fs.existsSync(seg.file)) {
    store.aired(seg, { dropped: true, missing: true });
    store.event('drop', { id: seg.id, why: 'its file is missing' });
    continue;
  }
  onAir = { kind: seg.kind, id: seg.id, title: seg.title, programId: seg.programId, airAt: new Date(seg.airAt).toISOString(), offset: +(step.offset || 0).toFixed(3) };
  status();
  if (seg.kind === 'episode') {
    const next = store.queued().filter((q) => q.kind === 'episode' && q.airAt > seg.airAt).slice(0, 3).map((q) => ({ title: q.title }));
    titles.onSchedule({ now: { kind: 'episode', id: seg.itemId, title: seg.title }, upcoming: next }).catch?.(() => {});
  }
  store.event('air', { id: seg.id, title: seg.title, airAt: new Date(seg.airAt).toISOString(), playhead: new Date(playhead).toISOString(), offset: +(step.offset || 0).toFixed(3) });
  const ok = await airSegment(seg);
  if (!ok) continue; // the encoder died mid-file: the restart above joins the schedule again
  stats.segments++;
  store.aired(seg, { airedAt: new Date(playhead).toISOString(), realAt: new Date().toISOString() });
  playhead += seg.frames * frameMs;
}
status();
try {
  air.v.end();
  air.a.end();
} catch {
  /* gone */
}
await new Promise((r) => (air.dead ? r() : air.p.once('exit', r)));
say(`stopped: ${stats.segments} files aired, ${stats.fillerSeconds.toFixed(0)} s of filler, ${stats.underruns} underruns, ${stats.dropped} dropped`);
process.exit(0);
