// Live to several destinations at once (docs/publishing/playout.md §13.6: YouTube's dual format and TikTok LIVE): the
// destinations by name and their keys from the environment (never printed), the picture's shape checked, the relays'
// MPEG-TS joined at a keyframe with its tables, and the playout itself streaming one encode to two destinations (plain
// files here, nothing leaves the machine) while YouTube is held for a rotation and TikTok's key is reloaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDestinations, relayArgs, redact, envFile, orientationProblems, platformOf, PRESETS, YOUTUBE_INGEST } from '../server/playout/destinations.js';
import { TsPackets, TsTables, joinAt, isKeyStart, pidOf, TS, VIDEO_PID, PMT_PID } from '../server/playout/ts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = { YOUTUBE_STREAM_KEY: 'hhhh-1111-2222', YOUTUBE_VERTICAL_STREAM_KEY: 'vvvv-3333-4444', TIKTOK_RTMP_URL: 'rtmp://push-rtmp-l1.tiktokcdn.com/game/', TIKTOK_STREAM_KEY: 'stream-5555-6666' };

test('the destinations by name: YouTube (horizontal and its dual vertical feed) on RTMPS, TikTok on its own server', () => {
  const { list, errors } = parseDestinations(['--to', 'youtube,youtube-vertical,tiktok'], ENV);
  assert.deepEqual(errors, []);
  assert.deepEqual(list.map((d) => [d.name, d.platform, d.portrait]), [['youtube', 'youtube', false], ['youtube-vertical', 'youtube', true], ['tiktok', 'tiktok', true]]);
  assert.equal(list[0].url, `${YOUTUBE_INGEST}/hhhh-1111-2222`);
  assert.equal(list[1].url, `${YOUTUBE_INGEST}/vvvv-3333-4444`, 'the dual format: the second key on the same ingest');
  assert.equal(list[2].url, 'rtmp://push-rtmp-l1.tiktokcdn.com/game/stream-5555-6666');
  // never a key where it can be printed
  for (const d of list) assert.ok(!d.shown.includes(ENV[d.keyEnv]) && d.shown.includes('<key>'), d.shown);
  assert.equal(redact(`error connecting to ${list[2].url}`, list), 'error connecting to rtmp://push-rtmp-l1.tiktokcdn.com/game/<key>');
  // a server of the platform's own, when it gives one
  assert.equal(parseDestinations(['--to', 'youtube'], { ...ENV, YOUTUBE_RTMP_URL: 'rtmp://a.rtmp.youtube.com/live2' }).list[0].url, 'rtmp://a.rtmp.youtube.com/live2/hhhh-1111-2222');
  assert.deepEqual(Object.keys(PRESETS), ['youtube', 'youtube-vertical', 'tiktok']);
});

test('every missing piece is named, and nothing is half set up', () => {
  const { list, errors } = parseDestinations(['--to', 'tiktok,youtube-vertical,twitch'], {});
  assert.equal(list.length, 0);
  assert.ok(errors.some((e) => /tiktok.*TIKTOK_RTMP_URL.*TikTok LIVE Center/.test(e)));
  assert.ok(errors.some((e) => /tiktok.*TIKTOK_STREAM_KEY/.test(e)));
  assert.ok(errors.some((e) => /youtube-vertical.*YOUTUBE_VERTICAL_STREAM_KEY/.test(e)));
  assert.ok(errors.some((e) => /unknown destination "twitch"/.test(e)));
  assert.ok(parseDestinations(['--to', 'tiktok'], { ...ENV, TIKTOK_RTMP_URL: 'http://example.com/x' }).errors.some((e) => /not an rtmp/.test(e)));
  // by hand, as before: --rtmp <server> --key-env <VAR>
  const hand = parseDestinations(['--rtmp', 'rtmp://a.rtmp.youtube.com/live2', '--key-env', 'YOUTUBE_STREAM_KEY'], ENV).list;
  assert.deepEqual(hand.map((d) => [d.platform, d.portrait]), [['youtube', null]]);
  assert.equal(platformOf('rtmp://push.tiktokcdn.com/game'), 'tiktok');
  assert.equal(platformOf('rtmp://live.example.net/app'), 'other');
});

test("the picture's shape: TikTok and YouTube's vertical feed take the vertical stream, YouTube's main feed the horizontal", () => {
  const { list } = parseDestinations(['--to', 'youtube,youtube-vertical,tiktok'], ENV);
  assert.deepEqual(orientationProblems(list, '1080x1920').length, 1);
  assert.match(orientationProblems(list, '1080x1920')[0], /^youtube wants a landscape/);
  assert.deepEqual(orientationProblems(list, '1920x1080').map((p) => p.split(' ')[0]), ['youtube-vertical', 'tiktok']);
  assert.deepEqual(orientationProblems(list, null), [], 'unknown: not checked');
});

