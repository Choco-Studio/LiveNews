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
// The vertical live (render.mjs --vertical queues it in <dir>/vertical: docs/publishing/playout.md §13), a second
// playout beside the first, to its own stream key and its own live video's title:
//   PUBLISH_LIVE=1 node tools/playout/air.mjs --dir data/playout/vertical --rtmp rtmp://a.rtmp.youtube.com/live2 \
//     --key-env YOUTUBE_VERTICAL_STREAM_KEY --video-env YOUTUBE_VERTICAL_VIDEO_ID
// Several destinations at once (§13.6: YouTube's dual format and TikTok LIVE), by name, the keys from the environment
// (server/playout/destinations.js): one encode, a relay each, each reconnecting on its own:
//   PUBLISH_LIVE=1 node tools/playout/air.mjs --to youtube
//   PUBLISH_LIVE=1 node tools/playout/air.mjs --dir data/playout/vertical --to youtube-vertical,tiktok
// SIGHUP loads the keys again from /etc/globit24.env (GLOBIT_ENV_FILE) and reconnects only the destinations whose
// address changed (TikTok's keys can be temporary); SIGUSR2 (tools/publish/live-rotate.mjs) lets go of the YouTube
// destinations for 75 s and leaves the others on air.
//
// The live video's title follows what is on air, truthfully (no LIVE: server/publish/live.js recorded titles), through
// the live supervisor's rate limits, as a dry run unless every live switch is on (publisher rules, unchanged).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PlayoutStore, planAir, PLAYOUT_DEFAULTS, samplesOf, endOf } from '../../server/playout/queue.js';
import { airVideoArgs, scaleFilter, AIR_DEFAULTS, airSize, parseCrf } from '../../server/playout/encode.js';
import { canvasFor } from '../../server/airsize.js';
import { parseDestinations, relayArgs, redact, envFile, orientationProblems } from '../../server/playout/destinations.js';
import { TsPackets, TsTables, joinAt } from '../../server/playout/ts.js';
import { LiveSupervisor } from '../../server/publish/live.js';
import { YouTubeAdapter } from '../../server/publish/adapters/youtube.js';
import { PublishQueue } from '../../server/publish/queue.js';
import { usingStub } from '../../server/publish/compliance.js';
import { isManual } from '../../server/publish/mode.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const DIR = path.resolve(opt('dir', process.env.PLAYOUT_DIR || path.join(root, 'data', 'playout')));
const out = opt('out');
// (the destinations by name, --to, or one by hand, --rtmp <server> --key-env <VAR>: tests may stream to plain files)
const parsed = parseDestinations(args, process.env, { allowFiles: process.env.AIR_TEST_FILE_DEST === '1' });
let dests = parsed.list;
const streaming = dests.length > 0;
const SEGMENT = Number(opt('segment', 0));
const FOR = Number(opt('for', 0));
const FPS = AIR_DEFAULTS.fps;
const RATE = AIR_DEFAULTS.audioRate;
if (parsed.errors.length) {
  for (const e of parsed.errors) console.error(e);
  process.exit(1);
}
if (!out && !streaming) {
  console.error('usage: node tools/playout/air.mjs (--out <file> [--segment <s>] | --to youtube[,youtube-vertical,tiktok] | --rtmp <server> --key-env <VAR>) [--dir data/playout] [--for s]');
  process.exit(1);
}
// the beta (PUBLISH_MODE=manual) has no live stream, as tools/publish/live.mjs: a test into files only
if (streaming && isManual()) {
  console.error('refused: PUBLISH_MODE=manual (the beta, published by hand) has no live stream (docs/publishing/beta.md). A test into files (--out) is allowed.');
  process.exit(1);
}
if (streaming && process.env.PUBLISH_LIVE !== '1') {
  console.error('refused: streaming to a server needs PUBLISH_LIVE=1 (docs/publishing/setup.md §8). Test with --out first.');
  process.exit(1);
}
const target = out ? path.resolve(out) : null;
const store = new PlayoutStore(DIR);
const say = (m) => console.log(`[air ${new Date().toISOString().slice(11, 19)}] ${m}`);
const frameMs = 1000 / FPS;

// ---------------------------------------------------------------- the title (dry run unless every switch is on)

