// Programme opens: one 4 s title sequence per show, all built on the same
// GLOBIT 24 package (opens/kit.js) so they read as one network: build, reveal,
// and a still lock-up for the hard cut on the downbeat.
//
//   drawOpen(ctx, t, dt, programId, info)  full frame; dt = seconds since the open started
//   openFor(programId) -> { duration, tune }  (the director waits `duration`, plays `tune` once)
//   OPENS[id] = { duration, tune, draw(ctx, t, dt, info) }
//   info = { title, tagline, presenters: ['PACO PIXEL', ...], date, channel }
//
// Unknown programme ids get the generic open with their own title. Frames are a
// pure function of dt (t is ignored), so the lab renders any instant exactly.
import { P } from '../palette.js';
import { drawText } from '../font.js';
import * as audio from '../audio.js';
import { HAS_DOM } from '../gfx/index.js';
import { DURATION, normInfo, W, H } from './opens/kit.js';
import { WORLD, drawWorldNow } from './opens/world.js';
import { TECH, drawTechBytes } from './opens/tech.js';
import { COSMOS, drawCosmos } from './opens/cosmos.js';
import { MONEY, drawMoneyMinute } from './opens/money.js';
import { FLASH, drawNews60 } from './opens/flash.js';
import { GENERIC, drawGeneric } from './opens/generic.js';
import { TUNES } from './opens/tunes.js';

const wrap = (fn) => (ctx, t, dt, info) => fn(ctx, dt, info);

export const OPENS = {
  'world-now': { duration: DURATION, tune: TUNES['world-now'], draw: wrap(drawWorldNow), accent: WORLD.accent },
  'tech-bytes': { duration: DURATION, tune: TUNES['tech-bytes'], draw: wrap(drawTechBytes), accent: TECH.accent },
  cosmos: { duration: DURATION, tune: TUNES.cosmos, draw: wrap(drawCosmos), accent: COSMOS.accent },
  'money-minute': { duration: DURATION, tune: TUNES['money-minute'], draw: wrap(drawMoneyMinute), accent: MONEY.accent },
  'news-60': { duration: DURATION, tune: TUNES['news-60'], draw: wrap(drawNews60), accent: FLASH.accent },
};
const FALLBACK = { duration: DURATION, tune: TUNES.generic, draw: wrap(drawGeneric), accent: GENERIC.accent };

let warned = false;
/** Draw the opening titles of a programme (full frame). */
export function drawOpen(ctx, t, dt, programId, info) {
  const open = OPENS[programId] || FALLBACK;
  const d = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const ni = normInfo(info);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  try {
    open.draw(ctx, t, d, ni);
  } catch (err) {
    // never leave the screen broken: a plain branded card instead
    ctx.fillStyle = P.black;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = P.red;
    ctx.fillRect(0, 90, W, 30);
    drawText(ctx, ni.title, W / 2, 98, { color: P.white, scale: 2, align: 'center' });
    if (!warned) {
      warned = true;
      console.warn('[opens] draw failed', err);
    }
  }
  ctx.restore();
}

/**
 * Timing and theme tune for a programme's open. When the audio module offers
 * a shared signature (themeFor), its re-orchestration for this programme wins.
 */
export function openFor(programId) {
  const open = OPENS[programId] || FALLBACK;
  let tune = open.tune;
  try {
    const shared = typeof audio.themeFor === 'function' ? audio.themeFor(programId, { duration: open.duration }) : null;
    if (shared) tune = shared;
  } catch {
    /* keep the built-in jingle */
  }
  return { duration: open.duration, tune };
}

// Warm the heavy caches in the background so the first open never stutters.
if (HAS_DOM && typeof setTimeout === 'function') {
  const jobs = [WORLD.warm, TECH.warm, COSMOS.warm, () => WORLD.background(), () => TECH.background(), () => COSMOS.background(), () => MONEY.background(), () => FLASH.background(), () => GENERIC.background()].filter(Boolean);
  let j = 0;
  const step = () => {
    if (j >= jobs.length) return;
    try {
      jobs[j++]();
    } catch {
      j = jobs.length;
    }
    setTimeout(step, 30);
  };
  setTimeout(step, 500);
}
