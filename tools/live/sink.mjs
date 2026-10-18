// The live stream's sink for the 'frames' capture (tools/live/capture.mjs): a loopback HTTP server the page posts its
// canvas's pixels (one frame per 1/30 s slot of its clock) and its sound (16-bit PCM blocks, each with its first
// sample's index in the AudioContext) to, and a writer that hands both to the encoder at a steady rate: the picture as
// raw RGBA frames on one pipe, the sound as PCM on another, each frame with exactly its share of samples.
//
// The writer runs on node's own clock, a few frames behind the page (`delay`): a frame that has not arrived by its turn
// is the frame before again (the page dropped or posted late), one that arrives after its turn is dropped; the sound
// for a frame is cut from the blocks by sample index, silence where none arrived. So the picture and the sound stay
// locked however the page stutters, and a stalled page still gives the encoder a steady stream (the last picture,
// silence) instead of starving it. A sound clock that runs fast or slow against the picture is pulled back when it is
// more than `slack` out (samples dropped or silence added, counted).
import http from 'node:http';
import crypto from 'node:crypto';

/** The client's messages on a WebSocket (RFC 6455: masked frames, continuations, ping, close), whole, as Buffers. */
export function readMessages(socket, onMessage) {
  let buf = Buffer.alloc(0);
  let parts = [];
  socket.on('data', (d) => {
    buf = buf.length ? Buffer.concat([buf, d]) : d;
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80;
      const op = buf[0] & 0x0f;
      const masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) {
        const m = buf.subarray(off, off + 4);
        payload = Buffer.from(payload);
        const m32 = m.readUInt32LE(0);
        const n4 = payload.length & ~3;
        for (let i = 0; i < n4; i += 4) payload.writeUInt32LE((payload.readUInt32LE(i) ^ m32) >>> 0, i);
        for (let i = n4; i < payload.length; i++) payload[i] ^= m[i & 3];
      }
      buf = buf.subarray(need);
      if (op === 8) {
        socket.end();
        return;
      }
      if (op === 9) {
        if (payload.length < 126) socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
        continue;
      }
      if (op === 0 || op === 1 || op === 2) {
        parts.push(payload);
        if (fin) {
          const msg = parts.length === 1 ? parts[0] : Buffer.concat(parts);
          parts = [];
          onMessage(msg);
        }
      }
    }
  });
  socket.on('error', () => {});
}

export class FrameSink {
  constructor({ fps = 30, delay = 8, slack = 0.25, log = () => {} } = {}) {
    this.fps = fps;
    this.delay = delay;
    this.slack = slack;
    this.log = log;
    this.frames = new Map(); // slot -> Buffer (RGBA)
    this.blocks = []; // [{ at, pcm (Buffer, s16le stereo) }] in arrival order
    this.stats = { frames: 0, repeated: 0, late: 0, skipped: 0, received: 0, bytes: 0, audioBlocks: 0, silence: 0, droppedSamples: 0, encoderBehind: 0 };
    this.cfg = null;
    this.timer = null;
    this.last = null;
  }

  /**
   * Listen on loopback; resolves with the WebSocket URL the page sends to. One connection, binary messages: a frame is
   * [1, slot (uint32 LE), the picture], a sound block [2, first sample (float64 LE), PCM]. (A WebSocket, not a request
   * per frame: 30 POSTs a second cost the browser, its network process and node about 0.3 cores, 18 Oct.)
   */
  listen() {
    this.server = http.createServer((req, res) => {
      res.writeHead(426);
      res.end();
    });
    this.server.on('upgrade', (req, socket) => {
      const key = req.headers['sec-websocket-key'];
      if (!key) return socket.destroy();
      const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      socket.setNoDelay(true);
      readMessages(socket, (msg) => this.onMessage(msg));
    });
    return new Promise((resolve) => this.server.listen(0, '127.0.0.1', () => resolve(`ws://127.0.0.1:${this.server.address().port}`)));
  }

  onMessage(msg) {
    this.stats.bytes += msg.length;
    if (msg[0] === 1 && msg.length > 5) this.onFrame(msg.readUInt32LE(1), msg.subarray(5));
    else if (msg[0] === 2 && msg.length > 9) this.onAudio(msg.readDoubleLE(1), msg.subarray(9));
  }

  /**
   * Start writing: `info` is what the page's capture returned ({ w, h, fps, rate, audio0, t0, now }), `video` and `audio`
   * the encoder's pipes (audio may be null: no sound in the page).
   */
  start(info, { video, audio = null }) {
    this.cfg = info;
    this.video = video;
    this.audio = audio && info.rate ? audio : null;
    this.frameBytes = info.w * info.h * 4;
    // the bytes a written frame takes, on average (a raw frame is always frameBytes; a PNG of pixel art ~40 kB, a
    // twentieth of it): the encoder's backlog is measured in seconds of what is written, not in raw frames
    this.avgFrame = info.encoding === 'png' ? 0 : this.frameBytes;
    this.samplesPer = info.rate / this.fps; // (1600 at 48 kHz, 30 fps; 1470 at 44.1 kHz)
    this.written = 0; // next slot to write
    this.samplePos = info.audio0 ?? 0; // next sample to write (context frames)
    this.sampleDebt = 0; // fractional samples carried between frames
    this.startWall = Date.now() - Math.max(0, (info.now ?? info.t0) - info.t0);
    this.last = null; // (nothing is written before the page's first frame)
    this.timer = setInterval(() => this.pump(), 1000 / this.fps / 2);
  }

