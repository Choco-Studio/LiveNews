// Shared machinery of the long title sequences (worldtitles.js and the programme sequences):
// camera tracks, the hand-over to the package's reveal and a full-frame pixel layer.
//
// Rules learnt on WORLD NOW's (owner, 9 Oct: "it vibrates"): geometry stays fractional until a
// pixel is plotted (never round a centre and a size apart), dithers are fixed on the screen (a
// pixel of a moving gradient changes once as it passes, never back and forth), and a detail that
// zooms is drawn from nested samples so it never slides.
import { BAYER4 } from '../../gfx/index.js';
import { TL, playOpen, frameBuffer, W, H, CENTRE } from './kit.js';

/** Keyframes [[beat, value], ...] -> a monotone cubic through them (no overshoot, no stop at a key). */
export function track(keys) {
  const n = keys.length;
  const b = keys.map((k) => k[0]);
  const v = keys.map((k) => k[1]);
  const m = new Array(n).fill(0);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((v[i + 1] - v[i]) / (b[i + 1] - b[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (x) => {
    if (x <= b[0]) return v[0];
    if (x >= b[n - 1]) return v[n - 1];
    let i = 0;
    while (x > b[i + 1]) i++;
    const h = b[i + 1] - b[i];
    const t = (x - b[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * v[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * v[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/**
 * A title sequence that ends on the package's open: `before(ctx, dt, info)` draws everything up to
 * the hand-over; from then on the package's own open plays on a clock shifted so that its still
 * frame (TL.still) lands on `hit` (seconds). reveal = the programme's prog for playOpen; handAt = the
 * package clock's instant it takes over at (default: the reveal, TL.glide; earlier when the
 * sequence lands on the emblem's own build).
 */
export function sequence({ hit, before, reveal, handAt = TL.glide }) {
  const shift = hit - TL.still;
  const revealAt = shift + handAt;
  return {
    shift,
    revealAt,
    still: hit,
    duration: hit + 0.8,
    draw(ctx, dt, info) {
      if (dt < revealAt) before(ctx, dt, info);
      else playOpen(ctx, dt - shift, info, reveal);
    },
  };
}

/** A full-frame pixel layer: begin() clears it, plot*() write palette colours (u32), end() blits it. */
export class Layer {
  constructor(key) {
    this.key = key;
    this.fb = null;
    this.d = null;
  }
  begin(fill = 0) {
    this.fb = frameBuffer(this.key, W, H);
    this.d = this.fb.d;
    this.d.fill(fill);
    return this.d;
  }
  plot(x, y, c) {
    if (x >= 0 && x < W && y >= 0 && y < H) this.d[y * W + x] = c;
  }
  /** Plot through the screen-fixed Bayer matrix (anchored where the emblems stand): drawn where a > threshold. */
  plotA(x, y, c, a) {
    if (a >= 1 || BAYER4[(((y - CENTRE.y) & 3) << 2) | ((x - CENTRE.x) & 3)] < a * 16) this.plot(x, y, c);
  }
  end(ctx) {
    this.fb.cx.putImageData(this.fb.img, 0, 0);
    ctx.drawImage(this.fb.cv, 0, 0);
  }
}

/** The screen-fixed Bayer threshold (0..15) at a pixel, anchored on the emblems' centre stage. */
export const ditherAt = (x, y) => BAYER4[(((y - CENTRE.y) & 3) << 2) | ((x - CENTRE.x) & 3)];
