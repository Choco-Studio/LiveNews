// The GLOBIT 24 programme-open package: one structure shared by every show so
// the opens read as one network, re-dressed per programme by an accent colour
// and an emblem (docs/ART_DIRECTION.md, "Programme open").
//
// Every open lasts 4 s in three acts on the same clock:
//   BUILD  0.0-1.5  the yellow "bit" from the logo appears at centre stage and
//                   the programme's emblem builds around it (its one motion idea)
//   REVEAL 1.5-3.2  the emblem glides to its slot on the left, the title plate
//                   wipes out from behind it, the title rises in at 2x, then the
//                   tagline and credits; the bit hops onto the plate's corner and
//                   the channel bug wipes in top-left with its glint
//   SETTLE 3.2-4.0  the lock-up holds perfectly still for the hard cut
//
// Everything is a pure function of dt, drawn in whole pixels with palette
// colours; static layers are baked once into offscreen canvases.
import { P } from '../../palette.js';
import { drawText, measureText } from '../../font.js';
import { drawLogo, measureLogo } from '../../logo.js';
import {
  mk, memo, u32, clamp, lerp, seg, easeOut, easeOutQuint, easeInOut, bayer,
  ellipsis, nameList, discSpans, clipRect,
} from '../../gfx/index.js';

export const W = 384;
export const H = 216;
export const DURATION = 4.0;

/** Where the emblem builds (act 1) and where it settles in the lock-up. */
export const CENTRE = { x: 192, y: 98 };
export const SLOT = { x: 100, y: 98 };

/** The shared clock (seconds from the start of the open). */
export const TL = {
  seed: 0.08, // the bit appears where the emblem will grow
  glide: 1.5, // emblem glides from centre stage to its slot
  glideDur: 0.75,
  plate: 1.92, // title plate wipes out from behind the emblem
  plateDur: 0.42,
  title: 2.18, // title rises in, 0.1 s after most of the plate is out
  bar: 2.22,
  tag: 2.4,
  credits: 2.55,
  pop: 2.12, // the bit pops out of the emblem's shoulder...
  hop: 2.46, // ...and hops onto the plate's top-right corner
  hopDur: 0.42,
  bug: 2.3, // GLOBIT 24 bug wipes in top-left; its glint ends by STILL
  still: 3.2, // nothing moves from here to the cut
};

const cached = memo(160);

// ---------------------------------------------------------------------------
// Act 2 motion

/** Emblem size in act 1 relative to its lock-up size: the glide is also a pull-back. */
export const ZOOM = 1.6;

/** Emblem scale at dt (ZOOM at centre stage, 1 in the lock-up), same easing as the glide. */
export function emblemScale(dt) {
  return lerp(ZOOM, 1, easeInOut(seg(dt, TL.glide, TL.glideDur)));
}

/** Emblem centre at dt: centre stage, then an eased glide with a gentle arc. */
export function emblemPos(dt, out = { x: 0, y: 0 }) {
  const k = easeInOut(seg(dt, TL.glide, TL.glideDur));
  out.x = Math.round(lerp(CENTRE.x, SLOT.x, k));
  out.y = Math.round(lerp(CENTRE.y, SLOT.y, k) - 3 * Math.sin(Math.PI * k));
  return out;
}

// ---------------------------------------------------------------------------
// Backdrop: a graded field (black to ink, Bayer 4x4 between adjacent steps),
// lighter where the emblem lives, with an optional programme texture.

/**
 * Baked backdrop canvas. spec = { key, cx, cy, colors: [dark..light], reach,
 * texture(pix32, w, h, level) } where level(x, y) is the ramp value 0..n.
 */
