#!/usr/bin/env node
// Deterministic video recorder WITH SOUND. Freezes the page clock (Date,
// timers, performance.now, requestAnimationFrame) with Playwright's fake
// clock, then advances it exactly 1/fps per frame and grabs the #screen
// canvas. The video is perfectly smooth however loaded the machine is (live
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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

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

// ------------------------------------------------------------------ page side

// Runs in the page before any page script (page.addInitScript). Kept as a
// function so it is real code; CFG arrives as its argument.
function pageInit(CFG) {
  'use strict';
  const REC = { inflight: 0, events: [], contexts: [], decoded: new WeakSet(), stats: { valueSets: 0, disconnects: 0, starts: 0 } };
  window.__rec = REC;
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
      return undefined;
    }
    return origDisconnect.apply(this, a);
  };
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
  REC.render = async (fromPerf, toPerf) => {
    const n = Math.max(1, Math.round(((toPerf - fromPerf) / 1000) * SR));
    const out = [new Float32Array(n), new Float32Array(n)];
    const info = [];
    for (const ctx of REC.contexts) {
      const t0 = Date.now();
      const buf = await Offline.prototype.startRendering.call(ctx);
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
  window.__recHook = ({ audio, director }) => {
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
          if (director.scene?.shotSince !== before) ev({ type: 'shot', shot });
          return r;
        };
      }
      REC.director = director;
      REC.audio = audio;
      REC.hooked = true;
    } catch (err) {
      REC.hookError = String(err);
    }
  };
}

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
  await page.addInitScript(pageInit, { audio: withAudio, sampleRate: opts.rate, maxSeconds, seed });
  // Hand the channel's AudioEngine and Director to the instrumentation (recorder only;
  // the product code is untouched). main.js keeps them as top-level `audio` and `player`.
  await page.route(/\/js\/main\.js(\?.*)?$/, async (route) => {
    const res = await route.fetch();
    const hook = "\ntry { window.__recHook?.({ audio: typeof audio !== 'undefined' ? audio : null, director: typeof player !== 'undefined' ? player : null }); } catch (e) { /* recorder hook */ }\n";
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
    return { url: c.toDataURL('image/png'), perf: performance.now(), sig: btoa(sig), sub: sc?.subtitle ?? null, shot: sc?.shot ?? null };
  }, opts.selector);
  if (!shot) throw new Error(`no canvas matches ${opts.selector}`);
  perfs.push(shot.perf);
  sigs.push(Buffer.from(shot.sig, 'base64'));
  scenes.push({ sub: shot.sub, shot: shot.shot });
  fs.writeFileSync(path.join(dir, `f${String(i).padStart(6, '0')}.png`), Buffer.from(shot.url.split(',')[1], 'base64'));
  if (i % (opts.fps * 10) === 0) process.stdout.write(`  ${Math.round((i / total) * 100)}%\r`);
}
say(`${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s${held ? ` (${held} steps did not wait for slow network)` : ''}`);

// ---------------------------------------------------------------- sound
let wavFile = null;
let audioInfo = null;
let events = [];
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
}
await browser.close();

// 32-bit float WAV (ffmpeg reads it; no dither needed).
function writeWav(file, chans, sr) {
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

const args = ['-v', 'error', '-y', '-framerate', String(opts.fps), '-i', path.join(dir, 'f%06d.png')];
if (wavFile) args.push('-i', wavFile);
args.push('-vf', `scale=iw*${opts.scale}:ih*${opts.scale}:flags=neighbor`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium');
if (wavFile) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-map', '0:v', '-map', '1:a');
args.push('-movflags', '+faststart', opts.out);
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
  const sync = [];
  for (const e of events) {
    if (e.type === 'sfx' && e.va >= 0.1 && e.va < opts.seconds - 0.3) sync.push({ kind: 'sfx', at: e.va, label: e.name, audioMs: onset(e.va), pictureMs: change(e.va) });
    if (e.type === 'sentence' && e.recorded && e.v >= 0.1 && e.v < opts.seconds - 0.3) sync.push({ kind: 'caption', at: e.v, label: `${e.slot}: "${e.text}"`, audioMs: onset(e.v), pictureMs: captionAt(e.text, e.v) });
  }
  sync.sort((a, b) => a.at - b.at);
  const sentences = events.filter((e) => e.type === 'sentence');
  return {
    out: opts.out,
    seconds: opts.seconds,
    fps: opts.fps,
    loudness: loud,
    audio: audioInfo,
    speech: { recorded: sentences.filter((e) => e.recorded).length, browser: sentences.filter((e) => !e.recorded).length },
    events: events.map(({ t, ...e }) => e),
    sync,
  };
}
