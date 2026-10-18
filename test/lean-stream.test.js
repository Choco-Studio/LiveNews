// The picture on air (server/airsize.js, server/playout/encode.js) and the live capture's sink (tools/live/sink.mjs):
// whole-number scaling only (x5 1920x1080 by default, x3 1152x648; 1280x720 is x3.33 and becomes 1152x648 with a
// warning, or is refused where files must join), BT.709 converted and tagged, constant quality under a cap; and the
// sink that hands the page's frames and sound to the one encoder at a steady rate, whatever the page does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { integerSize, scaleFilter, colourArgs, DEFAULT_SIZE, CANVAS } from '../server/airsize.js';
import { airVideoArgs, airSize, parseCrf, AIR_DEFAULTS, levelFor, parseSize } from '../server/playout/encode.js';
import { FrameSink, readMessages, sinkInputArgs } from '../tools/live/sink.mjs';
import { CAPTURES, DEFAULT_CAPTURE } from '../tools/live/capture.mjs';
import { liveStreamOptions } from '../server/publish/live.js';

test('the air size is a whole multiple of the 384x216 canvas: x5 by default, x3 on request, never a fraction', () => {
  assert.deepEqual(CANVAS, { w: 384, h: 216 });
  assert.equal(DEFAULT_SIZE, '1920x1080');
  assert.deepEqual(integerSize('1920x1080'), { w: 1920, h: 1080, k: 5, size: '1920x1080', asked: '1920x1080', rounded: false });
  assert.equal(integerSize('1152x648').k, 3);
  assert.equal(integerSize('648p').size, '1152x648');
  assert.equal(integerSize('1080p').size, '1920x1080');
  const warned = [];
  const r = integerSize('1280x720', { warn: (m) => warned.push(m) });
  assert.equal(r.size, '1152x648', 'x3.33 rounds to x3');
  assert.equal(r.rounded, true);
  assert.match(warned[0], /1280x720 is not a whole multiple.*x3\.33.*1152x648/);
  assert.equal(integerSize('1600x900', { warn: () => {} }).size, '1536x864');
  assert.equal(integerSize('3840x2160', { warn: () => {} }).size, '3840x2160', 'x10');
  assert.equal(integerSize('100x60', { warn: () => {} }).size, '384x216', 'never below x1');
  assert.throws(() => integerSize('1280x720', { strict: true }), /not a whole multiple.*use 1152x648/);
  assert.throws(() => integerSize('wide'), /WIDTHxHEIGHT/);
});