const pq = new PublishQueue({ dir: path.join(root, 'data', 'publish') });
const s = pq.settings();
const live = streaming && !isManual() && process.env.PUBLISH_LIVE === '1' && s.dryRun === false && !!s.live?.youtube && !usingStub;
// (the vertical live's own video and outbox: --video-env names the variable holding its video id)
const VIDEO_ENV = opt('video-env', 'YOUTUBE_LIVE_VIDEO_ID');
const TAG = VIDEO_ENV === 'YOUTUBE_LIVE_VIDEO_ID' ? '' : `-${VIDEO_ENV.toLowerCase().replace(/^youtube_|_video_id$/g, '').replace(/[^a-z0-9]+/g, '-')}`;
const titles = new LiveSupervisor({ youtube: new YouTubeAdapter({ env: process.env, dryRun: !live }), live, recorded: true, videoId: process.env[VIDEO_ENV] || null, outbox: path.join(root, 'data', 'publish', `outbox-live${TAG}.jsonl`), log: (m) => say(m) });

// ---------------------------------------------------------------- the filler (encoded with the programmes' settings)

/** The air settings of what is queued (the filler matches them), else the defaults. */
function airSettings() {
  const q = store.queued()[0] || store.airedList().at(-1);
  // (nothing queued yet: the size asked, else the renderer's for this queue, render-status.json: portrait for the vertical)
  return { size: airSize(q?.size || opt('size') || store.readStatus('render')?.size || AIR_DEFAULTS.size, () => {}), bitrate: q?.bitrate || opt('bitrate', AIR_DEFAULTS.bitrate), crf: q && 'crf' in q ? q.crf : parseCrf(opt('crf', process.env.PLAYOUT_CRF)), preset: q?.preset || opt('preset', AIR_DEFAULTS.preset) };
}
const fillerPng = () => {
  const f = path.join(DIR, 'filler.png');
  if (fs.existsSync(f)) return f;
  // (before the renderer has drawn the card: a plain one from ffmpeg, the channel's ink with nothing on it)
  const c = canvasFor(airSettings().size);
  const plain = path.join(DIR, `filler-plain-${c.w}x${c.h}.png`);
  if (!fs.existsSync(plain)) spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x0d1020:s=${c.w}x${c.h}`, '-frames:v', '1', plain]);
  return plain;
};
const granuleCache = new Map();
/** `frames` of the filler card as a raw H.264 stream (an IDR first, the programmes' settings). */
function fillerVideo(frames) {
  const st = airSettings();
  const png = fillerPng();
  const key = `${frames}|${st.size}|${st.bitrate}|${st.crf}|${st.preset}|${png}|${fs.statSync(png).mtimeMs}`;
  if (granuleCache.has(key)) return granuleCache.get(key);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-loop', '1', '-framerate', String(FPS), '-i', png, '-frames:v', String(frames), '-vf', scaleFilter({ size: st.size }), ...airVideoArgs({ size: st.size, bitrate: st.bitrate, crf: st.crf, fps: FPS, preset: st.preset }), '-an', '-f', 'h264', 'pipe:1'], { maxBuffer: 1 << 30 });
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
// ---------------------------------------------------------------- the destinations (one relay each)

// The encoder writes MPEG-TS (its tables repeated, the H.264 headers before every keyframe) and every destination gets
// a copy through its own relay (server/playout/destinations.js relayArgs): a destination that drops, refuses its key
// or falls behind is reconnected alone, with a growing pause between quick failures, and the others never notice. A
// relay joins the stream at the next keyframe with the stream's tables in front of it (server/playout/ts.js): its first
// picture is a whole one.
const RELAY_BACKOFF = [2, 5, 15, 30, 60];
const RELAY_BUFFER = 8 << 20; // bytes waiting for one relay (about 15 s at 4 Mbit/s) before it counts as stuck
const relays = new Map();
let packets = new TsPackets();
let tables = new TsTables();
function startRelay(dest) {
  const r = relays.get(dest.name) || { restarts: 0, fails: 0, holdUntil: 0, timer: null };
  r.dest = dest;
  r.gone = false;
  const p = spawn('ffmpeg', relayArgs(dest), { stdio: ['pipe', 'ignore', 'pipe'] });
  r.p = p;
  r.alive = true;
  r.joined = false;
  r.startedAt = Date.now();
  p.stdin.on('error', () => {});
  p.stderr.on('data', (d) => {
    const line = String(d).trim();
    if (line) say(`relay ${dest.name}: ${redact(line, dests).slice(0, 300)}`);
  });
  p.on('exit', (code, signal) => {
    r.alive = false;
    if (stopping || r.gone) return;
    // (asked for, a new key or a new encoder: again at once; a failure: a growing pause between quick ones; a hold: when
    // it ends)
    const quick = Date.now() - r.startedAt < 60_000;
    if (!r.now) r.fails = quick ? r.fails + 1 : 0;
    const wait = Math.max(r.now ? 500 : RELAY_BACKOFF[Math.min(r.fails, RELAY_BACKOFF.length - 1)] * 1000, r.holdUntil - Date.now());
    r.now = false;
    store.event('relay-down', { destination: dest.name, code, signal, restartIn: Math.round(wait / 1000) });
    say(`relay ${dest.name} ended (${code ?? signal}); again in ${Math.round(wait / 1000)} s`);
    clearTimeout(r.timer);
    r.timer = setTimeout(() => {
      if (stopping || r.gone) return;
      r.restarts++;
      startRelay(r.dest);
    }, wait);
  });
  relays.set(dest.name, r);
  say(`relay ${dest.name} → ${dest.shown}`);
  return r;
}
/** Reconnect a destination now (a new key, a new encoder): its relay ends and starts again at once. */
function reconnect(r) {
  r.fails = 0;
  r.now = true;
  if (r.alive) r.p.kill('SIGKILL');
}
function fanOut(chunk) {
  const whole = packets.push(chunk);
  if (!whole.length) return;
  tables.see(whole);
  for (const r of relays.values()) {
    if (!r.alive) continue;
    let buf = whole;
    if (!r.joined) {
      // (from the next keyframe, the PAT and the PMT in front of it)
      const at = joinAt(whole);
      const head = tables.prefix();
      if (at < 0 || !head) continue;
      buf = Buffer.concat([head, whole.subarray(at)]);
      r.joined = true;
    }
    if (r.p.stdin.writableLength > RELAY_BUFFER) {
      say(`relay ${r.dest.name}: ${(r.p.stdin.writableLength / 1048576).toFixed(0)} MB behind; reconnecting`);
      store.event('relay-behind', { destination: r.dest.name });
      r.p.kill('SIGKILL');
      continue;
    }
    r.p.stdin.write(buf);
  }
}

let air = null;
function startAir() {
  run++;
  const outArgs = [];
  if (streaming) outArgs.push('-f', 'mpegts', '-mpegts_flags', '+resend_headers', 'pipe:1');
  else {
    const file = target.replace('{n}', String(run));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const ext = path.extname(file).slice(1).toLowerCase();
    const fmt = { flv: 'flv', ts: 'mpegts', mkv: 'matroska', mp4: 'mp4' }[ext] || 'mpegts';
    if (SEGMENT > 0) outArgs.push('-f', 'segment', '-segment_time', String(SEGMENT), '-segment_format', fmt, '-reset_timestamps', '1', ...(fmt === 'mp4' ? ['-segment_format_options', 'movflags=+frag_keyframe+empty_moov'] : []), file);
    else outArgs.push(...(fmt === 'mp4' ? ['-movflags', '+frag_keyframe+empty_moov'] : []), '-f', fmt, file);
  }
  // (the video input probed from its first 32 kB, not 5 MB: the encoder reads the sound only once the video is probed,
  // and the sound waits in memory until then: write() below)
  const argv = ['-hide_banner', '-loglevel', 'warning', '-y',
    '-re', '-thread_queue_size', '256', '-fflags', '+genpts', '-probesize', String(VIDEO_PROBE), '-analyzeduration', '0', '-f', 'h264', '-framerate', String(FPS), '-i', 'pipe:0',
    '-re', '-thread_queue_size', '256', '-f', 's16le', '-ar', String(RATE), '-ac', '2', '-i', 'pipe:3',
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', AIR_DEFAULTS.audioBitrate, '-ar', String(RATE), '-ac', '2',
    ...outArgs];
  const p = spawn('ffmpeg', argv, { stdio: ['pipe', streaming ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => {
    err = (err + d).slice(-2000);
    const line = String(d).trim();
    if (line && !/Guessed Channel Layout/.test(line)) say(`ffmpeg: ${redact(line, dests).slice(0, 300)}`);
  });
  if (streaming) {
    // a new encoder is a new stream (its clock from zero): every destination joins it afresh
    packets = new TsPackets();
    tables = new TsTables();
    p.stdout.on('data', fanOut);
    for (const d of dests) {
      const r = relays.get(d.name);
      if (!r) startRelay(d);
      else reconnect(r);
    }
  }
  p.stdin.on('error', () => {});
  p.stdio[3].on('error', () => {});
  air = { p, v: p.stdin, a: p.stdio[3], dead: false, err, videoBytes: 0 };
  p.on('exit', (code) => {
    air.dead = true;
    say(`ffmpeg ended (${code})`);
  });
  say(`→ ${streaming ? dests.map((d) => d.shown).join(' + ') : target.replace('{n}', String(run))}${SEGMENT ? ` in ${SEGMENT} s files` : ''}`);
  return air;
}

// The encoder reads the first 32 kB of its picture before it reads any sound (it probes the picture: -probesize). A
// sound write that waited for its pipe to empty before then would wait for ever, and the picture behind it with it (a
// short filler first, under a second or so of a plain card, never reached 32 kB: the playout hung at its start). Until
// the encoder has had twice that much picture, the sound is queued in memory instead (seconds of it at most).
const VIDEO_PROBE = 32768;
// (a write that cannot finish never holds up a stop: SIGTERM, or --for run out)
const over = () => stopping || (FOR > 0 && Date.now() - started > FOR * 1000);
function write(stream, buf) {
  return new Promise((resolve) => {
    if (air.dead) return resolve(false);
    if (stream === air.v) air.videoBytes += buf.length;
    if (stream.write(buf) || (stream === air.a && air.videoBytes < 2 * VIDEO_PROBE)) return resolve(true);
    const t = setInterval(() => {
      if (air.dead || over()) {
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
// SIGUSR2: let go of the YouTube connections for a while (tools/publish/live-rotate.mjs: YouTube starts a new broadcast
// only after the encoder has been disconnected for about a minute); the other destinations stay on air, and the
// schedule runs on (the YouTube relays join it again when the hold ends)
const HOLD_MS = Number(process.env.AIR_HOLD_MS) || 75_000;
let holdUntil = 0;
process.on('SIGUSR2', () => {
  const held = [...relays.values()].filter((r) => r.dest.platform === 'youtube');
  if (!held.length) return say('hold asked: no YouTube destination here; nothing let go');
  holdUntil = Date.now() + HOLD_MS;
  say(`hold: ${held.map((r) => r.dest.name).join(', ')} disconnected for ${HOLD_MS / 1000} s`);
  store.event('air-hold', { at: new Date().toISOString(), seconds: HOLD_MS / 1000, destinations: held.map((r) => r.dest.name) });
  for (const r of held) {
    r.holdUntil = holdUntil;
    if (r.alive) r.p.kill('SIGKILL');
  }
});
// SIGHUP: the keys again (the settings file, as systemd gave it at the start: TikTok's keys can be temporary); only a
// destination whose address changed is reconnected, one no longer asked for is closed (never a key in the log)
const ENV_FILE = process.env.GLOBIT_ENV_FILE || '/etc/globit24.env';
process.on('SIGHUP', () => {
  let file = {};
  try {
    file = envFile(fs.readFileSync(ENV_FILE, 'utf8'));
  } catch (err) {
    return say(`reload: ${ENV_FILE} not readable (${err.code || err.message}); keys unchanged`);
  }
  const next = parseDestinations(args, { ...process.env, ...file }, { allowFiles: process.env.AIR_TEST_FILE_DEST === '1' });
  if (next.errors.length) return say(`reload refused, keys unchanged: ${next.errors.join(' · ')}`);
  Object.assign(process.env, file);
  const changed = [];
  for (const d of next.list) {
    const r = relays.get(d.name);
    if (!r) {
      startRelay(d);
      changed.push(d.name);
    } else if (r.dest.url !== d.url) {
      r.dest = d;
      reconnect(r);
      changed.push(d.name);
    }
  }
  for (const [name, r] of relays) {
    if (next.list.some((d) => d.name === name)) continue;
    r.gone = true;
    clearTimeout(r.timer);
    if (r.alive) r.p.kill('SIGKILL');
    relays.delete(name);
    changed.push(`${name} (closed)`);
  }
  dests = next.list;
  say(`reload: ${changed.length ? `reconnected ${changed.join(', ')}` : 'nothing changed'}`);
  store.event('air-reload', { changed });
});
// (a vertical destination on the horizontal playout, or the other way round, is refused before anything airs; the
// size from what is queued or aired, else the renderer's status for this queue, else unknown: not checked)
if (streaming) {
  const q = store.queued()[0] || store.airedList().at(-1);
  const problems = orientationProblems(dests, q?.size || opt('size') || store.readStatus('render')?.size || null);
  if (problems.length) {
    for (const p of problems) console.error(`refused: ${p}`);
    process.exit(1);
  }
}
const stats = { segments: 0, fillerSeconds: 0, underruns: 0, underrunSeconds: 0, gaps: 0, dropped: 0, restarts: 0 };
let underrunSince = null;
let onAir = null;
startAir();
// the playhead: the air time of the next frame written (the stream's time since it started, from a whole second)
let playhead = Math.ceil(Date.now() / 1000) * 1000;
say(`playout from ${new Date(playhead).toISOString()} · ${DIR}`);
store.event('air-start', { run, playhead: new Date(playhead).toISOString(), out: streaming ? null : target, destinations: dests.map((d) => d.name), segment: SEGMENT || null });

const relayStatus = () => [...relays.values()].map((r) => ({ name: r.dest.name, platform: r.dest.platform, up: !!r.alive, restarts: r.restarts, holding: r.holdUntil > Date.now() }));
function status() {
  store.status('air', { pid: process.pid, canHold: true, holding: holdUntil > Date.now(), run, onAir, playhead: new Date(playhead).toISOString(), ahead: +((playhead - Date.now()) / 1000).toFixed(1), queued: store.queued().length, bufferMinutes: +(store.queued().reduce((n, q) => n + Math.max(0, endOf(q) - Math.max(q.airAt, Date.now())), 0) / 60000).toFixed(1), stats, out: streaming ? dests.map((d) => d.shown) : target, destinations: relayStatus(), live, title: titles.title });
}

while (!stopping) {
  if (FOR > 0 && Date.now() - started > FOR * 1000) break;
  if (air.dead) {
    // a dead encoder (a file it could not write, or the encoder's own failure: the destinations drop and reconnect in
    // their relays): a new one from now on; what should have aired meanwhile is skipped, the schedule is joined again
    // at the next programme's time
    stats.restarts++;
    store.event('air-restart', { run, at: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 2000));
    if (stopping) break;
    startAir();
    playhead = Math.ceil(Date.now() / 1000) * 1000;
    store.event('air-start', { run, playhead: new Date(playhead).toISOString(), out: streaming ? null : target, destinations: dests.map((d) => d.name), segment: SEGMENT || null });
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
stopping = true; // (the relays end with the encoder, none starts again)
try {
  air.v.end();
  air.a.end();
} catch {
  /* gone */
}
await new Promise((r) => (air.dead ? r() : air.p.once('exit', r)));
// the relays: what the encoder sent them, then their own end
await Promise.all(
  [...relays.values()].map(
    (r) =>
      new Promise((done) => {
        clearTimeout(r.timer);
        if (!r.alive) return done();
        r.p.once('exit', done);
        try {
          r.p.stdin.end();
        } catch {
          r.p.kill('SIGKILL');
        }
        setTimeout(() => r.alive && r.p.kill('SIGKILL'), 10_000).unref();
      }),
  ),
);
say(`stopped: ${stats.segments} files aired, ${stats.fillerSeconds.toFixed(0)} s of filler, ${stats.underruns} underruns, ${stats.dropped} dropped`);
process.exit(0);
