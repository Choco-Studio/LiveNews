// The page's census (tools/leak/watch.mjs): every canvas, image, video, OffscreenCanvas, ImageBitmap, AudioContext,
// AudioBuffer and audio node the page makes is counted when it is made and again when the garbage collector frees it
// (a FinalizationRegistry), so "live" is what the page still holds after a forced collection. Canvases and audio
// buffers also carry their bytes (a backing store, the decoded samples): the memory the JS heap never shows.
//
// Runs in the page before any page script (page.addInitScript(censusInit)); read with window.__census.read().

export function censusInit() {
  'use strict';
  if (window.__census) return;
  const made = Object.create(null);
  const live = Object.create(null);
  const bytes = Object.create(null);
  // where each thing was made (the first two frames of page code): what the page still holds, by the code that made it
  const sites = new Map();
  const reg = new FinalizationRegistry(({ k, b, s }) => {
    live[k]--;
    if (b) bytes[k] -= b;
    const x = sites.get(s);
    if (x) {
      x.live--;
      x.bytes -= b;
    }
  });
  const site = () => {
    const lines = String(new Error().stack || '').split('\n').slice(1);
    const page = lines.filter((l) => !/census|__puppeteer|<anonymous>|extensions::/.test(l) && /\/js\//.test(l));
    return page.slice(0, 2).map((l) => (/\/js\/([^?)]+?)(?:\?[^:)]*)?:(\d+):\d+\)?$/.exec(l.trim()) || [])[1] + ':' + (/:(\d+):\d+\)?$/.exec(l.trim()) || [])[1]).join(' < ') || '?';
  };
  let lastSite = '?';
  const once = new WeakSet();
  const track = (k, o, b = 0) => {
    if (!o || (typeof o !== 'object' && typeof o !== 'function') || once.has(o)) return o;
    once.add(o);
    made[k] = (made[k] || 0) + 1;
    live[k] = (live[k] || 0) + 1;
    if (b) bytes[k] = (bytes[k] || 0) + b;
    const s = (lastSite = `${k} @ ${site()}`);
    const x = sites.get(s) || sites.set(s, { made: 0, live: 0, bytes: 0 }).get(s);
    x.made++;
    x.live++;
    x.bytes += b;
    reg.register(o, { k, b, s });
    return o;
  };
  // canvases: their size can change after they are made, so their bytes are summed when read (weakly held)
  const canvases = new Set();
  const weak = (o) => {
    const r = new WeakRef(o);
    r.site = lastSite;
    canvases.add(r);
  };

  const createElement = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, opts) {
    const el = createElement.call(this, tag, opts);
    const t = String(tag).toLowerCase();
    track(`<${t}>`, el);
    if (t === 'canvas') weak(el);
    return el;
  };
  const NativeImage = window.Image;
  function Image(w, h) {
    return track('<img>', arguments.length ? new NativeImage(w, h) : new NativeImage());
  }
  Image.prototype = NativeImage.prototype;
  window.Image = Image;
  if (window.OffscreenCanvas) {
    const N = window.OffscreenCanvas;
    window.OffscreenCanvas = class OffscreenCanvas extends N {
      constructor(w, h) {
        super(w, h);
        track('OffscreenCanvas', this);
        weak(this);
      }
    };
  }
  if (window.createImageBitmap) {
    const f = window.createImageBitmap;
    window.createImageBitmap = function (...a) {
      return f.apply(this, a).then((b) => track('ImageBitmap', b, (b.width * b.height * 4) | 0));
    };
  }
  const objectUrls = new Set();
  const cou = URL.createObjectURL;
  const rou = URL.revokeObjectURL;
  URL.createObjectURL = function (o) {
    const u = cou.call(URL, o);
    objectUrls.add(u);
    return u;
  };
  URL.revokeObjectURL = function (u) {
    objectUrls.delete(u);
    return rou.call(URL, u);
  };

  // ---- large pixel and sample buffers (64 kB and up: a 128x128 RGBA picture): the memory outside the JS heap's count
  const BIG = 65536;
  for (const name of ['Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array']) {
    const N = window[name];
    const C = class extends N {
      constructor(...a) {
        super(...a);
        // (a view of another buffer is that buffer's: only arrays that made their own are counted)
        if (this.byteLength >= BIG && !(a[0] instanceof ArrayBuffer) && !(typeof SharedArrayBuffer !== 'undefined' && a[0] instanceof SharedArrayBuffer)) track(`buf:${name}`, this, this.byteLength);
      }
    };
    Object.defineProperty(C, 'name', { value: name });
    window[name] = C;
  }
  const NAB = window.ArrayBuffer;
  const AB = new Proxy(NAB, {
    construct(target, args, nt) {
      const b = Reflect.construct(target, args, nt === AB ? target : nt);
      if (b.byteLength >= BIG) track('buf:ArrayBuffer', b, b.byteLength);
      return b;
    },
  });
  window.ArrayBuffer = AB;
  const C2D = window.CanvasRenderingContext2D?.prototype;
  if (C2D) {
    for (const m of ['getImageData', 'createImageData']) {
      const f = C2D[m];
      C2D[m] = function (...a) {
        const d = f.apply(this, a);
        if (d?.data?.byteLength >= BIG) track(`buf:${m}`, d.data, d.data.byteLength);
        return d;
      };
    }
  }

  // ---- audio
  const contexts = [];
  const wrapContext = (name) => {
    const N = window[name];
    if (!N) return;
    const C = class extends N {
      constructor(...a) {
        super(...a);
        track(name, this);
        if (name === 'AudioContext') contexts.push(new WeakRef(this));
      }
    };
    Object.defineProperty(C, 'name', { value: name });
    window[name] = C;
  };
  // (an init script that runs later, the live capture's tap, subclasses whatever window.AudioContext is: it still counts)
  wrapContext('AudioContext');
  wrapContext('OfflineAudioContext');
  const B = window.BaseAudioContext?.prototype;
  if (B) {
    const bufBytes = (b) => (b && b.length * b.numberOfChannels * 4) | 0;
    const decode = B.decodeAudioData;
    B.decodeAudioData = function (data, ok, bad) {
      const p = decode.call(this, data, ok ? (b) => ok(track('AudioBuffer', b, bufBytes(b))) : undefined, bad);
      return p.then((b) => track('AudioBuffer', b, bufBytes(b)));
    };
    const createBuffer = B.createBuffer;
    B.createBuffer = function (...a) {
      const b = createBuffer.apply(this, a);
      return track('AudioBuffer', b, bufBytes(b));
    };
    for (const proto of [B, window.AudioContext && Object.getPrototypeOf(window.AudioContext.prototype)]) {
      if (!proto) continue;
      for (const m of Object.getOwnPropertyNames(proto)) {
        if (!/^create(?!Buffer$|PeriodicWave$)/.test(m) || typeof Object.getOwnPropertyDescriptor(proto, m)?.value !== 'function') continue;
        const f = proto[m];
        proto[m] = function (...a) {
          const n = f.apply(this, a);
          // a DelayNode holds its whole buffer (maxDelayTime x the rate, per channel) for as long as it lives
          const b = m === 'createDelay' ? ((Number(a[0]) || 1) * this.sampleRate * 2 * 4) | 0 : 0;
          return track(`audio:${m.slice(6)}`, n, b);
        };
      }
    }
    const NativeBuffer = window.AudioBuffer;
    if (NativeBuffer) {
      window.AudioBuffer = class AudioBuffer extends NativeBuffer {
        constructor(o) {
          super(o);
          track('AudioBuffer', this, bufBytes(this));
        }
      };
    }
  }

  window.__census = {
    read() {
      let n = 0;
      let px = 0;
      let big = 0;
      const canvasBySite = new Map();
      for (const r of canvases) {
        const c = r.deref();
        if (!c) {
          canvases.delete(r);
          continue;
        }
        n++;
        const b = (c.width * c.height * 4) | 0;
        px += b;
        if (b >= 384 * 216 * 4) big++;
        const s = r.site || '?';
        const x = canvasBySite.get(s) || canvasBySite.set(s, { live: 0, bytes: 0 }).get(s);
        x.live++;
        x.bytes += b;
      }
      let running = 0;
      for (const r of contexts) {
        const c = r.deref();
        if (c && c.state !== 'closed') running++;
      }
      return {
        made: { ...made },
        live: { ...live },
        bytes: { ...bytes },
        canvases: { live: n, bytes: px, fullFrame: big },
        // the canvases still held, by the code that made them (largest first), and every other kind by site
        canvasSites: [...canvasBySite.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 40).map(([s, v]) => ({ s, ...v })),
        sites: [...sites.entries()].filter(([, v]) => v.live > 0).sort((a, b) => b[1].live - a[1].live).slice(0, 60).map(([s, v]) => ({ s, ...v })),
        bytesBySite: [...sites.entries()].filter(([, v]) => v.bytes > 0).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 40).map(([s, v]) => ({ s, ...v })),
        audioContexts: running,
        objectUrls: objectUrls.size,
        attachedNodes: document.getElementsByTagName('*').length,
      };
    },
  };
}
