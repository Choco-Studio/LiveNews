// The deterministic recorder's page side (tools/record.mjs, tools/playout/render.mjs): the init script that freezes the
// page clock's side effects onto the recorder's fake clock (fetches, images and decodes hold it; Math.random seeded; WebAudio
// on an OfflineAudioContext that follows the fake clock), and the WAV writer for the sound it renders. Moved here from
// tools/record.mjs unchanged, so the playout renderer records exactly as the recorder does.
import fs from 'node:fs';

// ------------------------------------------------------------------ page side

// Runs in the page before any page script (page.addInitScript). Kept as a
// function so it is real code; CFG arrives as its argument.
export function pageInit(CFG) {
  'use strict';
  const REC = { inflight: 0, events: [], contexts: [], decoded: new WeakSet(), stats: { valueSets: 0, disconnects: 0, starts: 0 } };
  window.__rec = REC;
  // --trace: the pace analyser's timeline (pace.js paceTrace writes to window.__sc.log when it exists)
  if (CFG.trace) window.__sc = { log: [] };
  const now = () => performance.now();
  const ev = (e) => {
    e.t = now();
    REC.events.push(e);
    if (REC.events.length > 20000) REC.events.shift();
  };
  REC.ev = ev;

  // Seeded Math.random (mulberry32) so random choices repeat between runs.
  if (CFG.seed !== null) {
    let a = CFG.seed >>> 0 || 1;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- work in flight: the recorder holds the clock until it lands
  const track = (p) => {
    REC.inflight++;
    let done = false;
    const fin = () => {
      if (!done) {
        done = true;
        REC.inflight--;
      }
    };
    Promise.resolve(p).then(fin, fin);
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
      const img = this;
      track(new Promise((resolve) => {
        const done = () => {
          img.removeEventListener('load', done);
          img.removeEventListener('error', done);
          resolve();
        };
        img.addEventListener('load', done);
        img.addEventListener('error', done);
      }));
      srcDesc.set.call(this, v);
    },
  });

  if (!CFG.audio) return;

  // ---- WebAudio on the fake clock
  const Offline = window.OfflineAudioContext;
  // The native source class: window.AudioBufferSourceNode is replaced by a
  // registering subclass below, but factory-made nodes keep the native prototype.
  const NativeBufferSource = window.AudioBufferSourceNode;
  const SR = CFG.sampleRate;
  const LENGTH = Math.ceil(CFG.maxSeconds * SR);
  const paramCtx = new WeakMap(); // AudioParam -> its recorded context
  const paramEvents = new WeakMap(); // AudioParam -> automation events (to answer `.value`)
  const keyCache = new Map();

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
      paramCtx.set(node[k], ctx);
      paramEvents.set(node[k], []);
    }
  }

  class RecordedAudioContext extends Offline {
    constructor(o = {}) {
      super({ numberOfChannels: 2, length: LENGTH, sampleRate: Number(o?.sampleRate) || SR });
      this.__recorded = true;
      this.__origin = now();
      this.__closed = false;
      REC.contexts.push(this);
      ev({ type: 'audioContext', sampleRate: this.sampleRate });
      if (CFG.progressive) {
        // --progressive: the render runs while the frames are taken, a chunk at a time, always behind the page's
        // clock (REC.pump), so it never passes a moment the page may still schedule sound for
        this.__done = 0;
        this.__busy = false;
        this.__pending = null;
        this.__disc = []; // disconnects waiting for the render to pass them
        REC.renderTo(this, 128 / this.sampleRate); // (the first stop, set before the render starts: its first quantum)
        this.__final = Offline.prototype.startRendering.call(this);
        this.__final.catch(() => {});
      }
    }
    get currentTime() {
      return Math.max(0, (now() - this.__origin) / 1000);
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
    decodeAudioData(...a) {
      const p = Offline.prototype.decodeAudioData.apply(this, a);
      p.then((b) => b && REC.decoded.add(b), () => {});
      return track(p);
    }
  }
  // Every factory registers the new node's params with its context.
  for (const name of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!name.startsWith('create')) continue;
    const desc = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, name);
    if (!desc || typeof desc.value !== 'function') continue;
    const orig = desc.value;
    Object.defineProperty(RecordedAudioContext.prototype, name, {
      configurable: true,
      writable: true,
      value(...args) {
        const node = orig.apply(this, args);
        registerNode(node, this);
        return node;
      },
    });
  }
  // Nodes built with constructors (new GainNode(ctx)) are registered too.
  for (const C of ['GainNode', 'OscillatorNode', 'BiquadFilterNode', 'AudioBufferSourceNode', 'ConstantSourceNode', 'DelayNode', 'StereoPannerNode', 'DynamicsCompressorNode', 'WaveShaperNode', 'ConvolverNode', 'AnalyserNode', 'ChannelMergerNode', 'ChannelSplitterNode', 'IIRFilterNode', 'PannerNode']) {
    const Orig = window[C];
    if (typeof Orig !== 'function') continue;
    const Wrapped = class extends Orig {
      constructor(ctx, o) {
        super(ctx, o);
        if (ctx?.__recorded) registerNode(this, ctx);
      }
    };
    Object.defineProperty(Wrapped, 'name', { value: C });
    window[C] = Wrapped;
  }
  window.AudioContext = RecordedAudioContext;
  window.webkitAudioContext = RecordedAudioContext;

  // Automation bookkeeping, so `param.value` reads what a live context would.
  const insert = (list, e) => {
    let i = list.length;
    while (i > 0 && list[i - 1].t > e.t) i--;
    list.splice(i, 0, e);
    if (list.length > 400) list.splice(0, list.length - 400);
  };
  function valueAt(p, T) {
    const list = paramEvents.get(p) || [];
    let pt = 0;
    let pv = p.defaultValue;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.type === 'lin' || e.type === 'exp') {
        if (T < e.t) {
          if (T <= pt) return pv;
          const k = (T - pt) / Math.max(1e-9, e.t - pt);
          if (e.type === 'lin' || pv <= 0 || e.v <= 0) return pv + (e.v - pv) * k;
          return pv * (e.v / pv) ** k;
        }
        pt = e.t;
        pv = e.v;
        continue;
      }
      if (T < e.t) return pv;
      if (e.type === 'set') {
        pt = e.t;
        pv = e.v;
      } else if (e.type === 'target') {
        const end = i + 1 < list.length ? list[i + 1].t : Infinity;
        const tt = Math.min(T, end);
        const v = e.v + (pv - e.v) * Math.exp(-(tt - e.t) / Math.max(1e-6, e.tau));
        if (T < end) return v;
        pt = end;
        pv = v;
      } else if (e.type === 'curve') {
        const n = e.vals.length;
        if (T < e.t + e.d && n > 1) {
          const k = ((T - e.t) / e.d) * (n - 1);
          const j = Math.floor(k);
          return e.vals[j] + (e.vals[Math.min(n - 1, j + 1)] - e.vals[j]) * (k - j);
        }
        pt = e.t + e.d;
        pv = e.vals[n - 1];
      }
    }
    return pv;
  }
  const AP = AudioParam.prototype;
  const wrap = (name, toEvent) => {
    const orig = AP[name];
    if (typeof orig !== 'function') return;
    AP[name] = function (...args) {
      const r = orig.apply(this, args);
      const list = paramEvents.get(this);
      if (list) {
        try {
          toEvent(list, ...args);
        } catch { /* bookkeeping only */ }
      }
      return r;
    };
  };
  wrap('setValueAtTime', (l, v, t) => insert(l, { type: 'set', v, t }));
  wrap('linearRampToValueAtTime', (l, v, t) => insert(l, { type: 'lin', v, t }));
  wrap('exponentialRampToValueAtTime', (l, v, t) => insert(l, { type: 'exp', v, t }));
  wrap('setTargetAtTime', (l, v, t, tau) => insert(l, { type: 'target', v, t, tau }));
  wrap('setValueCurveAtTime', (l, vals, t, d) => insert(l, { type: 'curve', vals: Array.from(vals), t, d }));
  wrap('cancelScheduledValues', (l, t) => {
    for (let i = l.length - 1; i >= 0; i--) if (l[i].t >= t) l.splice(i, 1);
  });
  const origHold = AP.cancelAndHoldAtTime;
  if (typeof origHold === 'function') {
    AP.cancelAndHoldAtTime = function (t) {
      const list = paramEvents.get(this);
      const v = list ? valueAt(this, t) : 0;
      const r = origHold.call(this, t);
      if (list) {
        for (let i = list.length - 1; i >= 0; i--) if (list[i].t >= t) list.splice(i, 1);
        insert(list, { type: 'set', v, t });
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
      return ctx ? valueAt(this, ctx.currentTime) : valueDesc.get.call(this);
    },
    set(v) {
      const ctx = paramCtx.get(this);
      if (!ctx) return valueDesc.set.call(this, v);
      REC.stats.valueSets++;
      // Live semantics: the value applies from NOW (offline it would apply from 0).
      try {
        this.setValueAtTime(Number(v), ctx.currentTime);
      } catch { /* non-finite: a live param throws too */ }
      return undefined;
    },
  });
  const origDisconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function (...a) {
    if (this.context?.__recorded) {
      REC.stats.disconnects++;
      // --progressive: the disconnect is kept until the render has passed the moment it was asked for, then made, so
      // the graph holds only the nodes still sounding (the channel disconnects a node once it has stopped)
      if (CFG.progressive) this.context.__disc?.push({ node: this, args: a, at: this.context.currentTime });
      return undefined;
    }
    return origDisconnect.apply(this, a);
  };
  REC.origDisconnect = origDisconnect;
  // Recorded voices (decoded buffers) starting: logged for the sync report.
  const origStart = NativeBufferSource.prototype.start;
  NativeBufferSource.prototype.start = function (when = 0, ...rest) {
    REC.stats.starts++;
    if (this.context?.__recorded && this.buffer && REC.decoded.has(this.buffer)) {
      ev({ type: 'clip', at: this.context.__origin + Math.max(Number(when) || 0, this.context.currentTime) * 1000, duration: this.buffer.duration });
    }
    return origStart.call(this, when, ...rest);
  };

  // 'ended' on the fake clock. An offline context only fires `ended` while it
  // renders (after the last frame), so code that waits for a clip to finish
  // (the speech path awaits its voice's `onended`) would wait for the whole
  // recording. Sources of recorded contexts keep their 'ended' listeners here
  // and get the event from a (fake) timer at the time their sound stops: the
  // buffer's end (offset, duration, playbackRate, no loop) or stop(when).
  const ASN = window.AudioScheduledSourceNode?.prototype;
  if (ASN) {
    const ends = new WeakMap(); // source -> { start, offset, dur, stop, prop, handlers, timer, fired }
    const endOf = (node) => {
      let e = ends.get(node);
      if (!e) {
        e = { start: null, offset: 0, dur: null, stop: Infinity, prop: null, handlers: new Set(), timer: 0, fired: false };
        ends.set(node, e);
      }
      return e;
    };
    const fire = (node) => {
      const e = endOf(node);
      if (e.fired) return;
      e.fired = true;
      const evt = new Event('ended');
      for (const h of [e.prop, ...e.handlers]) {
        if (!h) continue;
        try {
          if (typeof h === 'function') h.call(node, evt);
          else h.handleEvent?.(evt);
        } catch (err) {
          console.error(err);
        }
      }
    };
    const arm = (node) => {
      const e = endOf(node);
      if (e.start === null || e.fired) return;
      let end = e.stop;
      if (node instanceof NativeBufferSource && node.buffer && !node.loop) {
        const rate = Math.max(1e-3, Math.abs(Number(node.playbackRate?.value) || 1));
        const len = e.dur !== null ? e.dur : Math.max(0, node.buffer.duration - e.offset);
        end = Math.min(end, e.start + len / rate);
      }
      clearTimeout(e.timer);
      if (!Number.isFinite(end)) return; // an oscillator with no stop() never ends
      e.timer = setTimeout(() => fire(node), Math.max(0, (end - node.context.currentTime) * 1000));
    };
    const recorded = (node) => Boolean(node?.context?.__recorded);
    // AudioBufferSourceNode has its own start(when, offset, duration); oscillators
    // and constant sources use the shared one. Arming twice is harmless.
    const wrapStart = (proto, orig) => {
      proto.start = function (when = 0, offset = 0, duration) {
        const r = orig.apply(this, arguments);
        if (recorded(this)) {
          const e = endOf(this);
          e.start = Math.max(Number(when) || 0, this.context.currentTime);
          e.offset = Math.max(0, Number(offset) || 0);
          e.dur = Number.isFinite(Number(duration)) && duration !== undefined ? Math.max(0, Number(duration)) : null;
          arm(this);
        }
        return r;
      };
    };
    wrapStart(NativeBufferSource.prototype, NativeBufferSource.prototype.start);
    wrapStart(ASN, ASN.start);
    const origStop = ASN.stop;
    ASN.stop = function (when = 0) {
      const r = origStop.apply(this, arguments);
      if (recorded(this)) {
        const e = endOf(this);
        e.stop = Math.min(e.stop, Math.max(Number(when) || 0, this.context.currentTime));
        arm(this);
      }
      return r;
    };
    const onDesc = Object.getOwnPropertyDescriptor(ASN, 'onended');
    Object.defineProperty(ASN, 'onended', {
      configurable: true,
      enumerable: true,
      get() {
        return recorded(this) ? endOf(this).prop : onDesc?.get?.call(this);
      },
      set(fn) {
        if (recorded(this)) endOf(this).prop = typeof fn === 'function' ? fn : null;
        else onDesc?.set?.call(this, fn);
      },
    });
    const origAdd = ASN.addEventListener || EventTarget.prototype.addEventListener;
    const origRemove = ASN.removeEventListener || EventTarget.prototype.removeEventListener;
    ASN.addEventListener = function (type, h, ...rest) {
      if (type === 'ended' && recorded(this)) {
        if (h) endOf(this).handlers.add(h);
        return undefined;
      }
      return origAdd.call(this, type, h, ...rest);
    };
    ASN.removeEventListener = function (type, h, ...rest) {
      if (type === 'ended' && recorded(this)) {
        endOf(this).handlers.delete(h);
        return undefined;
      }
      return origRemove.call(this, type, h, ...rest);
    };
  }

  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  /** Render every recorded context; keep [fromPerf, toPerf) ms of fake time as stereo float. */
  // --progressive: render `ctx` on to `t` seconds (a render quantum's edge) and stop there. A graph rendered at the end
  // holds every node of the whole recording at once (disconnect is a no-op here), which grows slow past a few
  // minutes of a busy music bed; rendered as it goes, each chunk only meets the nodes alive in it.
  REC.renderTo = (ctx, t) => {
    const q = 128 / ctx.sampleRate;
    const at = Math.floor(t / q + 1e-6) * q;
    if (ctx.__busy || at <= ctx.__done + 1e-9 || at >= ctx.length / ctx.sampleRate - q) return false;
    ctx.__busy = true;
    ctx.__pending = Offline.prototype.suspend.call(ctx, at).then(() => {
      ctx.__done = at;
      ctx.__busy = false;
      // (the render has passed these: made now, the nodes leave the graph)
      const keep = [];
      for (const d of ctx.__disc) {
        if (d.at > at) {
          keep.push(d);
          continue;
        }
        try {
          REC.origDisconnect.apply(d.node, d.args);
        } catch { /* already gone */ }
      }
      ctx.__disc = keep;
    }, (err) => {
      ctx.__busy = false;
      REC.renderError = String(err);
    });
    if (ctx.__done > 0) Offline.prototype.resume.call(ctx).catch(() => {});
    return true;
  };
  /** Called after every clock step: each context renders on to a chunk's edge at least `margin` behind the page's clock. */
  REC.pump = () => {
    if (!CFG.progressive) return;
    for (const ctx of REC.contexts) {
      const fake = (now() - ctx.__origin) / 1000;
      const target = Math.floor((fake - CFG.margin) / CFG.chunk) * CFG.chunk;
      if (target > 0) REC.renderTo(ctx, target);
    }
  };
  REC.render = async (fromPerf, toPerf) => {
    const n = Math.max(1, Math.round(((toPerf - fromPerf) / 1000) * SR));
    const out = [new Float32Array(n), new Float32Array(n)];
    const info = [];
    for (const ctx of REC.contexts) {
      const t0 = Date.now();
      let buf;
      if (CFG.progressive) {
        // the last chunk: wait for the suspend in flight, then let it run to its end
        if (ctx.__busy) await ctx.__pending;
        if (ctx.__done > 0) Offline.prototype.resume.call(ctx).catch(() => {});
        buf = await ctx.__final;
      } else buf = await Offline.prototype.startRendering.call(ctx);
      const off = Math.round(((fromPerf - ctx.__origin) / 1000) * buf.sampleRate);
      const L = buf.getChannelData(0);
      const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      for (let i = 0; i < n; i++) {
        const j = off + i;
        if (j < 0 || j >= L.length) continue;
        out[0][i] += L[j];
        out[1][i] += R[j];
      }
      info.push({ origin: ctx.__origin, renderMs: Date.now() - t0, length: L.length });
    }
    REC.audioOut = out;
    return { n, sampleRate: SR, contexts: info, stats: REC.stats };
  };
  REC.chunk = (ch, from, count) => b64(new Uint8Array(REC.audioOut[ch].buffer, from * 4, count * 4));

  // Instrumentation of the channel's own objects (main.js hands them over).
  window.__recHook = ({ audio, director, renderer = null }) => {
    REC.renderer = renderer;
    try {
      if (audio && typeof audio.sfx === 'function') {
        const sfx = audio.sfx.bind(audio);
        audio.sfx = (name, o = {}) => {
          ev({ type: 'sfx', name, startAt: Number.isFinite(o?.startAt) ? o.startAt : now() });
          return sfx(name, o);
        };
        const speak = audio.speak.bind(audio);
        audio.speak = (text, slot, o = {}) => {
          const recorded = Boolean(o?.audio?.url || o?.audio?.buffer);
          ev({ type: 'speak', slot, recorded, text: String(text).slice(0, 60) });
          const onSentence = o?.onSentence;
          return speak(text, slot, {
            ...o,
            onSentence: (s, i) => {
              ev({ type: 'sentence', slot, i, recorded, text: String(s).slice(0, 40) });
              return onSentence?.(s, i);
            },
          });
        };
      }
      if (director && typeof director.setShot === 'function') {
        const setShot = director.setShot.bind(director);
        director.setShot = (shot, extra) => {
          const before = director.scene?.shotSince;
          const r = setShot(shot, extra);
          // (the card's kind tells the channel's ident from the break bumper, which shares its shot: the publish gate
          // reads the ident before every programme from these events, server/compliance/clips.js)
          if (director.scene?.shotSince !== before) ev({ type: 'shot', shot, ...(extra?.card?.kind ? { card: extra.card.kind } : {}) });
          return r;
        };
      }
      if (CFG.trace && director) {
        // --trace: the quiz director's own trace (quizdirector.js pushes to d.quizTrace when it exists), and every music
        // cue and countdown the director asks for, with what the bed answered (the ticks' times, in s from the ask)
        director.quizTrace = [];
        const music = director.music;
        if (music && typeof music.cue === 'function') {
          const cue = music.cue.bind(music);
          music.cue = (moment, o = {}) => {
            const r = cue(moment, o);
            ev({ type: 'music', moment, played: r !== false, double: !!o?.double, endsAt: Number.isFinite(o?.endsAt) ? o.endsAt * 1000 : null });
            return r;
          };
        }
        if (music && typeof music.countdown === 'function') {
          const countdown = music.countdown.bind(music);
          music.countdown = (halves, lead) => {
            const r = countdown(halves, lead);
            ev({ type: 'countdown', halves, lead, start: r?.start, ticks: r?.ticks, end: r?.end, half: r?.half });
            return r;
          };
        }
      }
      REC.director = director;
      REC.audio = audio;
      REC.hooked = true;
    } catch (err) {
      REC.hookError = String(err);
    }
  };
}

// 32-bit float WAV (ffmpeg reads it; no dither needed).
export function writeWav(file, chans, sr) {
  const n = chans[0].length;
  const nc = chans.length;
  const data = Buffer.alloc(n * nc * 4);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) data.writeFloatLE(chans[c][i], (i * nc + c) * 4);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20); // IEEE float
  h.writeUInt16LE(nc, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * nc * 4, 28);
  h.writeUInt16LE(nc * 4, 32);
  h.writeUInt16LE(32, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
