// The live capture's page side (tools/stream.mjs; tools/leak/watch.mjs --record; tools/live/lab.mjs). Every
// AudioContext the page makes gets a tap (a gain node fed by whatever the page connects to the speakers), and the
// page's picture and that sound leave the page one of two ways:
//
//   frames kinds ('png', the default from 18 Oct; 'frames'): the canvas's own pixels, one picture per 1/30 s slot of
//            the page's clock, and the sound as 16-bit PCM from an AudioWorklet, sent over a loopback WebSocket to the
//            stream's sink (tools/live/sink.mjs), which hands them to the one encoder (x264 + AAC). Nothing lossy before
//            the encoder: the picture reaches x264 as the page drew it. 'png' encodes each frame in a worker (a tenth
//            of the bytes, and nothing on the page's thread but a copy); 'frames' sends raw RGBA.
//   recorder kinds ('vp8', 'vp8hq', 'vp9'): canvas.captureStream + MediaRecorder (the stream's way until 18 Oct), the
//            chunks posted to node (window.__chunk, base64) and decoded by ffmpeg before x264: a second lossy encode,
//            4:2:0 at the canvas's own size, BT.601.
//
// Either way, once the capture starts the page draws only the pictures the stream takes (gatePage below).
// CAPTURES names them (the --capture switch).

export const CAPTURES = Object.freeze({
  png: { kind: 'frames', encoding: 'png' },
  frames: { kind: 'frames', encoding: 'raw' },
  // the stream's capture until 18 Oct: VP8 asked for 2.5 Mbit/s, Opus sound
  vp8: { kind: 'recorder', mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 192_000 },
  // VP8 asked for 12 Mbit/s, the sound as PCM (no Opus before the AAC)
  vp8hq: { kind: 'recorder', mimeType: 'video/webm;codecs=vp8,pcm', videoBitsPerSecond: 12_000_000 },
  vp9: { kind: 'recorder', mimeType: 'video/webm;codecs=vp9,pcm', videoBitsPerSecond: 12_000_000 },
});
export const DEFAULT_CAPTURE = 'png';

