// The footage deck (owner 4 Oct: "cargar vídeos, pixelarlos con nuestro estilo"): plays a link's FILE clip of
// the place (server/footage.js, /api/vid/<id>.webm) in a hidden, muted <video> and hands the renderer its
// frames in the channel's pixel style (footage/pixel.js), at 192x108 (shown at 2x) and 12 frames a second:
// the stepped motion of pixel animation, and a sixth of the work of a 384x216, 30 fps conversion.
//
// Two gradings of the same clip:
//   'full'  the B-roll shot: pixelate.js's punch (saturation 1.25, contrast 1.12)
//   'back'  behind a correspondent: flatter and darker, so the person in front is the brightest thing
// Each keeps its palette for the whole shot of the clip it is in, and takes a new one only at a cut in the
// footage (the light's histogram moves by more than FOOTAGE.cut): nothing flickers while the camera pans.
// A clip plays while its frames are asked for and pauses a moment after (the next shot of the same link goes
// on from there: new pictures, never the same seconds twice).
//
//   const deck = new FootageDeck()
//   deck.prepare({ id, start })   load a clip ahead of its link (idempotent)
//   deck.ready(id)                its first frame can be shown
//   deck.frame(id, 'full'|'back', t)  -> { px (u32 192x108), w, h } | null (the last good frame while it stalls)
import { FOOTAGE, gradeInto, paletteOf, lutOf, quantise } from './pixel.js';

export const DECK = { w: 192, h: 108, fps: 12, keep: 4, idleMs: 1500, skip: 4, maxSkips: 6, tail: 6 };
const VARIANTS = {
  full: { saturation: FOOTAGE.saturation, contrast: FOOTAGE.contrast, gain: 1 },
  back: { saturation: 0.85, contrast: 0.86, gain: 0.64 },
};
const N = DECK.w * DECK.h;

/** A 16-bin histogram of a graded frame's light (sampled), normalised to 1. */
function histogram(rgb, out) {
  out.fill(0);
  let n = 0;
  for (let i = 0; i < N; i += 7) {
    const o = i * 3;
    const l = (0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2]) | 0;
    out[l >> 4]++;
    n++;
  }
  for (let k = 0; k < 16; k++) out[k] /= n || 1;
  return out;
}
const histDistance = (a, b) => {
  let d = 0;
  for (let k = 0; k < 16; k++) d += Math.abs(a[k] - b[k]);
  return d / 2;
};

export class FootageDeck {
  constructor({ doc = globalThis.document, now = () => performance.now() } = {}) {
    this.doc = doc;
    this.now = now;
    this.clips = new Map(); // id -> clip
    this.canvas = null;
    this.ctx = null;
    this.rgb = new Uint8Array(N * 3);
    this.hist = new Float32Array(16);
  }

  /** Load a clip ahead of its link (a few seconds of headroom: the link's throw and the piece's first line). */
  prepare(footage) {
    if (!footage?.id || !this.doc?.createElement || this.clips.has(footage.id)) return;
    const v = this.doc.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.loop = false; // the deck turns back itself (play), before the closing credits
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    const clip = { id: footage.id, v, start: Math.max(0, Number(footage.start) || 0), state: 'loading', seeked: false, skips: 0, used: 0, out: {}, at: -1 };
    v.addEventListener('loadeddata', () => {
      if (clip.state === 'loading') clip.state = 'ready';
    });
    v.addEventListener('error', () => (clip.state = 'failed'));
    v.src = `/api/vid/${footage.id}.webm`;
    try {
      v.load();
    } catch {
      clip.state = 'failed';
    }
    this.clips.set(footage.id, clip);
    // keep the deck small: the clips not asked for longest go
    if (this.clips.size > DECK.keep) {
      const old = [...this.clips.values()].filter((c) => c !== clip).sort((a, b) => a.used - b.used)[0];
      if (old) this.drop(old.id);
    }
  }

  drop(id) {
    const c = this.clips.get(id);
    if (!c) return;
    try {
      c.v.pause();
      c.v.removeAttribute('src');
      c.v.load();
    } catch {}
    this.clips.delete(id);
  }