test('the scale is nearest neighbour into BT.709 4:2:0, and the stream says BT.709 (players read untagged HD as BT.709)', () => {
  assert.equal(scaleFilter('1920x1080'), 'scale=w=1920:h=1080:flags=neighbor:out_color_matrix=bt709:out_range=tv,format=yuv420p');
  // (the browser's own VP8 is BT.601: converted on the way)
  assert.match(scaleFilter('1152x648', { inMatrix: 'bt601' }), /in_color_matrix=bt601:out_color_matrix=bt709/);
  assert.deepEqual(colourArgs(), ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']);
});

test('the playout encodes 1080p at constant quality under a cap, refuses a fractional size, and rounds one asked for', () => {
  assert.equal(AIR_DEFAULTS.size, '1920x1080');
  const a = airVideoArgs({});
  const val = (k) => a[a.indexOf(k) + 1];
  assert.equal(val('-crf'), String(AIR_DEFAULTS.crf));
  assert.equal(val('-maxrate'), AIR_DEFAULTS.bitrate);
  assert.equal(val('-bufsize'), `${parseInt(AIR_DEFAULTS.bitrate, 10) * 2}k`);
  assert.ok(!a.includes('-b:v'), 'no target bitrate: the quality decides, the cap holds the busy seconds');
  assert.equal(val('-level:v'), '4.1', '1080p30');
  assert.equal(val('-colorspace'), 'bt709');
  // the constant bitrate stays a switch (PLAYOUT_CRF=off)
  const cbr = airVideoArgs({ crf: null, bitrate: '3000k' });
  assert.equal(cbr[cbr.indexOf('-b:v') + 1], '3000k');
  assert.ok(!cbr.includes('-crf'));
  assert.equal(parseCrf(undefined), AIR_DEFAULTS.crf);
  assert.equal(parseCrf('off'), null);
  assert.equal(parseCrf('18'), 18);
  assert.throws(() => parseCrf('99'), /crf/);
  // files must join byte to byte: a size that is not a whole multiple never reaches the encoder
  assert.throws(() => airVideoArgs({ size: '1280x720' }), /whole multiple/);
  const warned = [];
  assert.equal(airSize('1280x720', (m) => warned.push(m)), '1152x648');
  assert.equal(warned.length, 1);
  assert.equal(levelFor(parseSize('1152x648'), 30), '3.1');
});

// a pipe that keeps what is written
const sinkOf = () => {
  const chunks = [];
  const w = new Writable({
    write(c, e, cb) {
      chunks.push(Buffer.from(c));
      cb();
    },
  });
  w.chunks = chunks;
  return w;
};
const frame = (w, h, v) => Buffer.alloc(w * h * 4, v);

test('the sink writes one frame per slot at a steady rate: a missing frame is the one before again, a late one is dropped', () => {
  const s = new FrameSink({ fps: 30, delay: 2 });
  const video = sinkOf();
  const audio = sinkOf();
  const info = { w: 4, h: 2, fps: 30, rate: 48000, audio0: 1000, audio: true, encoding: 'raw', t0: 0, now: 0 };
  s.start(info, { video, audio });
  clearInterval(s.timer); // (the test pumps by hand)
  s.onFrame(0, frame(4, 2, 10));
  s.onFrame(1, frame(4, 2, 11));
  s.onFrame(3, frame(4, 2, 13)); // (slot 2 never came)
  s.onFrame(2, frame(4, 2, 9)); // (slot 2 after slot 3: still in time, the writer is behind)
  s.startWall = Date.now() - 5.5 * (1000 / 30); // 5 slots of time have passed; delay 2: slots 0..3 are due
  s.pump();
  assert.deepEqual(video.chunks.map((c) => c[0]), [10, 11, 9, 13]);
  s.onFrame(1, frame(4, 2, 99)); // after its turn: dropped
  assert.equal(s.stats.late, 1);
  s.startWall = Date.now() - 8.5 * (1000 / 30); // slots 4..6 due, none came: the last picture again
  s.pump();
  assert.deepEqual(video.chunks.map((c) => c[0]), [10, 11, 9, 13, 13, 13, 13]);
  assert.equal(s.stats.repeated, 3);
});

test("the sink cuts each frame's share of the sound by sample index, silence where none came, and follows a stalled clock", () => {
  const s = new FrameSink({ fps: 30, delay: 0, slack: 0.25 });
  const video = sinkOf();
  const audio = sinkOf();
  s.start({ w: 2, h: 2, fps: 30, rate: 48000, audio0: 48000, audio: true, encoding: 'raw', t0: 0, now: 0 }, { video, audio });
  clearInterval(s.timer);
  const pcm = (n, v) => {
    const b = Buffer.alloc(n * 4);
    for (let i = 0; i < n * 2; i++) b.writeInt16LE(v, i * 2);
    return b;
  };
  s.onFrame(0, frame(2, 2, 1));
  s.onAudio(48000 - 800, pcm(4000, 7)); // a block that starts before the first frame's sound, to sample 51200
  s.startWall = Date.now() - 1.5 * (1000 / 30); // slots 0 and 1
  s.pump();
  const bytes = Buffer.concat(audio.chunks);
  assert.equal(bytes.length, 2 * 1600 * 4, 'exactly 1600 samples a frame at 48 kHz and 30 fps');
  assert.equal(bytes.readInt16LE(0), 7);
  assert.equal(bytes.readInt16LE(bytes.length - 2), 7);
  // nothing more arrives: silence, counted
  s.startWall = Date.now() - 2.5 * (1000 / 30); // slot 2
  s.pump();
  const third = Buffer.concat(audio.chunks).subarray(2 * 1600 * 4);
  assert.equal(third.length, 1600 * 4);
  assert.ok(third.every((b) => b === 0));
  assert.ok(s.stats.silence >= 1600);
  // the sound clock stalled and comes back a second behind: the writer picks up from its block, never drops it
  s.onAudio(52800 - 48000, pcm(4800, 5));
  assert.equal(s.stats.rebased, 1);
  s.startWall = Date.now() - 3.5 * (1000 / 30); // slot 3
  s.pump();
  const fourth = Buffer.concat(audio.chunks).subarray(3 * 1600 * 4);
  assert.equal(fourth.readInt16LE(0), 5);
});

test('the sink skips, rather than queue without end, once the encoder holds 3 s of what was written on both pipes', () => {
  // an encoder that reads nothing: everything written stays on its pipes
  const stuck = () => ({ writableLength: 0, chunks: 0, write(b) { this.writableLength += b.length; this.chunks++; } });
  const s = new FrameSink({ fps: 30, delay: 0 });
  const video = stuck();
  const audio = stuck();
  s.start({ w: 384, h: 216, fps: 30, rate: 48000, audio0: 0, audio: true, encoding: 'png', t0: 0, now: 0 }, { video, audio });
  clearInterval(s.timer);
  const png = Buffer.alloc(40_000, 1); // (a pixel-art PNG: a twentieth of the raw 332 kB frame)
  s.onFrame(0, png);
  s.startWall = Date.now() - 300.5 * (1000 / 30); // ten seconds of slots are due
  s.pump();
  // three seconds of PNG frames (not three seconds of raw ones: 25 s of PNG) are queued, then it skips
  assert.ok(video.chunks >= 85 && video.chunks <= 95, `${video.chunks} frames queued`);
  assert.equal(s.stats.skipped, 301 - video.chunks);
  assert.equal(s.stats.frames, video.chunks);
});

test('the sink reads the page over a WebSocket: masked binary messages, a frame and a sound block', () => {
  const got = [];
  const listeners = {};
  const socket = { on: (ev, fn) => (listeners[ev] = fn), write() {}, end() {} };
  readMessages(socket, (m) => got.push(m));
  const mask = Buffer.from([1, 2, 3, 4]);
  const ws = (payload) => {
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x82, 0x80 | len]) : Buffer.from([0x82, 0x80 | 126, len >> 8, len & 255]);
    const body = Buffer.from(payload.map((b, i) => b ^ mask[i & 3]));
    return Buffer.concat([head, mask, body]);
  };
  const f = Buffer.concat([Buffer.from([1, 7, 0, 0, 0]), Buffer.alloc(300, 9)]);
  const both = Buffer.concat([ws(f), ws(Buffer.from([2, 0, 0, 0, 0, 0, 0, 240, 63, 5, 5]))]);
  // arriving in pieces, as TCP gives it
  listeners.data(both.subarray(0, 100));
  listeners.data(both.subarray(100));
  assert.equal(got.length, 2);
  assert.equal(got[0].readUInt32LE(1), 7);
  assert.equal(got[0].length, 305);
  assert.equal(got[1].readDoubleLE(1), 1);
  const s = new FrameSink();
  s.cfg = { w: 1, h: 1, encoding: 'png' };
  s.written = 0;
  s.onMessage(Buffer.concat([Buffer.from([1, 3, 0, 0, 0]), Buffer.from('PNG')]));
  assert.equal(s.frames.get(3).toString(), 'PNG');
});

test('the encoder reads what the sink writes; the live capture is the canvas pixels by default; the supervisor passes the switches', () => {
  assert.equal(DEFAULT_CAPTURE, 'png');
  assert.equal(CAPTURES.png.kind, 'frames');
  assert.equal(CAPTURES.vp8.mimeType, 'video/webm;codecs=vp8,opus', 'the old capture stays a switch');
  const png = sinkInputArgs({ encoding: 'png', w: 384, h: 216, rate: 48000, audio: true });
  assert.deepEqual(png.slice(png.indexOf('-f'), png.indexOf('-f') + 4), ['-f', 'image2pipe', '-c:v', 'png']);
  assert.ok(png.includes('pipe:3') && png.includes('s16le'));
  const raw = sinkInputArgs({ encoding: 'raw', w: 384, h: 216, rate: 0, audio: false });
  assert.ok(raw.includes('rawvideo') && raw.includes('384x216') && !raw.includes('pipe:3'));
  for (const k of ['size', 'bitrate', 'crf', 'capture']) assert.ok(liveStreamOptions.includes(k));
});