  onFrame(n, buf) {
    this.stats.received++;
    if (!this.cfg || !Number.isFinite(n) || !buf.length || (this.cfg.encoding !== 'png' && buf.length !== this.frameBytes)) return;
    if (n < this.written) {
      this.stats.late++;
      return;
    }
    this.frames.set(n, buf);
  }

  onAudio(at, buf) {
    if (!this.cfg || !Number.isFinite(at) || !buf.length) return;
    this.stats.audioBlocks++;
    // a block far behind the write position: the sound clock stalled or runs slow; carry on from this block (the
    // sound then trails the picture by what it lost, never more than the slack, and never loses its blocks for good)
    if (this.audio && this.written > 0 && this.samplePos - at > this.slack * this.cfg.rate) {
      this.stats.rebased = (this.stats.rebased || 0) + 1;
      this.samplePos = at;
    }
    this.blocks.push({ at, pcm: buf });
  }

  /** The PCM for samples [from, from + n) from the blocks (silence where none), and drops what is behind. */
  take(from, n) {
    const out = Buffer.alloc(n * 4);
    let got = 0;
    const to = from + n;
    for (const b of this.blocks) {
      const len = b.pcm.length / 4;
      const a = Math.max(from, b.at);
      const z = Math.min(to, b.at + len);
      if (z <= a) continue;
      b.pcm.copy(out, (a - from) * 4, (a - b.at) * 4, (z - b.at) * 4);
      got += z - a;
    }
    this.blocks = this.blocks.filter((b) => b.at + b.pcm.length / 4 > to);
    if (got < n) this.stats.silence += n - got;
    return out;
  }

  pump() {
    const due = Math.floor(((Date.now() - this.startWall) * this.fps) / 1000) - this.delay;
    if (!this.last) {
      // the first frame starts the stream (its sound from the sample heard with it)
      const first = Math.min(...this.frames.keys());
      if (!Number.isFinite(first) || first > due) return;
      this.written = first;
      this.samplePos = (this.cfg.audio0 ?? 0) + Math.round(first * this.samplesPer);
      this.last = this.frames.get(first);
    }
    while (this.written <= due) {
      // the encoder fell behind (both its pipes hold seconds of what was written: it is not keeping up, rather than
      // waiting for one of them): skip, never queue without end
      if (this.video.writableLength > this.backlog() && (!this.audio || this.audio.writableLength > this.cfg.rate * 4)) {
        this.stats.encoderBehind++;
        this.stats.skipped++;
        this.frames.delete(this.written);
        this.written++;
        this.samplePos += Math.round(this.samplesPer);
        continue;
      }
      const f = this.frames.get(this.written);
      if (f) {
        this.frames.delete(this.written);
        this.last = f;
      } else this.stats.repeated++;
      this.video.write(this.last);
      this.avgFrame = this.avgFrame ? this.avgFrame * 0.98 + this.last.length * 0.02 : this.last.length;
      this.stats.frames++;
      if (this.audio) {
        this.sampleDebt += this.samplesPer;
        const n = Math.floor(this.sampleDebt);
        this.sampleDebt -= n;
        // the sound clock against the picture's: blocks far ahead mean it runs fast (skip forward), blocks that end
        // far behind the write position mean it runs slow or stalled (silence fills, and the position waits)
        const newest = this.blocks.length ? Math.max(...this.blocks.map((b) => b.at + b.pcm.length / 4)) : null;
        if (newest !== null && newest - this.samplePos > (this.slack + this.delay / this.fps) * this.cfg.rate) {
          const skip = Math.round(newest - this.samplePos - (this.delay / this.fps) * this.cfg.rate);
          this.stats.droppedSamples += skip;
          this.samplePos += skip;
        }
        this.audio.write(this.take(this.samplePos, n));
        this.samplePos += n;
      }
      this.written++;
    }
    // frames that can never be written (older than the write position) go
    for (const k of this.frames.keys()) if (k < this.written) this.frames.delete(k);
  }

  /** Three seconds of what is written, in bytes: the encoder holding more on its pipe is not keeping up. */
  backlog() {
    return Math.max(this.avgFrame, 1024) * this.fps * 3;
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    return new Promise((resolve) => {
      this.server?.closeAllConnections?.();
      this.server ? this.server.close(() => resolve()) : resolve();
    });
  }
}

/** The encoder's input options for what the sink writes: the picture on pipe:0, the sound (if any) on pipe:3. */
export function sinkInputArgs(info, fps = 30) {
  const video = info.encoding === 'png'
    ? ['-thread_queue_size', '512', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', 'pipe:0']
    : ['-thread_queue_size', '512', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${info.w}x${info.h}`, '-framerate', String(fps), '-i', 'pipe:0'];
  const audio = info.audio && info.rate ? ['-thread_queue_size', '512', '-f', 's16le', '-ar', String(info.rate), '-ac', '2', '-i', 'pipe:3'] : [];
  return [...video, ...audio];
}