  ready(id) {
    const c = this.clips.get(id);
    return !!c && c.state === 'ready' && c.v.readyState >= 2 && c.v.videoWidth > 0;
  }

  /** The clip's current frame in a grading, refreshed DECK.fps times a second; null until it has one. */
  frame(id, variant = 'full', t = 0) {
    const c = this.clips.get(id);
    if (!c) return null;
    const ms = this.now();
    c.used = ms;
    this.sweep(ms, c);
    if (!this.ready(id)) return c.out[variant]?.px ? c.out[variant] : null;
    this.play(c);
    const step = Math.floor(c.v.currentTime * DECK.fps);
    const out = (c.out[variant] ||= { px: new Uint32Array(N), w: DECK.w, h: DECK.h, step: -1, pal: null, lut: null, hist: new Float32Array(16), fresh: false });
    if (out.step === step && out.fresh) return out;
    if (!this.grab(c.v)) return out.fresh ? out : null;
    const g = VARIANTS[variant] || VARIANTS.full;
    gradeInto(this.read, N, this.rgb, g);
    histogram(this.rgb, this.hist);
    // a title card or a fade to black (nine tenths of the picture in the darkest bins): never on air; the clip
    // jumps on a few seconds (at most a few times), and the last good frame holds meanwhile
    if (this.hist[0] + this.hist[1] + this.hist[2] > 0.9 && c.skips < DECK.maxSkips) {
      c.skips++;
      this.seek(c, c.v.currentTime + DECK.skip);
      return out.fresh ? out : null;
    }
    if (g.gain !== 1) {
      for (let i = 0; i < this.rgb.length; i++) this.rgb[i] = (this.rgb[i] * g.gain) | 0;
      histogram(this.rgb, this.hist);
    }
    // a new palette only at a cut in the footage (or the first frame)
    if (!out.pal || histDistance(this.hist, out.hist) > FOOTAGE.cut * 2.2) {
      out.pal = paletteOf(this.rgb, N, FOOTAGE.colours);
      out.lut = lutOf(out.pal);
      out.hist.set(this.hist);
    }
    quantise(this.rgb, DECK.w, DECK.h, out.pal, out.lut, out.px);
    out.step = step;
    out.fresh = true;
    return out;
  }

  play(c) {
    const v = c.v;
    if (!c.seeked) {
      c.seeked = true;
      if (c.start > 0 && c.start < (v.duration || Infinity) - 1) this.seek(c, c.start);
    }
    // back to the start before the closing seconds (credits, a logo): the loop never shows the opening titles
    if (Number.isFinite(v.duration) && v.duration > DECK.tail * 2 && v.currentTime > v.duration - DECK.tail) this.seek(c, c.start);
    if (v.paused) v.play?.()?.catch?.(() => {});
  }

  seek(c, at) {
    try {
      const d = c.v.duration;
      c.v.currentTime = Number.isFinite(d) && at > d - DECK.tail ? c.start : Math.max(0, at);
    } catch {}
  }

  /** Pause the clips nobody has asked a frame of lately (one link's clip plays at a time). */
  sweep(ms, keep) {
    for (const c of this.clips.values()) if (c !== keep && !c.v.paused && ms - c.used > DECK.idleMs) c.v.pause();
  }

  /** The video's current picture, cover-cropped (a little above centre) into the 192x108 read buffer. */
  grab(v) {
    if (!this.canvas) {
      this.canvas = this.doc.createElement('canvas');
      this.canvas.width = DECK.w;
      this.canvas.height = DECK.h;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return false;
    const scale = Math.max(DECK.w / vw, DECK.h / vh);
    const sw = DECK.w / scale, sh = DECK.h / scale;
    const sx = (vw - sw) / 2, sy = Math.max(0, (vh - sh) * 0.4);
    try {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
      this.ctx.drawImage(v, sx, sy, sw, sh, 0, 0, DECK.w, DECK.h);
      const d = this.ctx.getImageData(0, 0, DECK.w, DECK.h).data;
      this.read = new Uint32Array(d.buffer, d.byteOffset, N);
      return true;
    } catch {
      return false;
    }
  }
}