export function backdrop(spec) {
  return cached(`bg|${spec.key}`, () => {
    const c = mk(W, H);
    const cx = c.getContext('2d');
    const img = cx.createImageData(W, H);
    const d = new Uint32Array(img.data.buffer);
    const cols = (spec.colors || [P.black, P.ink]).map((h) => u32(h));
    const n = cols.length - 1;
    const reach = spec.reach || 210;
    const level = (x, y) => {
      const dx = (x - (spec.cx ?? 192)) / (reach * 1.35);
      const dy = (y - (spec.cy ?? 98)) / reach;
      // a short dithered falloff between flat steps, not one wide checkerboard
      return clamp(((1 - Math.sqrt(dx * dx + dy * dy)) * 2.1 - 0.55) * n, 0, n);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = level(x, y);
        const i = Math.floor(v + bayer(x, y) - 0.5);
        d[y * W + x] = cols[i < 0 ? 0 : i > n ? n : i];
      }
    }
    if (spec.texture) spec.texture(d, level);
    cx.putImageData(img, 0, 0);
    return c;
  });
}

// ---------------------------------------------------------------------------
// The seed bit (the yellow square from the GLOBIT 24 logo)

/** Draws the logo's bit (4x4, cream highlight, orange shade) at size s (1..4). */
export function drawBit(ctx, x, y, s = 4) {
  s = clamp(Math.round(s), 0, 4);
  if (s <= 0) return;
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = P.yellow;
  ctx.fillRect(x, y, s, s);
  if (s >= 3) {
    ctx.fillStyle = P.orange;
    ctx.fillRect(x, y + s - 1, s, 1);
    ctx.fillRect(x + s - 1, y, 1, s);
    ctx.fillStyle = P.cream;
    ctx.fillRect(x, y, 1, 1);
  }
}

/**
 * The bit appears at the emblem centre at TL.seed (growing 1 -> 4 px) and is
 * absorbed (shrinking back) at `absorb`, when the emblem forms around it.
 */
export function drawSeed(ctx, dt, x, y, absorb) {
  if (dt < TL.seed || dt > absorb + 0.12) return;
  const grow = seg(dt, TL.seed, 0.12);
  const shrink = seg(dt, absorb, 0.12);
  const s = Math.round(4 * easeOut(grow) * (1 - shrink));
  if (s > 0) drawBit(ctx, x - (s >> 1), y - (s >> 1), s);
}

// ---------------------------------------------------------------------------
// Title lettering: 5x7 caps at 2x (display level), solid faces only. Light
// titles carry the logo's chrome split (white over silver), never dithered.

function titleCanvas(text, ink) {
  return cached(`title|${ink}|${text}`, () => {
    const w = measureText(text, 2) + 2;
    const c = mk(w, 20);
    const cx = c.getContext('2d');
    drawText(cx, text, 0, 4, { color: ink === 'dark' ? P.black : P.white, scale: 2 });
    if (ink !== 'dark') {
      cx.globalCompositeOperation = 'source-atop';
      cx.fillStyle = P.silver;
      cx.fillRect(0, 4 + 8, w, 6);
    }
    return { cv: c, w: w - 2 };
  });
}

/** Lock-up geometry for a title/tagline/credits set (cached). */
export function lockupLayout(info, style) {
  const key = `lay|${style.ink}|${info.title}|${info.tagline}|${info.presenters.join(',')}`;
  return cached(key, () => {
    const titleX = SLOT.x + 52;
    const maxTitle = W - 19 - 12 - titleX;
    let lines = [String(info.title || '').toUpperCase().trim() || 'GLOBIT 24'];
    if (measureText(lines[0], 2) > maxTitle) {
      // long names: two lines at 2x, the second ellipsised if it still does not fit
      const words = lines[0].split(/\s+/);
      let best = null;
      for (let k = 1; k < words.length; k++) {
        const a = words.slice(0, k).join(' ');
        const b = words.slice(k).join(' ');
        const wmax = Math.max(measureText(a, 2), measureText(b, 2));
        if (!best || wmax < best.w) best = { a, b, w: wmax };
      }
      lines = best ? [ellipsis(best.a, maxTitle, 2), ellipsis(best.b, maxTitle, 2)] : [ellipsis(lines[0], maxTitle, 2)];
    }
    const titles = lines.map((l) => titleCanvas(l, style.ink));
    const titleW = Math.max(...titles.map((t) => t.w));
    const plateH = 12 + titles.length * 14 + (titles.length - 1) * 4;
    const plateY = SLOT.y - 13 - (titles.length - 1) * 9;
    const plateX = SLOT.x + 30;
    const plateW = titleX - plateX + titleW + 12;
    const textW = W - 19 - titleX;
    const tagline = info.tagline ? ellipsis(info.tagline, textW) : '';
    const names = nameList(info.presenters);
    const credits = names ? { label: 'WITH', names: ellipsis(names, textW - measureText('WITH ') - 2) } : null;
    const tagY = plateY + plateH + 9;
    return {
      titles, titleX, titleW, plateX, plateY, plateW, plateH,
      tagline, tagY, credits, credY: tagY + (tagline ? 12 : 0),
      bitX: plateX + plateW - 2, bitY: plateY - 2,
    };
  });
}