test("a relay copies the playout's MPEG-TS into FLV (RTMP), untouched; the settings file read back for a reload", () => {
  const [d] = parseDestinations(['--to', 'tiktok'], ENV).list;
  const a = relayArgs(d);
  assert.deepEqual(a.slice(a.indexOf('-f'), a.indexOf('-f') + 4), ['-f', 'mpegts', '-i', 'pipe:0']);
  assert.ok(a.includes('copy') && !a.includes('libx264'), 'never encoded again');
  assert.equal(a[a.lastIndexOf('-f') + 1], 'flv');
  assert.equal(a.at(-1), d.url);
  assert.deepEqual(envFile('# keys\nTIKTOK_STREAM_KEY="new-key"\nexport TIKTOK_RTMP_URL=rtmp://x/y\n\nNOT A LINE'), { TIKTOK_STREAM_KEY: 'new-key', TIKTOK_RTMP_URL: 'rtmp://x/y' });
});

/** A TS packet: PID, payload start, and (keyframe) an adaptation field with the random access indicator. */
function packet(pid, { start = false, key = false } = {}) {
  const p = Buffer.alloc(TS, 0xff);
  p[0] = 0x47;
  p[1] = (start ? 0x40 : 0) | ((pid >> 8) & 0x1f);
  p[2] = pid & 0xff;
  if (key) {
    p[3] = 0x30; // adaptation field and payload
    p[4] = 7;
    p[5] = 0x40; // random access indicator
  } else p[3] = 0x10;
  return p;
}

