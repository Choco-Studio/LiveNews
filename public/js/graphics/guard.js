// Shot guard: one broken shot must never take the channel off air.
// Renderer.render() draws the shot through `guard.shot(renderer, t, scene)`.
// When the shot code throws (once, or on every frame for as long as a faulty
// ad or scene lasts), the guard puts the canvas state right (a throw between
// save() and restore() would otherwise leave its clip or transform on every
// later frame), shows the last picture that drew cleanly for a moment (a held
// frame reads as a glitch, a black frame as a dead channel) and then a calm
// slate. The graphics and the stinger are drawn after it as usual, so the bug,
// clock and ticker stay on air. Errors are logged once each.
import { P } from '../palette.js';
import { drawLogo, measureLogo } from '../logo.js';

/** Seconds a failing shot shows its last good picture before the slate. */
export const GUARD_HOLD = 2.5;

/** Reset a canvas' 2D state (clip, transform, alpha) and clear it; pixel art stays sharp. */
export function resetCanvas(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (typeof ctx.reset === 'function') ctx.reset();
  else canvas.width = canvas.width; // eslint-disable-line no-self-assign
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export class FrameGuard {
  constructor() {
    this.last = null; // offscreen copy of the last shot that drew cleanly (made on first use)
    this.lastCtx = null;
    this.has = false;
    this.failSince = null;
    this.failures = 0;
    this.errors = new Set();
  }

  /** Draw the renderer's shot; returns false when it threw (and the frame was recovered). */
  shot(renderer, t, scene) {
    try {
      renderer.drawShot(t, scene);
    } catch (err) {
      this.log(err);
      this.recover(renderer, t);
      return false;
    }
    this.failSince = null;
    this.keep(renderer.ctx);
    return true;
  }

  /** Copy the clean shot (before the graphics go on top) for a possible held frame. */
  keep(ctx) {
    const src = ctx?.canvas;
    if (!src || !src.width) return;
    if (!this.last) {
      if (typeof document === 'undefined') return;
      this.last = document.createElement('canvas');
      this.last.width = src.width;
      this.last.height = src.height;
      this.lastCtx = this.last.getContext('2d');
      if (!this.lastCtx) return;
      this.lastCtx.imageSmoothingEnabled = false;
      this.lastCtx.globalCompositeOperation = 'copy'; // replace, never blend
    }
    try {
      this.lastCtx.drawImage(src, 0, 0);
      this.has = true;
    } catch {
      this.has = false;
    }
  }

  /**
   * After a throw: reset every canvas the renderer draws on, then paint the
   * held frame (for GUARD_HOLD seconds) or the slate. Also used by main.js
   * when something after the shot fails.
   */
  recover(renderer, t) {
    this.failures++;
    if (this.failSince === null || !(t >= this.failSince)) this.failSince = t;
    const ctx = resetCanvas(renderer.canvas) || renderer.ctx;
    resetCanvas(renderer.stage);
    if (ctx) this.paint(ctx, t);
  }

  paint(ctx, t) {
    const w = ctx.canvas?.width || 384;
    const h = ctx.canvas?.height || 216;
    if (this.has && t - this.failSince < GUARD_HOLD) {
      ctx.drawImage(this.last, 0, 0);
      return;
    }
    // the slate: a plain ink field and the channel mark, nothing that moves
    ctx.fillStyle = P.ink;
    ctx.fillRect(0, 0, w, h);
    try {
      const m = measureLogo({ variant: 'full' });
      drawLogo(ctx, Math.round((w - m.w) / 2), Math.round((h - m.h) / 2) - 8, { variant: 'full' });
    } catch {
      /* the plain field is enough */
    }
  }

  log(err) {
    const key = `${err?.name}: ${err?.message}`;
    if (this.errors.has(key) || this.errors.size >= 20) return;
    this.errors.add(key);
    console.error('[shot]', err);
  }
}
