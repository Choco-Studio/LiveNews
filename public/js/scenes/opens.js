// Programme opens: one title sequence per show, all built on the same GLOBIT 24
// package (opens/kit.js) so they read as one network: build, reveal, and a still
// lock-up for the hard cut on the downbeat. Most last 4 s; the flagship (WORLD
// NOW) has a ten-second sequence of its own (opens/worldtitles.js) that ends on
// the same lock-up.
//
//   drawOpen(ctx, t, dt, programId, info)  full frame; dt = seconds since the open started
//   openFor(programId) -> { duration, tune }  (the director waits `duration`, plays `tune` once)
//   OPENS[id] = { duration, still, tune, draw(ctx, t, dt, info) }  (still: the lock-up holds from here)
//   info = { title, tagline, presenters: ['PACO PIXEL', ...], date, channel, replay?, bug? }
//     replay: true shows REPLAY instead of LIVE in the top row; bug: false leaves the
//     top row out (the UP NEXT promo replays an open in the middle of a break)
//   lockupFor(programId, info) -> the lock-up geometry (plateX/Y/W/H, titleX, tagY, credY, bottom)
//
// Unknown programme ids get the generic open with their own title. Frames are a
// pure function of dt (t is ignored), so the lab renders any instant exactly.
import { P } from '../palette.js';
import { drawText } from '../font.js';
import { HAS_DOM } from '../gfx/index.js';
import { DURATION, TL, normInfo, lockupLayout, drawLockupStill, W, H } from './opens/kit.js';
import { WORLD_TITLES, drawWorldNowTitles, WN_DURATION, WN_HIT } from './opens/worldtitles.js';
import { TECH_TITLES, drawTechTitles } from './opens/techtitles.js';
import { durationOf, hitOf } from './opens/cues.js';
import { COSMOS_TITLES, drawCosmosTitles } from './opens/cosmostitles.js';
import { MONEY_TITLES, drawMoneyTitles } from './opens/moneytitles.js';
import { NEWS_TITLES, drawNewsTitles } from './opens/newstitles.js';
import { GENERIC, drawGeneric } from './opens/generic.js';
import { WEATHER_OPEN, drawWorldWeather } from './opens/weather.js';
import { TUNES } from './opens/tunes.js';

const wrap = (fn) => (ctx, t, dt, info) => fn(ctx, dt, info);
const open = (fn, prog, tune, duration = DURATION, still = TL.still) => ({ duration, still, tune, draw: wrap(fn), accent: prog.accent, prog });

export const OPENS = {
  'world-now': open(drawWorldNowTitles, WORLD_TITLES, TUNES['world-now'], WN_DURATION, WN_HIT),
  'tech-bytes': open(drawTechTitles, TECH_TITLES, TUNES['tech-bytes'], durationOf('tech-bytes'), hitOf('tech-bytes')),
  cosmos: open(drawCosmosTitles, COSMOS_TITLES, TUNES.cosmos, durationOf('cosmos'), hitOf('cosmos')),
  'money-minute': open(drawMoneyTitles, MONEY_TITLES, TUNES['money-minute'], durationOf('money-minute'), hitOf('money-minute')),
  'news-60': open(drawNewsTitles, NEWS_TITLES, TUNES['news-60'], durationOf('news-60'), hitOf('news-60')),
  'world-weather': open(drawWorldWeather, WEATHER_OPEN, TUNES.generic),
};
const FALLBACK = open(drawGeneric, GENERIC, TUNES.generic);
/** The open for a programme id (own keys only: 'constructor' or '__proto__' get the generic open). */
const openOf = (id) => (typeof id === 'string' && Object.hasOwn(OPENS, id) ? OPENS[id] : FALLBACK);

// The audio stream's shared sonic signature (themeFor) re-orchestrated per
// programme; loaded lazily so the opens keep working (and drawing) if the audio
// modules are missing or broken.
let THEMES = null;
let AUDIO = null;
import('../audio/themes.js').then((m) => (THEMES = m)).catch(() => {});
import('../audio.js').then((m) => (AUDIO = m)).catch(() => {});

let warned = false;
/** Draw the opening titles of a programme (full frame). */
export function drawOpen(ctx, t, dt, programId, info) {
  const op = openOf(programId);
  const d = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const ni = normInfo(info);
  ctx.save();
  try {
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    try {
      // every save() inside the opens is paired with a restore() in a finally, so a throw
      // leaves no clip or transform behind
      op.draw(ctx, t, d, ni);
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
  } finally {
    ctx.restore();
  }
}

/**
 * Timing and theme tune for a programme's open. When the audio module offers
 * a shared signature (themeFor), its re-orchestration for this programme wins.
 */
export function openFor(programId) {
  const op = openOf(programId);
  let tune = op.tune;
  try {
    const fn = typeof THEMES?.themeFor === 'function' ? THEMES.themeFor : typeof AUDIO?.themeFor === 'function' ? AUDIO.themeFor : null;
    const shared = fn ? fn(programId, { duration: op.duration }) : null;
    if (shared) tune = shared;
  } catch {
    /* keep the built-in jingle */
  }
  return { duration: op.duration, tune };
}

/** Lock-up geometry of a programme's open for this info (cached): where the plate, title and credits sit. */
export function lockupFor(programId, info) {
  const op = openOf(programId);
  return lockupLayout(normInfo(info), op.prog.style);
}

/**
 * The programme's settled lock-up alone (emblem, plate, title, tagline, credits, bit), with no
 * backdrop and no top row: the frame the open ends on, for cards that announce a programme.
 */
export function drawProgrammeLockup(ctx, programId, info) {
  const op = openOf(programId);
  const ni = normInfo({ ...info, bug: false });
  ctx.save();
  try {
    ctx.imageSmoothingEnabled = false;
    return drawLockupStill(ctx, ni, op.prog);
  } finally {
    ctx.restore();
  }
}

// Warm the heavy caches in the background so the first open never stutters: one small job per
// timer slice (globe tables, sprites, backdrops), then one hidden lock-up frame of each open,
// which also warms the top row and the text caches.
if (HAS_DOM && typeof setTimeout === 'function') {
  const progs = [WORLD_TITLES, TECH_TITLES, COSMOS_TITLES, MONEY_TITLES, NEWS_TITLES, GENERIC];
  const jobs = [];
  for (const p of progs) jobs.push(p.background);
  for (const p of progs) if (p.warmJobs) jobs.push(...p.warmJobs());
  let scratch = null;
  for (const id of [...Object.keys(OPENS), '']) {
    jobs.push(() => {
      if (!scratch) scratch = document.createElement('canvas').getContext('2d');
      const d = openOf(id).duration / DURATION;
      for (const dt of [0.6, 1.2, 1.9, 2.6, 3.5]) drawOpen(scratch, 0, dt * d, id, { title: 'GLOBIT 24', tagline: 'WARM', presenters: ['GLOBIT'] });
    });
  }
  let j = 0;
  const step = () => {
    if (j >= jobs.length) return;
    try {
      jobs[j++]();
    } catch {
      j = jobs.length;
    }
    setTimeout(step, 16);
  };
  setTimeout(step, 500);
}