test('MPEG-TS: whole packets across chunks, the tables kept, a relay joined at the next keyframe', () => {
  const stream = Buffer.concat([packet(0), packet(PMT_PID), packet(VIDEO_PID, { start: true }), packet(0x101), packet(VIDEO_PID), packet(0), packet(PMT_PID), packet(VIDEO_PID, { start: true, key: true }), packet(VIDEO_PID)]);
  const ps = new TsPackets();
  // (cut at odd places: the packets come out whole, the rest waits)
  const a = ps.push(stream.subarray(0, 300));
  const b = ps.push(stream.subarray(300, 1000));
  const c = ps.push(stream.subarray(1000));
  assert.deepEqual([a.length, b.length, c.length].map((n) => n % TS), [0, 0, 0]);
  const all = Buffer.concat([a, b, c]);
  assert.equal(all.length, stream.length);
  assert.equal(joinAt(all), 7 * TS, 'the keyframe, not the first video packet');
  assert.ok(isKeyStart(all, VIDEO_PID, 7 * TS) && !isKeyStart(all, VIDEO_PID, 2 * TS));
  const t = new TsTables();
  assert.equal(t.prefix(), null);
  t.see(all);
  const head = t.prefix();
  assert.deepEqual([pidOf(head, 0), pidOf(head, TS)], [0, PMT_PID]);
  // a stream cut mid-packet resynchronises on the sync byte
  const odd = new TsPackets();
  assert.equal(odd.push(Buffer.concat([Buffer.from([1, 2, 3]), packet(0)])).length, TS);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('the playout streams one encode to two destinations; a hold lets go of YouTube only; a reload reconnects TikTok alone', { skip: !hasFfmpeg && 'no ffmpeg', timeout: 90_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-dual-'));
  let p = null;
  try {
    const { airVideoArgs } = await import('../server/playout/encode.js');
    const { PlayoutStore } = await import('../server/playout/queue.js');
    // a vertical segment as the renderer makes them (the air's settings at 216x384), 8 s, sound in FLAC
    const seg = path.join(dir, 'seg.mkv');
    const mk = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=216x384:r=30:d=8', '-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=8', ...airVideoArgs({ size: '216x384' }), '-c:a', 'flac', '-ac', '2', '-shortest', seg]);
    assert.equal(mk.status, 0, String(mk.stderr));
    const q = path.join(dir, 'q');
    new PlayoutStore(q).enqueue({ id: 'seg-1', kind: 'break', unit: 'u1', itemId: 'b1', programId: null, title: 'Break', airAt: Date.now() + 2500, frames: 240, fps: 30, file: seg, size: '216x384', bitrate: '4000k', crf: 20, preset: 'veryfast' });
    for (const d of ['yt', 'tt']) fs.mkdirSync(path.join(dir, d));
    fs.writeFileSync(path.join(dir, 'env'), `TIKTOK_RTMP_URL=${path.join(dir, 'tt')}\nTIKTOK_STREAM_KEY=second.flv\n`);
    const env = { ...process.env, PUBLISH_LIVE: '1', PUBLISH_MODE: '', AIR_TEST_FILE_DEST: '1', AIR_HOLD_MS: '2500', GLOBIT_ENV_FILE: path.join(dir, 'env'), YOUTUBE_RTMP_URL: path.join(dir, 'yt'), YOUTUBE_VERTICAL_STREAM_KEY: 'vertical.flv', TIKTOK_RTMP_URL: path.join(dir, 'tt'), TIKTOK_STREAM_KEY: 'first.flv', NODE_NO_WARNINGS: '1' };
    // a horizontal destination on this vertical playout is refused before anything airs
    const wrong = spawnSync(process.execPath, [path.join(root, 'tools/playout/air.mjs'), '--dir', q, '--to', 'youtube', '--for', '2'], { env: { ...env, YOUTUBE_RTMP_URL: path.join(dir, 'yt'), YOUTUBE_STREAM_KEY: 'h.flv' }, encoding: 'utf8' });
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /refused: youtube wants a landscape/);
    p = spawn(process.execPath, [path.join(root, 'tools/playout/air.mjs'), '--dir', q, '--to', 'youtube-vertical,tiktok', '--for', '13'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let log = '';
    p.stdout.on('data', (d) => (log += d));
    p.stderr.on('data', (d) => (log += d));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(5500);
    p.kill('SIGUSR2');
    await sleep(1500);
    p.kill('SIGHUP');
    const code = await new Promise((r) => p.on('exit', r));
    assert.equal(code, 0, log);
    assert.ok(!/vvvv|first\.flv|second\.flv/.test(log.replace(/\/(first|second|vertical)\.flv/g, '')), 'no key in the log');
    const probe = (f) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim().split('\n').sort();
    for (const f of ['yt/vertical.flv', 'tt/first.flv', 'tt/second.flv']) {
      assert.ok(fs.existsSync(path.join(dir, f)), `${f}: written (${log})`);
      assert.deepEqual(probe(path.join(dir, f)), ['aac', 'h264,216,384'], f);
    }
    const events = fs.readFileSync(path.join(q, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(events.find((e) => e.type === 'air-hold')?.destinations, ['youtube-vertical'], 'the hold lets go of YouTube only');
    assert.deepEqual(events.find((e) => e.type === 'air-reload')?.changed, ['tiktok'], 'the reload reconnects TikTok alone');
    assert.ok(!/non-existing PPS|decode_slice_header/.test(log), 'every relay joined at a keyframe');
  } finally {
    // (a failure never leaves the playout running: its process group, the encoder and the relays with it)
    if (p && p.exitCode === null) process.kill(-p.pid, 'SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a short filler first never stalls the playout (the encoder probes its picture before it reads any sound)', { skip: !hasFfmpeg && 'no ffmpeg', timeout: 60_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-probe-'));
  let p = null;
  try {
    const { airVideoArgs } = await import('../server/playout/encode.js');
    const { PlayoutStore } = await import('../server/playout/queue.js');
    // a two-frame programme 0.9 s after every whole second: the playout starts its clock on a whole second, so wherever
    // it starts, it opens with a 0.9 s filler, under 32 kB of a plain card (it hung for ever there before: the encoder
    // waited for more picture, the playout for the sound's pipe to empty)
    const seg = path.join(dir, 'seg.mkv');
    const mk = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=216x384:r=30', '-f', 'lavfi', '-i', 'sine=f=440:r=48000', '-frames:v', '2', ...airVideoArgs({ size: '216x384' }), '-c:a', 'flac', '-ac', '2', '-t', String(2 / 30), seg]);
    assert.equal(mk.status, 0, String(mk.stderr));
    const q = path.join(dir, 'q');
    const store = new PlayoutStore(q);
    const t0 = Math.floor(Date.now() / 1000) * 1000;
    for (let k = 0; k < 12; k++) store.enqueue({ id: `seg-${k}`, kind: 'break', unit: `u${k}`, itemId: `b${k}`, programId: null, title: 'Break', airAt: t0 + k * 1000 + 900, frames: 2, fps: 30, file: seg, size: '216x384', bitrate: '4000k', crf: 20, preset: 'veryfast' });
    const out = path.join(dir, 'air.ts');
    p = spawn(process.execPath, [path.join(root, 'tools/playout/air.mjs'), '--dir', q, '--out', out, '--for', '5'], { env: { ...process.env, NODE_NO_WARNINGS: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let log = '';
    p.stdout.on('data', (d) => (log += d));
    p.stderr.on('data', (d) => (log += d));
    const code = await Promise.race([new Promise((r) => p.on('exit', r)), new Promise((r) => setTimeout(() => r('hung'), 40_000))]);
    assert.equal(code, 0, `the playout ends by itself (${code}): ${log}`);
    const streams = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,start_time,duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout.trim().split('\n').map((l) => l.split(','));
    const v = streams.find((x) => x[0] === 'video');
    const a = streams.find((x) => x[0] === 'audio');
    assert.ok(v && a, `picture and sound aired: ${streams.join(' | ')}`);
    assert.ok(Number(v[2]) > 3, `the fillers and the programmes aired (${v[2]} s)`);
    assert.ok(Math.abs(Number(v[1]) - Number(a[1])) < 1 / 30 + 1e-6, `picture and sound start together (${v[1]} / ${a[1]})`);
  } finally {
    if (p && p.exitCode === null) process.kill(-p.pid, 'SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
