// Showcase recorder, page side. Injected by record-show.mjs with
// page.addInitScript() before any page script runs, under Playwright's PAUSED
// fake clock (time only moves when the recorder calls clock.runFor()). It
// prepends `window.__SC_CFG = {...}`. Three jobs, none of which touch product
// code:
//
//  1. WebAudio capture. window.AudioContext becomes an OfflineAudioContext
//     subclass whose currentTime follows the fake clock and whose state is
//     always 'running'. Everything the channel schedules (open themes, ad
//     beds, stingers, idents, sfx, ducking) lands on the offline timeline at
//     the exact fake time it was asked for; the recorder renders it after the
//     last frame. Two WebAudio habits need help offline: `param.value = v`
//     would apply from t=0 (so it becomes setValueAtTime(v, now)), and
//     `node.disconnect()` would remove a node for the WHOLE render (so it is a
//     no-op: the channel only disconnects nodes that already stopped or faded).
//  2. Voices. A fake window.speechSynthesis with en-GB / en-US male / female
//     voices (so the engine picks 'tts'). speak() queues a request with the
//     text, the slot speaking, its presenter and the ad on air; the recorder
//     synthesises it with Kokoro while the clock is held, then delivers the
//     duration and word times, and start / boundary / end events fire on the
//     fake clock - the director, captions and mouths follow the real audio.
//  3. Timeline. Director calls (episodes, segments, breaks, ads) and scene
//     changes (shots, stingers, captions, straps) are logged with fake times,
//     for the music beds, timeline.json and the sync checks.
(() => {
  'use strict';
  const CFG = window.__SC_CFG || {};
  const now = () => performance.now();
  const SC = {
    cfg: CFG,
    mode: 'estimate', // 'estimate' (skip phase: no audio, natural pace) | 'record'
    log: [],
    contexts: [],
    requests: [],
    waiting: new Map(),
    nextId: 1,
    inflight: 0,
    stats: { disconnects: 0, valueSets: 0, utterances: 0, cancels: 0, ended: 0, bindings: 0 },
    errors: [],
  };
  window.__sc = SC;
  const log = (ev) => {
    ev.t = ev.t ?? now();
    SC.log.push(ev);
    return ev;
  };

  // ------------------------------------------------------------ 1. WebAudio
  const Offline = window.OfflineAudioContext;
  const SR = Number(CFG.sampleRate) || 48000;
  const LENGTH = Math.ceil((Number(CFG.maxSeconds) || 180) * SR);
  const paramCtx = new WeakMap(); // AudioParam -> captured context
  const paramEvents = new WeakMap(); // AudioParam -> automation events (for the value getter)
  const keyCache = new Map(); // node constructor -> AudioParam property names

  function registerNode(node, ctx) {
    if (!(node instanceof AudioNode)) return;
    let keys = keyCache.get(node.constructor);
    if (!keys) {
      keys = [];
      for (const k in node) {
        try {
          if (node[k] instanceof AudioParam) keys.push(k);
        } catch { /* exotic getter */ }
      }
      keyCache.set(node.constructor, keys);
    }
    for (const k of keys) {
      const p = node[k];
      paramCtx.set(p, ctx);
      paramEvents.set(p, []);
    }
  }

  class CapturedAudioContext extends Offline {
    constructor(opts = {}) {
      super({ numberOfChannels: 2, length: LENGTH, sampleRate: Number(opts?.sampleRate) || SR });
      this.__captured = true;
      this.__origin = now();
      this.__closed = false;
      // The page connects to a stand-in destination; at render time a tap
      // worklet sits between it and the real one, so the recorder can stop the
      // render at the last recorded frame instead of rendering the whole length.
      this.__dest = super.destination;
      this.__vdest = this.createGain();
      SC.contexts.push(this);
      log({ ev: 'audioContext', origin: this.__origin, sampleRate: this.sampleRate, length: LENGTH });
    }
    get currentTime() {
      return Math.max(0, (now() - this.__origin) / 1000);
    }
    get destination() {
      return this.__vdest ?? super.destination;
    }
    get state() {
      return this.__closed ? 'closed' : 'running';
    }
    get baseLatency() {
      return 0;
    }
    get outputLatency() {
      return 0;
    }
    getOutputTimestamp() {
      return { contextTime: this.currentTime, performanceTime: now() };
    }
    resume() {
      return Promise.resolve();
    }
    suspend() {
      return Promise.resolve();
    }
    close() {
      this.__closed = true;
      return Promise.resolve();
    }
    // Decodes run in real time: the recorder holds the clock until they land
    // (a recorded voice starts at the same fake time on every run), and the
    // decoded buffers are remembered so their playback is logged as a clip.
    decodeAudioData(...a) {
      const p = Offline.prototype.decodeAudioData.apply(this, a);
      p.then((b) => b && decoded.add(b), () => {});
      return track(p);
    }
  }
  const decoded = new WeakSet(); // AudioBuffers from decodeAudioData (recorded voices)
  // Every factory registers the new node's AudioParams with its context.
  for (const name of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!name.startsWith('create')) continue;
    const desc = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, name);
    if (!desc || typeof desc.value !== 'function') continue;
    const orig = desc.value;
    Object.defineProperty(CapturedAudioContext.prototype, name, {
      configurable: true,
      writable: true,
      value: function (...args) {
        const node = orig.apply(this, args);
        registerNode(node, this);
        return node;
      },
    });
  }
  const ABSN = window.AudioBufferSourceNode; // the native class (wrapped just below)
  // Nodes built with constructors (new GainNode(ctx)) are registered too.
  for (const C of ['GainNode', 'OscillatorNode', 'BiquadFilterNode', 'AudioBufferSourceNode', 'ConstantSourceNode', 'DelayNode', 'StereoPannerNode', 'DynamicsCompressorNode', 'WaveShaperNode', 'ConvolverNode', 'AnalyserNode', 'ChannelMergerNode', 'ChannelSplitterNode', 'IIRFilterNode', 'PannerNode', 'AudioWorkletNode']) {
    const Orig = window[C];
    if (typeof Orig !== 'function') continue;
    const Wrapped = class extends Orig {
      constructor(ctx, ...rest) {
        super(ctx, ...rest);
        if (ctx?.__captured) registerNode(this, ctx);
      }
      // Nodes from the factories (ctx.createGain()) are still instances.
      static [Symbol.hasInstance](x) {
        return x instanceof Orig;
      }
    };
    Object.defineProperty(Wrapped, 'name', { value: C });
    window[C] = Wrapped;
  }
  window.AudioContext = CapturedAudioContext;
  window.webkitAudioContext = CapturedAudioContext;
  SC.CapturedAudioContext = CapturedAudioContext;

  // 'ended' on the fake clock. A live context fires it when a source stops; an
  // OfflineAudioContext only while rendering, i.e. after the recording, and the
  // engine waits for it (a recorded voice holds the segment until src.onended).
  // Captured sources get it at the fake time a live context would: start time
  // + buffer length / playback rate, or the stop() time, whichever is first.
  // The offline render's own 'ended' never reaches the page (handlers and
  // listeners of captured sources are kept here, not on the node).
  const ASN = AudioScheduledSourceNode.prototype;
  const ends = new WeakMap(); // source -> { start, stopAt, natural, timer, handler, listeners, fired }
  const endOf = (node) => {
    let s = ends.get(node);
    if (!s) {
      s = { start: null, stopAt: Infinity, natural: Infinity, timer: 0, handler: null, listeners: [], fired: false };
      ends.set(node, s);
    }
    return s;
  };
  function fireEnded(node) {
    const s = endOf(node);
    if (s.fired) return;
    s.fired = true;
    SC.stats.ended++;
    const ev = new Event('ended');
    try {
      s.handler?.call(node, ev);
    } catch (err) {
      if (SC.errors.length < 40) SC.errors.push(`onended: ${err?.message}`);
    }
    for (const l of s.listeners.slice()) {
      try {
        if (typeof l === 'function') l.call(node, ev);
        else l?.handleEvent?.(ev);
      } catch { /* a listener's own problem */ }
    }
  }
  function armEnded(node) {
    const s = endOf(node);
    if (s.fired || s.start == null) return;
    clearTimeout(s.timer);
    const end = Math.min(s.natural, Math.max(s.stopAt, s.start));
    if (!Number.isFinite(end)) return;
    s.timer = setTimeout(() => fireEnded(node), Math.max(0, node.context.__origin + end * 1000 - now()));
  }
  for (const proto of [ABSN.prototype, ASN]) {
    const desc = Object.getOwnPropertyDescriptor(proto, 'start');
    if (!desc || typeof desc.value !== 'function') continue;
    const orig = desc.value;
    proto.start = function (...args) {
      const r = orig.apply(this, args);
      const ctx = this.context;
      if (ctx?.__captured) {
        const s = endOf(this);
        s.start = Math.max(Number(args[0]) || 0, ctx.currentTime);
        if (this instanceof ABSN && this.buffer) {
          const buf = this.buffer;
          const off = Math.max(0, Number(args[1]) || 0);
          const len = Math.max(0, args[2] != null ? Math.min(Number(args[2]), buf.duration - off) : buf.duration - off);
          if (!this.loop) {
            const rate = Math.abs((Number(this.playbackRate.value) || 1) * 2 ** ((Number(this.detune.value) || 0) / 1200)) || 1;
            s.natural = s.start + len / rate;
          }
          if (decoded.has(buf)) log({ ev: 'clip', at: ctx.__origin + s.start * 1000, duration: len, offset: off });
        }
        armEnded(this);
      }
      return r;
    };
  }
  {
    const orig = ASN.stop;
    ASN.stop = function (...args) {
      const r = orig.apply(this, args);
      const ctx = this.context;
      if (ctx?.__captured) {
        const s = endOf(this);
        s.stopAt = Math.max(Number(args[0]) || 0, ctx.currentTime);
        armEnded(this);
      }
      return r;
    };
    const onended = Object.getOwnPropertyDescriptor(ASN, 'onended');
    Object.defineProperty(ASN, 'onended', {
      configurable: true,
      enumerable: true,
      get() {
        return this.context?.__captured ? endOf(this).handler : onended.get.call(this);
      },
      set(fn) {
        if (this.context?.__captured) endOf(this).handler = typeof fn === 'function' ? fn : null;
        else onended.set.call(this, fn);
      },
    });
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    ASN.addEventListener = function (type, l, o) {
      if (type === 'ended' && this.context?.__captured) {
        const s = endOf(this);
        if (l && !s.listeners.includes(l)) s.listeners.push(l);
        return undefined;
      }
      return add.call(this, type, l, o);
    };
    ASN.removeEventListener = function (type, l, o) {
      if (type === 'ended' && this.context?.__captured) {
        const s = endOf(this);
        const i = s.listeners.indexOf(l);
        if (i >= 0) s.listeners.splice(i, 1);
        return undefined;
      }
      return remove.call(this, type, l, o);
    };
  }

  // Automation events of captured params, so `param.value` reads what a live
  // context would report (TunePlayer.stop() ramps from g.value).
  const insertEvent = (list, e) => {
    let i = list.length;
    while (i > 0 && list[i - 1].t > e.t) i--;
    if (i > 0 && list[i - 1].t === e.t && list[i - 1].type === e.type) list[i - 1] = e;
    else list.splice(i, 0, e);
  };
  function evalParam(p, T) {
    const list = paramEvents.get(p) || [];
    let prevT = 0;
    let prevV = p.defaultValue;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.type === 'lin' || e.type === 'exp') {
        if (T < e.t) {
          if (T <= prevT) return prevV;
          const k = (T - prevT) / Math.max(1e-9, e.t - prevT);
          if (e.type === 'lin' || prevV <= 0 || e.v <= 0) return prevV + (e.v - prevV) * k;
          return prevV * (e.v / prevV) ** k;
        }
        prevT = e.t;
        prevV = e.v;
        continue;
      }
      if (T < e.t) return prevV;
      if (e.type === 'set') {
        prevT = e.t;
        prevV = e.v;
      } else if (e.type === 'target') {
        const end = i + 1 < list.length ? list[i + 1].t : Infinity;
        const tt = Math.min(T, end);
        const v = e.v + (prevV - e.v) * Math.exp(-(tt - e.t) / Math.max(1e-6, e.tau));
        if (T < end) return v;
        prevT = end;
        prevV = v;
      } else if (e.type === 'curve') {
        const n = e.vals.length;
        if (T < e.t + e.d && n > 1) {
          const k = ((T - e.t) / e.d) * (n - 1);
          const i0 = Math.floor(k);
          return e.vals[i0] + (e.vals[Math.min(n - 1, i0 + 1)] - e.vals[i0]) * (k - i0);
        }
        prevT = e.t + e.d;
        prevV = e.vals[n - 1];
      }
    }
    return prevV;
  }
  const AP = AudioParam.prototype;
  const wrapAuto = (name, toEvent) => {
    const orig = AP[name];
    if (typeof orig !== 'function') return;
    AP[name] = function (...args) {
      const r = orig.apply(this, args);
      const list = paramEvents.get(this);
      if (list) {
        try {
          toEvent(list, this, ...args);
        } catch { /* bookkeeping only */ }
      }
      return r;
    };
  };
  wrapAuto('setValueAtTime', (l, p, v, t) => insertEvent(l, { type: 'set', v, t }));
  wrapAuto('linearRampToValueAtTime', (l, p, v, t) => insertEvent(l, { type: 'lin', v, t }));
  wrapAuto('exponentialRampToValueAtTime', (l, p, v, t) => insertEvent(l, { type: 'exp', v, t }));
  wrapAuto('setTargetAtTime', (l, p, v, t, tau) => insertEvent(l, { type: 'target', v, t, tau }));
  wrapAuto('setValueCurveAtTime', (l, p, vals, t, d) => insertEvent(l, { type: 'curve', vals: Array.from(vals), t, d }));
  wrapAuto('cancelScheduledValues', (l, p, t) => {
    for (let i = l.length - 1; i >= 0; i--) if (l[i].t >= t) l.splice(i, 1);
  });
  const origHold = AP.cancelAndHoldAtTime;
  if (typeof origHold === 'function') {
    AP.cancelAndHoldAtTime = function (t) {
      const list = paramEvents.get(this);
      const v = list ? evalParam(this, t) : 0;
      const r = origHold.call(this, t);
      if (list) {
        for (let i = list.length - 1; i >= 0; i--) if (list[i].t >= t) list.splice(i, 1);
        insertEvent(list, { type: 'set', v, t });
      }
      return r;
    };
  }
  const valueDesc = Object.getOwnPropertyDescriptor(AP, 'value');
  Object.defineProperty(AP, 'value', {
    configurable: true,
    enumerable: true,
    get() {
      const ctx = paramCtx.get(this);
      return ctx ? evalParam(this, ctx.currentTime) : valueDesc.get.call(this);
    },
    set(v) {
      const ctx = paramCtx.get(this);
      if (!ctx) return valueDesc.set.call(this, v);
      SC.stats.valueSets++;
      // Live semantics: the value applies from NOW (offline it would apply from 0).
      try {
        this.setValueAtTime(Number(v), ctx.currentTime);
      } catch { /* non-finite: ignore like a live param would throw */ }
      return undefined;
    },
  });
  const origDisconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function (...args) {
    if (this.context && this.context.__captured) {
      SC.stats.disconnects++;
      return undefined;
    }
    return origDisconnect.apply(this, args);
  };

  function b64(u8) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  // The tap passes audio through and posts only the frames inside [from, to)
  // (the recorded window), batched: a long show renders minutes of waiting
  // before its start, and one message per 128-frame quantum would flood the
  // main thread for nothing.
  const TAP = `registerProcessor('sc-tap', class extends AudioWorkletProcessor {
    constructor(options) {
      super();
      const o = (options && options.processorOptions) || {};
      this.from = Number(o.from) || 0;
      this.to = Number.isFinite(Number(o.to)) ? Number(o.to) : Infinity;
      this.N = 4096;
      this.bl = new Float32Array(this.N);
      this.br = new Float32Array(this.N);
      this.n = 0;
      this.at = 0;
    }
    flush() {
      if (!this.n) return;
      this.port.postMessage([this.at, this.bl.slice(0, this.n), this.br.slice(0, this.n)]);
      this.n = 0;
    }
    process(inputs, outputs) {
      const i = inputs[0];
      const o = outputs[0];
      const L = i[0] || new Float32Array(128);
      const R = i[1] || L;
      if (o[0]) o[0].set(L);
      if (o[1]) o[1].set(R);
      const f = currentFrame;
      if (f + L.length > this.from && f < this.to) {
        if (this.n && this.at + this.n !== f) this.flush();
        if (!this.n) this.at = f;
        this.bl.set(L, this.n);
        this.br.set(R, this.n);
        this.n += L.length;
        if (this.n + 128 > this.N || f + L.length >= this.to) this.flush();
      }
      return true;
    }
  });`;
  // A real macrotask (MessageChannel is not faked) to let worklet messages land.
  const yieldTask = () => new Promise((r) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => r();
    ch.port2.postMessage(0);
  });
  /**
   * Render a context up to `untilSec` (its own clock) through the tap; falls
   * back to a full render. `extra` nodes of that context (the engine's speech
   * bus) get their own tap on a fan-out connection, so their signal comes back
   * as a separate stem (the voices the channel played itself, for the duck
   * reference and the caption sync check) without changing the main mix.
   */
  async function renderUntil(ctx, fromSec, untilSec, extra = []) {
    const sr = ctx.sampleRate;
    const need = Math.min(ctx.length, Math.ceil(untilSec * sr / 128) * 128 + 128);
    // Only the recorded window is kept (a long show waits minutes for its start).
    const keep = Math.max(0, Math.min(need, Math.floor(fromSec * sr)));
    const makeTap = () => {
      const node = new AudioWorkletNode(ctx, 'sc-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { from: keep, to: need } });
      const t = { node, L: new Float32Array(need - keep), R: new Float32Array(need - keep), got: 0 };
      node.port.onmessage = (e) => {
        const [frame, l, r] = e.data;
        const end = frame + l.length;
        t.got = Math.max(t.got, Math.min(need, end));
        if (end <= keep || frame >= need) return;
        const a = Math.max(frame, keep);
        const b = Math.min(end, need);
        t.L.set(l.subarray(a - frame, b - frame), a - keep);
        t.R.set(r.subarray(a - frame, b - frame), a - keep);
      };
      return t;
    };
    try {
      const url = URL.createObjectURL(new Blob([TAP], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      const main = makeTap();
      ctx.__vdest.connect(main.node);
      main.node.connect(ctx.__dest);
      const taps = [];
      for (const src of extra) {
        try {
          const t = makeTap();
          const sink = Offline.prototype.createGain.call(ctx);
          sink.gain.setValueAtTime(0, 0); // silent from t = 0 (a .value set would apply from now)
          src.connect(t.node);
          t.node.connect(sink);
          sink.connect(ctx.__dest);
          taps.push(t);
        } catch (err) {
          SC.errors.push(`extra tap failed: ${err?.message}`);
          taps.push(null);
        }
      }
      if (need < ctx.length) {
        const stop = Offline.prototype.suspend.call(ctx, need / sr);
        Offline.prototype.startRendering.call(ctx).catch(() => {});
        await stop;
      } else await Offline.prototype.startRendering.call(ctx);
      const done = () => main.got >= need && taps.every((t) => !t || t.got >= need);
      for (let k = 0; !done() && k < 20000; k++) await yieldTask();
      return { L: main.L, R: main.R, start: keep, sampleRate: sr, tapped: true, frames: main.got, extra: taps.map((t) => (t ? { L: t.L, R: t.R } : null)) };
    } catch (err) {
      SC.errors.push(`tap render failed (${err?.message}); full render`);
      ctx.__vdest.connect(ctx.__dest);
      const buf = await Offline.prototype.startRendering.call(ctx);
      return { L: buf.getChannelData(0), R: buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0), start: 0, sampleRate: buf.sampleRate, tapped: false, frames: buf.length, extra: [] };
    }
  }

  /**
   * Render every captured context and keep [fromPerf, toPerf) (ms, fake clock)
   * as stereo float (SC.audioOut), plus the engine's speech bus alone
   * (SC.speechOut: recorded voices the channel played through WebAudio).
   */
  SC.renderAudio = async (fromPerf, toPerf) => {
    const n = Math.max(1, Math.round(((toPerf - fromPerf) / 1000) * SR));
    const out = [new Float32Array(n), new Float32Array(n)];
    const speechOut = [new Float32Array(n), new Float32Array(n)];
    const info = [];
    let speechTapped = false;
    const bus = (() => {
      try {
        return window.__showcase?.audio?.speechBus ?? null;
      } catch {
        return null;
      }
    })();
    const add = (dst, L, R, off) => {
      let covered = 0;
      for (let i = 0; i < n; i++) {
        const j = off + i;
        if (j < 0 || j >= L.length) continue;
        dst[0][i] += L[j];
        dst[1][i] += R[j];
        covered++;
      }
      return covered;
    };
    for (const ctx of SC.contexts) {
      const t0 = Date.now();
      const extra = bus && bus.context === ctx ? [bus] : [];
      const buf = await renderUntil(ctx, (fromPerf - ctx.__origin) / 1000 - 0.05, (toPerf - ctx.__origin) / 1000 + 0.05, extra);
      const off = Math.round(((fromPerf - ctx.__origin) / 1000) * buf.sampleRate) - buf.start;
      const covered = add(out, buf.L, buf.R, off);
      if (buf.extra?.[0]) {
        add(speechOut, buf.extra[0].L, buf.extra[0].R, off);
        speechTapped = true;
      }
      info.push({ origin: ctx.__origin, renderMs: Date.now() - t0, covered, frames: buf.frames, tapped: buf.tapped, speechTap: Boolean(buf.extra?.[0]) });
    }
    let peak = 0;
    for (const ch of out) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    let speechPeak = 0;
    for (const ch of speechOut) for (let i = 0; i < ch.length; i++) speechPeak = Math.max(speechPeak, Math.abs(ch[i]));
    SC.audioOut = out;
    SC.speechOut = speechOut;
    return { n, sampleRate: SR, contexts: info, peak, speechTapped, speechPeak, stats: SC.stats };
  };
  SC.audioChunk = (ch, from, count, which = 'mix') => b64(new Uint8Array((which === 'speech' ? SC.speechOut : SC.audioOut)[ch].buffer, from * 4, count * 4));

  // ------------------------------------------------------- network tracking
  // The recorder holds the fake clock while a fetch or an image is in flight,
  // so a reply lands at the fake time it was asked for (network looks instant
  // and runs are repeatable).
  const track = (p) => {
    SC.inflight++;
    let done = false;
    const fin = () => {
      if (!done) {
        done = true;
        SC.inflight--;
      }
    };
    p.then(fin, fin);
    return p;
  };
  const origFetch = window.fetch;
  window.fetch = function (...a) {
    return track(origFetch.apply(this, a));
  };
  for (const m of ['json', 'text', 'arrayBuffer', 'blob']) {
    const orig = Response.prototype[m];
    Response.prototype[m] = function (...a) {
      return track(orig.apply(this, a));
    };
  }
  const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: true,
    get() {
      return srcDesc.get.call(this);
    },
    set(v) {
      if (v) {
        SC.inflight++;
        let done = false;
        const fin = () => {
          if (done) return;
          done = true;
          SC.inflight--;
        };
        this.addEventListener('load', fin, { once: true });
        this.addEventListener('error', fin, { once: true });
        // (no failsafe timer here: every page timer is fake; the recorder caps its wait)
      }
      return srcDesc.set.call(this, v);
    },
  });
  // ------------------------------------------------------- 2. speechSynthesis
  const LAT = Number(CFG.speechLatencyMs ?? 45); // ms from speak() to the first sound
  const VOICE_LIST = Array.isArray(CFG.voices) && CFG.voices.length ? CFG.voices : [
    { name: 'Kokoro George (male)', lang: 'en-GB', kokoro: 'bm_george' },
    { name: 'Kokoro Daniel (male)', lang: 'en-GB', kokoro: 'bm_daniel' },
    { name: 'Kokoro Emma (female)', lang: 'en-GB', kokoro: 'bf_emma' },
    { name: 'Kokoro Lily (female)', lang: 'en-GB', kokoro: 'bf_lily' },
    { name: 'Kokoro Eric (male)', lang: 'en-US', kokoro: 'am_eric' },
    { name: 'Kokoro Liam (male)', lang: 'en-US', kokoro: 'am_liam' },
    { name: 'Kokoro Bella (female)', lang: 'en-US', kokoro: 'af_bella' },
    { name: 'Kokoro Nova (female)', lang: 'en-US', kokoro: 'af_nova' },
  ];
  class FakeVoice {
    constructor(v) {
      this.name = v.name;
      this.lang = v.lang;
      this.voiceURI = `showcase:${v.kokoro}`;
      this.localService = true;
      this.default = false;
      Object.defineProperty(this, '__kokoro', { value: v.kokoro });
    }
  }
  const VOICES = VOICE_LIST.map((v) => new FakeVoice(v));

  class FakeUtterance extends EventTarget {
    constructor(text) {
      super();
      this.text = text == null ? '' : String(text);
      this.lang = '';
      this.voice = null;
      this.volume = 1;
      this.rate = 1;
      this.pitch = 1;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      this.onboundary = null;
      this.onpause = null;
      this.onresume = null;
      this.onmark = null;
    }
  }
  function fire(u, type, extra = {}) {
    let ev;
    try {
      ev = new Event(type);
    } catch {
      return;
    }
    const props = { utterance: u, charIndex: 0, charLength: 0, elapsedTime: 0, name: '', ...extra };
    for (const [k, v] of Object.entries(props)) {
      try {
        Object.defineProperty(ev, k, { value: v, enumerable: true });
      } catch { /* read-only on Event */ }
    }
    try {
      u[`on${type}`]?.call(u, ev);
    } catch (err) {
      SC.errors.push(`on${type}: ${err?.message}`);
    }
    try {
      u.dispatchEvent(ev);
    } catch { /* ignore */ }
  }

  // Who is speaking: the engine's current slot, the presenter cast in it, the ad on air.
  function speakerInfo() {
    const g = window.__showcase || {};
    const scene = g.scene || g.player?.scene || null;
    let slot = null;
    try {
      slot = g.audio?.speechFrame?.(now())?.slot ?? null;
    } catch { /* engine changed: fall back to the utterance's voice */ }
    const info = { slot, presenter: null, ad: null, programId: scene?.program?.id ?? null, emotion: null, shot: scene?.shot ?? null };
    if (scene) {
      if (slot && scene.cast && typeof scene.cast[slot] === 'string') info.presenter = scene.cast[slot];
      if (slot && scene.anchors?.[slot]) info.emotion = scene.anchors[slot].emotion ?? null;
      const ad = scene.card?.ad;
      if ((slot === 'ad' || scene.shot === 'ad') && ad) info.ad = { id: ad.id, brand: ad.brand ?? null, voice: ad.voice ?? null };
    }
    return info;
  }

  const queue = [];
  let current = null;
  let paused = false;

  function estimate(text, rate) {
    // Natural broadcast pace (~160 wpm, ~14.5 chars/s), words spread by length.
    const r = Math.min(1.5, Math.max(0.6, Number(rate) || 1));
    const dur = Math.max(0.35, text.length / (14.5 * r));
    const words = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) words.push({ char: m.index, len: m[0].length });
    const total = words.reduce((a, w) => a + w.len + 1, 0) || 1;
    let acc = 0;
    for (const w of words) {
      w.t = (acc / total) * dur;
      acc += w.len + 1;
    }
    return { duration: dur, words, estimated: true };
  }

  function schedule(cur, res) {
    const start = Math.max(cur.tCall + LAT, now() + 1);
    const dur = Math.max(0.05, Number(res.duration) || 0) * 1000;
    cur.start = start;
    cur.end = start + dur;
    cur.entry = log({
      ev: 'speech',
      t: start,
      id: cur.id,
      end: cur.end,
      called: cur.tCall,
      text: cur.u.text,
      volume: Number.isFinite(Number(cur.u.volume)) ? Number(cur.u.volume) : 1,
      clip: res.clip || null,
      voice: res.voice || null,
      words: Array.isArray(res.words) ? res.words.length : 0,
      estimated: Boolean(res.estimated),
      error: res.error || null,
      ...cur.info,
    });
    const at = (ms, fn) => cur.timers.push(setTimeout(fn, Math.max(0, ms - now())));
    at(start, () => fire(cur.u, 'start'));
    for (const w of res.words || []) {
      const t = Number(w.t);
      if (!Number.isFinite(t)) continue;
      at(start + t * 1000, () => fire(cur.u, 'boundary', { name: 'word', charIndex: Number(w.char) || 0, charLength: Number(w.len) || 0, elapsedTime: t }));
    }
    at(cur.end, () => finish(cur));
  }

  function finish(cur) {
    if (current !== cur) return;
    current = null;
    for (const id of cur.timers) clearTimeout(id);
    fire(cur.u, 'end', { elapsedTime: (now() - (cur.start ?? now())) / 1000 });
    next();
  }

  function next() {
    if (current || paused || !queue.length) return;
    const u = queue.shift();
    const cur = { id: SC.nextId++, u, tCall: now(), timers: [], start: null, end: null, entry: null, cancelled: false, info: speakerInfo() };
    current = cur;
    SC.stats.utterances++;
    const text = u.text;
    if (SC.mode !== 'record' || !text.trim() || !(Number(u.volume) > 0)) {
      schedule(cur, estimate(text, u.rate));
      return;
    }
    SC.waiting.set(cur.id, cur);
    const req = {
      id: cur.id,
      text,
      lang: u.lang || u.voice?.lang || '',
      pitch: Number(u.pitch) || 1,
      rate: Number(u.rate) || 1,
      volume: Number(u.volume),
      voiceName: u.voice?.name ?? null,
      voiceKokoro: u.voice?.__kokoro ?? null,
      tCall: cur.tCall,
      ...cur.info,
    };
    SC.requests.push(req);
    // The recorder's binding starts the synthesis at once (the fake clock is
    // held until the result is delivered: it never advances past a pending
    // voice, see record-show.mjs step()).
    try {
      if (typeof window.__scSpeak === 'function') {
        SC.stats.bindings++;
        window.__scSpeak(req).catch(() => {});
      }
    } catch { /* no binding: the recorder still picks the request up between frames */ }
  }

  /** Called by the recorder with the synthesis result (or { error }). */
  SC.deliver = (id, res) => {
    const cur = SC.waiting.get(id);
    SC.waiting.delete(id);
    if (!cur || cur.cancelled || current !== cur) return false;
    if (!res || res.error || !(Number(res.duration) > 0)) {
      const est = estimate(cur.u.text, cur.u.rate);
      est.error = res?.error || 'no audio';
      schedule(cur, est);
      return false;
    }
    schedule(cur, res);
    return true;
  };
  SC.takeRequests = () => SC.requests.splice(0);

  const synth = new (class FakeSpeechSynthesis extends EventTarget {
    constructor() {
      super();
      this.onvoiceschanged = null;
    }
    get speaking() {
      return Boolean(current);
    }
    get pending() {
      return queue.length > 0;
    }
    get paused() {
      return paused;
    }
    getVoices() {
      return VOICES.slice();
    }
    speak(u) {
      if (!u || typeof u.text !== 'string') throw new TypeError('speak() needs a SpeechSynthesisUtterance');
      queue.push(u);
      next();
    }
    cancel() {
      const dropped = queue.splice(0);
      const cur = current;
      current = null;
      if (cur) {
        SC.stats.cancels++;
        cur.cancelled = true;
        for (const id of cur.timers) clearTimeout(id);
        if (cur.entry) cur.entry.cut = now();
        // Async, like a browser: the engine has already released its handlers.
        queueMicrotask(() => fire(cur.u, 'error', { error: 'interrupted' }));
      }
      for (const u of dropped) queueMicrotask(() => fire(u, 'error', { error: 'canceled' }));
    }
    pause() {
      paused = true;
    }
    resume() {
      paused = false;
      next();
    }
  })();
  try {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth });
    window.SpeechSynthesisUtterance = FakeUtterance;
  } catch (err) {
    SC.errors.push(`speechSynthesis: ${err?.message}`);
  }

  // ------------------------------------------------------------ 3. timeline
  const last = {};
  function cardInfo(s) {
    const c = s.card;
    if (!c) return null;
    if (c.ad) return { kind: 'ad', ad: c.ad.id, line: c.line ?? null };
    if (c.next) return { kind: 'promo', next: c.next.id ?? null };
    if (c.headline) return { kind: 'breaking', headline: c.headline };
    if (c.fact) return { kind: 'fact', fact: c.fact };
    if (c.place || c.lat != null) return { kind: 'map', place: c.place ?? null };
    if (c.line1) return { kind: 'end', line1: c.line1 };
    if (c.index != null) return { kind: 'montage', index: c.index };
    return { kind: 'other' };
  }
  function sample() {
    const s = window.__showcase?.scene;
    if (!s) return;
    if (s.shot !== last.shot || s.shotSince !== last.since) {
      last.shot = s.shot;
      last.since = s.shotSince;
      log({ ev: 'shot', shot: s.shot, at: Number(s.shotSince) * 1000, programId: s.program?.id ?? null, focus: s.focus ?? null, storyId: s.storyId ?? null, card: cardInfo(s) });
    }
    const st = s.stinger?.start;
    if (st != null && st !== last.stinger) {
      last.stinger = st;
      log({ ev: 'stinger', at: Number(st) * 1000 });
    }
    if (s.subtitle !== last.subtitle) {
      last.subtitle = s.subtitle;
      log({ ev: 'subtitle', text: s.subtitle ?? null });
    }
    const lt = s.lowerThird?.headline ?? null;
    if (lt !== last.strap) {
      last.strap = lt;
      log({ ev: 'strap', headline: lt, kicker: s.lowerThird?.kicker ?? null });
    }
    const line = s.card?.ad ? s.card.line : null;
    if (line !== last.adLine) {
      last.adLine = line;
      if (line != null && line >= 0) log({ ev: 'adLine', ad: s.card.ad.id, line });
    }
    // A voice is heard (browser TTS, a recorded clip or blips): the engine's own duck flag.
    let voiced = null;
    try {
      const a = window.__showcase?.audio;
      if (a && 'voiced' in a) voiced = Boolean(a.voiced);
    } catch { /* engine changed */ }
    if (voiced !== null && voiced !== last.voiced) {
      last.voiced = voiced;
      log({ ev: 'voiced', on: voiced });
    }
    const pid = s.program?.id ?? null;
    if (pid !== last.program) {
      last.program = pid;
      log({ ev: 'program', programId: pid, title: s.program?.title ?? null });
    }
  }
  function tick() {
    requestAnimationFrame(tick);
    try {
      sample();
    } catch (err) {
      if (SC.errors.length < 20) SC.errors.push(`sample: ${err?.message}`);
    }
  }
  requestAnimationFrame(tick);

  // Director calls, wrapped on the instance (the methods stay the product's own).
  function wrap(p, name, describe) {
    const orig = p[name];
    if (typeof orig !== 'function') return false;
    p[name] = function wrapped(...args) {
      let info = {};
      try {
        info = describe(...args) || {};
      } catch { /* shape changed: log the call anyway */ }
      const start = log({ ev: name, phase: 'start', ...info });
      const finishLog = () => log({ ev: name, phase: 'end', ref: start.t });
      let r;
      try {
        r = orig.apply(this, args);
      } catch (err) {
        finishLog();
        throw err;
      }
      if (r && typeof r.then === 'function') r.then(finishLog, finishLog);
      else finishLog();
      return r;
    };
    return true;
  }
  const segInfo = (sg) => ({
    type: sg?.type ?? null,
    emotion: sg?.emotion ?? null,
    anchor: sg?.anchor ?? null,
    feature: sg?.feature ?? null,
    breaking: Boolean(sg?.breaking),
    roundup: sg?.roundup ?? null,
    hasImage: Boolean(sg?.hasImage),
    kicker: sg?.kicker ?? null,
    headline: sg?.headline ?? null,
    location: sg?.location?.place ?? null,
    // The server's recorded voice for the segment (voice service), if any.
    audio: sg?.audio && typeof sg.audio === 'object' ? { duration: Number(sg.audio.duration) || null, words: Array.isArray(sg.audio.words) ? sg.audio.words.length : 0 } : null,
    text: sg?.text ?? '',
  });
  // Prefetch: the sentences the engine will speak, predicted with its own
  // splitter and speech normaliser (same modules, same text), so the recorder
  // can synthesise them while the picture is being captured.
  SC.prefetch = [];
  let splitFn = null;
  let timelineFn = null;
  let predictorsLoading = null;
  const waitingEpisodes = [];
  SC.loadPredictors = () => {
    predictorsLoading ??= Promise.all([
      import('/js/audio/sentences.js').catch(() => import('/js/audio.js')).then((m) => { splitFn = m.splitSentences ?? null; }).catch(() => {}),
      import('/js/audio/visemes.js').then((m) => { timelineFn = m.buildTimeline ?? null; }).catch(() => {}),
    ]).then(() => {
      // Episodes that started before the modules arrived (the first one usually).
      for (const ep of waitingEpisodes.splice(0)) SC.predictEpisode(ep);
      return Boolean(splitFn);
    });
    return predictorsLoading;
  };
  function predict(text, lang) {
    if (!splitFn || !text) return [];
    let parts = [];
    try {
      parts = splitFn(text);
    } catch {
      return [];
    }
    return parts.map((sentence) => {
      try {
        return (timelineFn && timelineFn(sentence, { lang }).spoken) || sentence;
      } catch {
        return sentence;
      }
    });
  }
  // The channel plays the server's recorded voices itself unless the page was
  // told to use browser voices: those lines need no synthesis here.
  const browserVoices = (() => {
    try {
      return new URLSearchParams(location.search).get('voices') === 'browser';
    } catch {
      return false;
    }
  })();
  const recorded = (a) => !browserVoices && Boolean(a && typeof a === 'object' && (typeof a.url === 'string' || a.buffer));
  const presenterLang = (id) => window.__showcase?.player?.channel?.presenters?.[id]?.voice?.lang || 'en-GB';
  SC.takePrefetch = () => SC.prefetch.splice(0);

  const episodeInfo = (ep) => ({
    episodeId: ep?.id ?? null,
    programId: ep?.program?.id ?? null,
    title: ep?.program?.title ?? null,
    replay: Boolean(ep?.replay),
    cast: ep?.cast ?? null,
    segments: (ep?.segments || []).map((sg) => {
      const i = segInfo(sg);
      i.chars = i.text.length;
      delete i.text;
      return i;
    }),
  });
  const predicted = new Set();
  /** Queue every sentence of an episode for synthesis (once per episode id). */
  SC.predictEpisode = (ep) => {
    if (!ep || predicted.has(ep.id)) return 0;
    if (!splitFn) {
      waitingEpisodes.push(ep);
      SC.loadPredictors();
      return 0;
    }
    predicted.add(ep.id);
    let n = 0;
    try {
      for (const sg of ep.segments || []) {
        if (recorded(sg.audio)) continue;
        const presenter = ep.cast?.[sg.anchor] ?? null;
        const lang = presenterLang(presenter);
        for (const text of predict(sg.text, lang)) {
          SC.prefetch.push({ text, presenter, slot: sg.anchor, lang, programId: ep.program?.id ?? null });
          n++;
        }
      }
    } catch { /* prediction is best effort */ }
    return n;
  };
  SC.instrument = () => {
    const g = window.__showcase;
    if (!g?.player || g.__wrapped) return Boolean(g?.__wrapped);
    g.__wrapped = true;
    const p = g.player;
    SC.loadPredictors();
    const done = {
      playEpisode: wrap(p, 'playEpisode', (ep) => {
        SC.predictEpisode(ep);
        return episodeInfo(ep);
      }),
      playAd: wrap(p, 'playAd', (ad) => {
        try {
          const lang = ad?.voice?.lang || 'en-GB';
          const lines = p.voices?.ads?.[ad?.id] || {};
          for (const line of ad?.script || []) {
            if (recorded(lines[line.text])) continue;
            for (const text of predict(line.text, lang)) SC.prefetch.push({ text, slot: 'ad', lang, ad: { id: ad.id, brand: ad.brand ?? null, voice: ad.voice ?? null } });
          }
        } catch { /* best effort */ }
        return { adId: ad?.id ?? null, brand: ad?.brand ?? null, duration: ad?.duration ?? null };
      }),
      playBreak: wrap(p, 'playBreak', (it) => ({
        breakId: it?.id ?? null,
        ads: it?.ads ?? null,
        filler: Boolean(it?.filler),
        next: it?.next ? { id: it.next.id ?? null, title: it.next.title ?? null, ready: Boolean(it.next.ready) } : null,
      })),
      say: wrap(p, 'say', (sg) => segInfo(sg)),
      breaking: wrap(p, 'breaking', (it) => ({ text: it?.text ?? null, source: it?.source ?? null })),
    };
    log({ ev: 'instrumented', wrapped: done });
    return true;
  };
  // One render per video frame: the fake clock fires requestAnimationFrame
  // every 16 ms, twice per 30 fps frame; under load the second render is pure
  // cost. Callbacks run on the first tick of each frame slot (all callbacks of
  // that tick run, so every rAF consumer still sees every slot).
  SC.throttleRaf = (fps) => {
    if (SC.rafThrottled || !(fps > 0)) return false;
    SC.rafThrottled = true;
    const orig = window.requestAnimationFrame.bind(window);
    const slotMs = 1000 / fps;
    let lastTs = -1;
    let lastSlot = -1;
    window.requestAnimationFrame = (cb) => orig(function tick(ts) {
      const slot = Math.floor(ts / slotMs + 1e-6);
      if (ts !== lastTs && slot === lastSlot) return orig(tick);
      lastTs = ts;
      lastSlot = slot;
      return cb(ts);
    });
    return true;
  };
  // Frame-exact rendering (the default). The fake clock ticks rAF every 16 ms,
  // which never lines up with 30 fps frames: a throttled render runs on the
  // first tick of a frame slot, usually AFTER that frame is grabbed, so the
  // picture would show the scene up to a frame late while the sound is exact.
  // Instead the recorder owns rAF: callbacks are queued and SC.pump() runs them
  // at the page time of each frame, right before the canvas is read, so frame k
  // shows exactly the state at its own timestamp (what a 30 fps camera sees).
  SC.manualRaf = () => {
    if (SC.rafManual) return false;
    SC.rafManual = true;
    const pending = new Map();
    let nextId = 1;
    window.requestAnimationFrame = (cb) => {
      const id = nextId++;
      if (typeof cb === 'function') pending.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      pending.delete(id);
    };
    SC.pump = () => {
      if (!pending.size) return 0;
      const list = [...pending.values()];
      pending.clear();
      const ts = now();
      for (const cb of list) {
        try {
          cb(ts);
        } catch (err) {
          // Surface it like an uncaught rAF error would (the recorder logs page errors).
          if (typeof window.reportError === 'function') window.reportError(err);
          else if (SC.errors.length < 40) SC.errors.push(`raf: ${err?.message}`);
        }
      }
      return list.length;
    };
    return true;
  };
  SC.pump = () => 0;
  SC.frame = (sel = '#screen') => document.querySelector(sel)?.toDataURL('image/png') ?? null;
  /** One recorder round trip per frame: render at this instant, picture, pending syntheses, network state. */
  SC.step = (sel) => {
    SC.pump();
    return { png: SC.frame(sel), reqs: SC.takeRequests(), inflight: SC.inflight };
  };
  SC.takeLog = () => SC.log.splice(0);
})();