/** Text that rises `rise` px into place inside a mask at its own rows. */
function riseIn(ctx, p, x, y, h, rise, draw) {
  if (p <= 0) return;
  const off = Math.round((1 - easeOutQuint(p)) * rise);
  ctx.save();
  clipRect(ctx, x - 2, y - 1, W, h + 2);
  draw(off);
  ctx.restore();
}

/**
 * Plate, title, accent bar, tagline and credits. style = { accent, plate,
 * ink: 'light' | 'dark', bar }.
 */
export function drawLockup(ctx, dt, info, style) {
  const L = lockupLayout(info, style);
  const wipe = easeOutQuint(seg(dt, TL.plate, TL.plateDur));
  const vis = Math.round(L.plateW * wipe);
  if (vis > 0) {
    ctx.fillStyle = style.plate;
    ctx.fillRect(L.plateX, L.plateY, vis, L.plateH);
    ctx.fillStyle = style.plateHi || P.slate;
    ctx.fillRect(L.plateX, L.plateY, vis, 1);
  }
  // accent bar under the plate grows left to right
  const bar = Math.round(L.plateW * easeOutQuint(seg(dt, TL.bar, 0.36)));
  if (bar > 0) {
    ctx.fillStyle = style.bar || style.accent;
    ctx.fillRect(L.plateX, L.plateY + L.plateH, bar, 2);
  }
  // title rises inside the plate
  const tp = seg(dt, TL.title, 0.3);
  if (tp > 0) {
    ctx.save();
    clipRect(ctx, L.plateX, L.plateY + 1, Math.max(0, vis), L.plateH - 1);
    L.titles.forEach((T, i) => {
      const y = L.plateY + 6 + i * 18;
      const off = Math.round((1 - easeOutQuint(seg(dt, TL.title + i * 0.06, 0.3))) * 9);
      ctx.drawImage(T.cv, L.titleX, y - 4 + off);
    });
    ctx.restore();
  }
  // tagline and credits
  if (L.tagline) {
    riseIn(ctx, seg(dt, TL.tag, 0.3), L.titleX, L.tagY, 7, 7, (off) => {
      drawText(ctx, L.tagline, L.titleX, L.tagY + off, { color: P.silver });
    });
  }
  if (L.credits) {
    riseIn(ctx, seg(dt, TL.credits, 0.3), L.titleX, L.credY, 7, 7, (off) => {
      const lw = drawText(ctx, L.credits.label, L.titleX, L.credY + off, { color: P.fog });
      drawText(ctx, L.credits.names, L.titleX + lw + 4, L.credY + off, { color: P.white });
    });
  }
  return L;
}

/**
 * The bit pops out of the emblem's top-right shoulder, then hops along an arc
 * (anticipation dip, ease-in-out flight, one-frame squash) onto the plate.
 */