// Runs in the page before any page script (page.addInitScript). Kept a function so it is real code.
export function capturePageInit() {
  'use strict';
  if (window.__startCapture) return;
  const Ctx = window.AudioContext;
  const connect = AudioNode.prototype.connect;
  const disconnect = AudioNode.prototype.disconnect;
  const contexts = [];
  window.AudioContext = class extends Ctx {
    constructor(...a) {
      super(...a);
      // whatever reaches the speakers also reaches this gain node; the capture takes its sound from it
      this.__tap = this.createGain();
      contexts.push(this);
    }
  };
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = connect.call(this, dest, ...rest);
    if (dest && dest === this.context?.destination && this.context.__tap) connect.call(this, this.context.__tap, ...rest);
    return out;
  };
  AudioNode.prototype.disconnect = function (...a) {
    const out = disconnect.apply(this, a);
    // (a node taken off the speakers comes off the capture too)
    if (a[0] && a[0] === this.context?.destination && this.context.__tap) {
      try {
        disconnect.call(this, this.context.__tap, ...a.slice(1));
      } catch {
        /* never connected there */
      }
    }
    return out;
  };
  const b64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };

  // ---- the page's frame rate: the stream takes 30 pictures a second, a headless page draws 60. Once the capture
  // starts, animation frames run only in a new 1/fps slot of the page's clock, so the page draws each picture the
  // stream takes and none it would throw away (the channel animates on time, not on frame counts: the pictures are the
  // same). `pageFps: 0` leaves the page's own rate.
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const gate = { fps: 0, t0: 0, slot: -1, frameT: -1, run: true };
  window.requestAnimationFrame = (cb) =>
    nativeRaf(function step(t) {
      if (gate.fps) {
        if (t !== gate.frameT) {
          gate.frameT = t;
          const slot = Math.floor(((t - gate.t0) * gate.fps) / 1000);
          gate.run = slot > gate.slot;
          if (gate.run) gate.slot = slot;
        }
        if (!gate.run) return nativeRaf(step);
      }
      cb(t);
    });
  const gatePage = (cfg) => {
    const fps = cfg.pageFps === undefined ? cfg.fps || 30 : Number(cfg.pageFps) || 0;
    Object.assign(gate, { fps, t0: performance.now(), slot: -1, frameT: -1, run: true });
  };

  // ---- a MediaRecorder (the recorder kinds)
  const startRecorder = (cfg) => {
    gatePage(cfg);
    const canvas = document.getElementById('screen');
    const stream = canvas.captureStream(cfg.fps || 30);
    const mixed = new MediaStream(stream.getVideoTracks());
    // (a context made later, the channel unlocking its audio on start, joins only a new recorder: the page makes its
    // context before the recorder starts, autostart unlocks at load)
    for (const ctx of contexts) {
      const msd = ctx.createMediaStreamDestination();
      connect.call(ctx.__tap, msd);
      for (const t of msd.stream.getAudioTracks()) mixed.addTrack(t);
    }
    const o = { mimeType: cfg.mimeType, videoBitsPerSecond: cfg.videoBitsPerSecond };
    if (cfg.audioBitsPerSecond) o.audioBitsPerSecond = cfg.audioBitsPerSecond;
    const rec = new MediaRecorder(mixed, o);
    rec.ondataavailable = async (e) => {
      if (!e.data.size) return;
      window.__chunk(b64(new Uint8Array(await e.data.arrayBuffer())));
    };
    rec.start(1000);
    window.__capture = { stop: () => rec.state !== 'inactive' && rec.stop() };
    return { kind: 'recorder', audio: mixed.getAudioTracks().length };
  };

  // ---- the canvas's pixels and the PCM, posted to the sink (the frames kind)
  const TAP = `class GlobitTap extends AudioWorkletProcessor {
    constructor(o) { super(); this.block = o.processorOptions.block; this.buf = new Int16Array(this.block * 2); this.n = 0; this.at = -1; }
    process(inputs) {
      const ch = inputs[0] || [];
      const L = ch[0], R = ch[1] || ch[0];
      const len = L ? L.length : 128;
      for (let i = 0; i < len; i++) {
        if (this.n === 0) this.at = currentFrame + i;
        const l = L ? Math.max(-1, Math.min(1, L[i])) : 0;
        const r = R ? Math.max(-1, Math.min(1, R[i])) : 0;
        this.buf[2 * this.n] = l < 0 ? l * 32768 : l * 32767;
        this.buf[2 * this.n + 1] = r < 0 ? r * 32768 : r * 32767;
        if (++this.n === this.block) {
          this.port.postMessage({ at: this.at, pcm: this.buf }, [this.buf.buffer]);
          this.buf = new Int16Array(this.block * 2);
          this.n = 0;
        }
      }
      return true;
    }
  }
  registerProcessor('globit-tap', GlobitTap);`;
  // the PNG encoder's worker: frames in (ImageBitmaps, transferred), PNGs out on its own socket to the sink, one
  // 'done' back per frame (the page counts what is in flight)
  const ENCODER = `let ws = null, cv = null, g = null;
  onmessage = async (e) => {
    const m = e.data;
    if (m.sink) {
      ws = new WebSocket(m.sink);
      ws.onopen = () => postMessage('open');
      ws.onerror = () => postMessage('the stream sink did not answer');
      cv = new OffscreenCanvas(m.w, m.h);
      g = cv.getContext('2d');
      return;
    }
    if (m.stop) { ws?.close(); return; }
    try {
      g.drawImage(m.bitmap, 0, 0);
      m.bitmap.close();
      const png = await cv.convertToBlob({ type: 'image/png' });
      if (ws && ws.readyState === 1) {
        const h = new DataView(new ArrayBuffer(5));
        h.setUint8(0, 1);
        h.setUint32(1, m.slot, true);
        ws.send(new Blob([h.buffer, png]));
      }
    } finally {
      postMessage('done');
    }
  };`;
  const startFrames = async (cfg) => {
    const canvas = document.getElementById('screen');
    const W = canvas.width;
    const H = canvas.height;
    const fps = cfg.fps || 30;
    // one WebSocket to the sink (another port of 127.0.0.1): [1, slot u32, picture] and [2, first sample f64, PCM]
    const ws = new WebSocket(cfg.sink);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('the stream sink did not answer'));
    });
    let stopped = false;
    let inflight = 0;
    let dropped = 0;
    const send = (type, num, payload) => {
      if (ws.readyState !== 1) return;
      const h = new DataView(new ArrayBuffer(type === 1 ? 5 : 9));
      h.setUint8(0, type);
      if (type === 1) h.setUint32(1, num, true);
      else h.setFloat64(1, num, true);
      ws.send(new Blob([h.buffer, payload]));
    };
    ws.onclose = () => (stopped = true);
    // the sound: one tap per context (the channel makes one), 100 ms blocks
    const ctx = contexts[0] || null;
    let rate = 0;
    let audio0 = null;
    if (ctx) {
      rate = ctx.sampleRate;
      const url = URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, 'globit-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { block: Math.round(rate / 10) } });
      const mute = ctx.createGain();
      mute.gain.value = 0;
      connect.call(ctx.__tap, node);
      connect.call(node, mute);
      connect.call(mute, ctx.destination); // (pulled by the graph; silent)
      node.port.onmessage = (e) => {
        if (!stopped) send(2, e.data.at, e.data.pcm);
      };
    }
    // the picture: the slot of each frame by the page's clock, at most one per slot, the newest kept when the sink lags.
    // png: each frame copied (an ImageBitmap, transferred) to a worker that encodes it and sends it on its own socket:
    // the page's thread only copies (a toBlob on the page waits for idle time a busy channel page never has)
    const png = cfg.encoding === 'png';
    const grab = png ? new OffscreenCanvas(W, H) : document.createElement('canvas');
    grab.width = W;
    grab.height = H;
    const g = grab.getContext('2d', { willReadFrequently: !png });
    let worker = null;
    if (png) {
      const url = URL.createObjectURL(new Blob([ENCODER], { type: 'text/javascript' }));
      worker = new Worker(url);
      URL.revokeObjectURL(url);
      await new Promise((resolve, reject) => {
        worker.onmessage = (e) => (e.data === 'open' ? resolve() : reject(new Error(String(e.data))));
        worker.postMessage({ sink: cfg.sink, w: W, h: H });
      });
      worker.onmessage = () => inflight--;
    }
    const t0 = performance.now();
    gatePage(cfg);
    gate.t0 = t0; // (the page's frames and the capture's slots on one clock)
    // the context's sample heard at t0 (its output latency counted, as the channel times its pictures to its sound)
    if (ctx) {
      let t = ctx.currentTime - ((Number(ctx.outputLatency) || 0) + (Number(ctx.baseLatency) || 0));
      try {
        const ts = ctx.getOutputTimestamp?.();
        if (ts && ts.performanceTime > 0) t = ts.contextTime + (t0 - ts.performanceTime) / 1000;
      } catch {
        /* the stated latency */
      }
      // (half a frame later: a picture change shows at the next 1/30 s sample of a 60 Hz page, on average half a frame
      // after it was drawn; the sound is moved with it. Measured with tools/live/sync.mjs: the sound led by up to a frame)
      audio0 = Math.max(0, Math.round(t * rate - rate / fps / 2));
    }
    let last = -1;
    let ticks = 0; // (the page's frames: requestAnimationFrame calls)
    const tick = (t) => {
      if (stopped) return;
      ticks++;
      requestAnimationFrame(tick);
      const slot = Math.floor((((t ?? performance.now()) - t0) * fps) / 1000);
      if (slot <= last) return;
      last = slot;
      // (the sink or the encoder lags: the frame is dropped here and the sink repeats the one before)
      if (inflight >= 3 || ws.bufferedAmount > 4 << 20) {
        dropped++;
        return;
      }
      g.drawImage(canvas, 0, 0);
      if (png) {
        inflight++;
        const bitmap = grab.transferToImageBitmap();
        worker.postMessage({ slot, bitmap }, [bitmap]);
      } else send(1, slot, g.getImageData(0, 0, W, H).data);
    };
    requestAnimationFrame(tick);
    window.__capture = {
      stop: () => {
        stopped = true;
        ws.close();
        worker?.postMessage({ stop: true });
      },
      stats: () => ({ slot: last, ticks, dropped, inflight }),
    };
    return { kind: 'frames', encoding: cfg.encoding === 'png' ? 'png' : 'raw', w: W, h: H, fps, rate, audio0, audio: !!ctx, t0, now: performance.now() };
  };

  window.__startCapture = (cfg) => (cfg.kind === 'frames' ? startFrames(cfg) : startRecorder(cfg));
}