export function drawHopBit(ctx, dt, ex, ey, L, shoulder = 30, popAt = TL.pop) {
  if (dt < popAt) return;
  const sx = ex + shoulder - 2;
  const sy = ey - shoulder - 2;
  if (dt < TL.hop) {
    const s = Math.round(4 * easeOutQuint(seg(dt, popAt, 0.14)));
    const dip = dt > TL.hop - 0.08 ? 1 : 0; // anticipation
    drawBit(ctx, sx, sy + dip + (4 - s), s);
    return;
  }
  const k = seg(dt, TL.hop, TL.hopDur);
  const e = easeInOut(k);
  const x = Math.round(lerp(sx, L.bitX, e));
  const base = lerp(sy, L.bitY, e);
  const arc = 12 * Math.sin(Math.PI * Math.min(1, e));
  const y = Math.round(base - arc);
  if (k >= 1) {
    const land = dt - (TL.hop + TL.hopDur);
    if (land < 0.06) {
      // squash on landing: one frame wider and flatter
      ctx.fillStyle = P.yellow;
      ctx.fillRect(L.bitX - 1, L.bitY + 1, 6, 3);
      ctx.fillStyle = P.orange;
      ctx.fillRect(L.bitX - 1, L.bitY + 3, 6, 1);
    } else drawBit(ctx, L.bitX, L.bitY, 4);
    return;
  }
  drawBit(ctx, x, y, 4);
}

let BUG_W = 0;
/** The channel bug at its on-air spot (13, 8): wipes in, glints once, then still. */
export function drawBug(ctx, dt) {
  const p = easeOutQuint(seg(dt, TL.bug, 0.34));
  if (p <= 0) return;
  if (!BUG_W) BUG_W = measureLogo({ variant: 'bug' }).w || 48;
  const vis = Math.round((BUG_W + 1) * p);
  ctx.save();
  clipRect(ctx, 13, 8, vis, 14);
  // logo.js plays its glint during the first 0.9 s of a cycle: start it with
  // the wipe so it is over by TL.still, and stop animating after that
  const lt = dt - TL.bug;
  drawLogo(ctx, 13, 8, { variant: 'bug', t: lt < 0.9 ? lt : null });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Helpers for emblems

/** Clip to a pixel disc (an iris), radius rad around (cx, cy). */
export function clipDisc(ctx, cx, cy, rad) {
  const sp = discSpans(Math.max(0, rad));
  const n = (sp.length - 1) >> 1;
  ctx.beginPath();
  for (let i = 0; i < sp.length; i++) ctx.rect(Math.round(cx) - sp[i], Math.round(cy) - n + i, sp[i] * 2 + 1, 1);
  ctx.clip();
}

/** A pixel buffer canvas for per-frame emblem rendering (allocated once per key). */
export function frameBuffer(key, w, h) {
  return cached(`fb|${key}|${w}x${h}`, () => {
    const cv = mk(w, h);
    const cx = cv.getContext('2d');
    const img = cx.createImageData(w, h);
    return { cv, cx, img, d: new Uint32Array(img.data.buffer), w, h, key: null };
  });
}

/** Normalised open info (title, tagline, presenters, channel). */
export function normInfo(info) {
  const i = info || {};
  return {
    title: String(i.title || i.channel || 'GLOBIT 24'),
    tagline: String(i.tagline || ''),
    presenters: Array.isArray(i.presenters) ? i.presenters.map((n) => String(n ?? '')) : [],
    date: String(i.date || ''),
    channel: String(i.channel || 'GLOBIT 24'),
  };
}

/**
 * Runs one open: backdrop, seed, emblem (act 1 at centre, then gliding), the
 * lock-up and the bug, in the shared order. prog = { style, background(),
 * emblem(ctx, dt, x, y, k) with k the size factor (ZOOM -> 1), absorb (when
 * the seed bit is absorbed), shoulder (where the bit pops out, at k = 1),
 * popAt, bit (false: no hopping bit) }.
 */
export function playOpen(ctx, dt, info, prog) {
  ctx.drawImage(prog.background(), 0, 0);
  prog.under?.(ctx, dt);
  const pos = emblemPos(dt, POS);
  const k = emblemScale(dt);
  const L = drawLockup(ctx, dt, info, prog.style);
  drawSeed(ctx, dt, CENTRE.x, CENTRE.y, prog.absorb ?? 0.4);
  prog.emblem(ctx, dt, pos.x, pos.y, k);
  if (prog.bit !== false) drawHopBit(ctx, dt, pos.x, pos.y, L, Math.round((prog.shoulder ?? 30) * k), prog.popAt);
  drawBug(ctx, dt);
}
const POS = { x: 0, y: 0 };
