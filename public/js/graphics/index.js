// GLOBIT 24 on-screen graphics package: one brand red plus neutrals and the
// programme accent, calm motion, everything eased in and out.
//   top row  bug (top-left) + LIVE/REPLAY + programme name, London clock (top-right)
//   strap    lower third with kicker/category, source or presenter name, headline;
//            turns red for breaking news
//   captions paged, never dropping lines, clear of strap and ticker
//   ticker   one headline at a time
// Renderer (studio.js) calls `graphics.draw(ctx, t, scene)` after the shot.
// `update()` is separate from drawing so lab pages can replay a timeline
// deterministically (see public/lab/graphics.html).
import { P } from '../palette.js';
import { THEME_ACCENT } from '../cast.js';
import { zoneTime, STUDIO_TZ } from '../util.js';
import { CAPTION, lerp, easeInOut } from './layout.js';
import { drawTopRow, drawAdTag } from './bug.js';
import { StrapState, STRAP_TIMING, strapContent, drawStrap } from './strap.js';
import { CaptionState, drawCaptions } from './captions.js';
import { TickerState, makeEntry, drawTicker } from './ticker.js';

/** Which graphics sit on top of each shot ('news' all, 'bug' no strap/captions, 'ad', none). */
export const OVERLAYS = {
  wide: 'news',
  close: 'news',
  full: 'news',
  map: 'news',
  fact: 'news',
  montage: 'news',
  breakingCard: 'bug',
  ad: 'ad',
};

/** Shots whose full-screen graphic owns the bottom of the frame: captions go to the top. */
export const CAPTIONS_TOP = new Set(['montage']);

export const PROGRAM_TAG = { delay: 0.5, hold: 8 }; // programme name beside the bug after the open
export const BREAKING_STRAP = 12; // seconds a live breaking item takes over the strap
export const BREAKING_TICKER = 90; // seconds it stays in the ticker rotation
const LIFT = 0.3; // captions rise above a strap before it wipes in, and settle after it has gone

const ON = new Set(['news', 'bug']);

export class Graphics {
  /** `audio` (optional) may expose speechFrame(); `now()` gives the wall clock in ms. */
  constructor({ audio = null, now = () => Date.now() } = {}) {
    this.audio = audio;
    this.now = now;
    this.strap = new StrapState();
    this.captions = new CaptionState();
    this.ticker = new TickerState();
    this.mode = null;
    this.onAt = 0;
    this.adAt = 0;
    this.lift = { from: 0, to: 0, at: 0 };
    this.tagUntil = null;
    this.tagIn = null;
    this.tagOut = null;
    this.ltRef = null;
    this.ltContent = null;
    this.brRef = null;
    this.brContent = null;
    this.tickerRefs = [];
    this.tickerList = [];
    this.tickerKey = 0;
  }

  modeOf(scene) {
    return scene.overlay !== undefined ? scene.overlay : OVERLAYS[scene.shot] || null;
  }

  accentOf(scene) {
    return THEME_ACCENT[scene.program?.theme] || P.red;
  }

  /** Advance every animated element to time t (call once per frame, in order). */
  update(t, scene) {
    const mode = this.modeOf(scene);
    if (mode !== this.mode) {
      if (ON.has(mode) && !ON.has(this.mode)) this.onAt = t; // everything wipes in, the bug glints once
      if (mode === 'ad' && this.mode !== 'ad') this.adAt = t;
      if (!ON.has(mode)) {
        this.strap.reset();
        this.captions = new CaptionState();
      }
      this.mode = mode;
    }
    if (!ON.has(mode)) return;

    // programme name: from just after the open for PROGRAM_TAG.hold seconds
    const until = scene.programTagUntil ?? null;
    if (until !== this.tagUntil) {
      this.tagUntil = until;
      this.tagIn = until && until > t ? Math.max(t, this.onAt) + PROGRAM_TAG.delay : null;
      this.tagOut = null;
    }
    if (this.tagIn !== null && this.tagOut === null && (t >= this.tagIn + PROGRAM_TAG.hold || t >= this.tagUntil || mode !== 'news')) this.tagOut = t;

    const capsBelow = this.captions.active && !this.captionsOnTop(scene);
    this.strap.update(t, mode === 'news' ? this.wantStrap(t, scene) : null, capsBelow ? LIFT : 0);
    this.updateLift(t);

    const text = mode === 'news' && scene.subtitles !== false && scene.subtitle ? scene.subtitle : null;
    const frame = text && this.audio?.speechFrame ? safeFrame(this.audio) : null;
    this.captions.update(t, text, { since: scene.subtitleSince ?? null, charIndex: frame?.speaking ? frame.charIndex : null });

    const { list, key } = this.tickerEntries(t, scene);
    this.ticker.update(t, list, key);
  }

  wantStrap(t, scene) {
    const b = scene.breaking;
    if (b && t >= b.since && t - b.since < BREAKING_STRAP && b.text) {
      if (b !== this.brRef) {
        this.brRef = b;
        this.brContent = strapContent({ headline: b.text, source: b.source, breaking: true, since: b.since });
      }
      return this.brContent;
    }
    const lt = scene.lowerThird;
    if (!lt) return null;
    if (lt !== this.ltRef) {
      this.ltRef = lt;
      const story = scene.storyId ? scene.rundown?.find((r) => r.storyId === scene.storyId) : null;
      this.ltContent = strapContent(
        { ...lt, kicker: lt.kicker ?? story?.kicker, category: lt.category ?? story?.category },
        { accent: this.accentOf(scene) }
      );
    }
    return this.ltContent;
  }

  tickerEntries(t, scene) {
    const items = Array.isArray(scene.ticker) ? scene.ticker : [];
    const b = scene.breaking && t >= scene.breaking.since && t - scene.breaking.since < BREAKING_TICKER ? scene.breaking : null;
    const next = scene.schedule?.upcoming?.[0] || null;
    const refs = this.tickerRefs;
    if (refs[0] !== items || refs[1] !== b || refs[2] !== next) {
      this.tickerRefs = [items, b, next];
      const list = [];
      if (b?.text) list.push(makeEntry({ label: 'BREAKING', plate: P.red, source: b.source, text: b.text, breaking: true }));
      for (const it of items) if (it?.text) list.push(makeEntry({ source: it.source, text: it.text }));
      if (next?.title && list.length) list.push(makeEntry({ label: 'NEXT', plate: P.yellow, source: '', text: next.tagline ? `${next.title} · ${next.tagline}` : next.title }));
      this.tickerList = list;
      this.tickerKey++;
    }
    return { list: this.tickerList, key: this.tickerKey };
  }

  captionsOnTop(scene) {
    return CAPTIONS_TOP.has(scene.shot) || scene.captionZone === 'top';
  }

  /** How far captions are lifted above the strap zone (0..1), tweened ahead of the strap's wipes. */
  liftAt(t) {
    const l = this.lift;
    return lerp(l.from, l.to, easeInOut((t - l.at) / LIFT));
  }

  updateLift(t) {
    const s = this.strap;
    const occupied = s.cur && s.outAt === null ? 1 : 0;
    if (occupied === this.lift.to) return;
    const from = this.liftAt(t);
    // rise so the move ends as the bar starts; settle only once the bar has fully left
    const at = occupied ? Math.max(t, s.inAt - LIFT) : s.outAt !== null ? Math.max(t, s.outAt + STRAP_TIMING.out) : t;
    this.lift = { from, to: occupied, at };
  }

  /** Caption placement: above the strap/ticker, or at the top over full-screen graphics. */
  captionPlace(t, scene) {
    if (this.captionsOnTop(scene)) return { top: CAPTION.top };
    return { bottom: Math.round(lerp(CAPTION.bottomFree, CAPTION.bottomStrap, this.liftAt(t))) };
  }

  /** Update and draw every overlay for this frame. */
  draw(ctx, t, scene) {
    this.update(t, scene);
    this.render(ctx, t, scene);
  }

  /** Draw the current state (no state changes). */
  render(ctx, t, scene) {
    const mode = this.mode;
    if (mode === 'ad') return drawAdTag(ctx, t, this.adAt);
    if (!ON.has(mode)) return;
    const program = mode === 'news' && scene.program?.title ? { title: scene.program.title, color: this.accentOf(scene) } : null;
    drawTopRow(ctx, t, {
      onAt: this.onAt,
      replay: !!scene.replay,
      program,
      programIn: this.tagIn,
      programOut: this.tagOut,
      clock: zoneTime(STUDIO_TZ, this.now()).label,
    });
    if (mode === 'news') {
      drawStrap(ctx, t, this.strap);
      drawCaptions(ctx, t, this.captions, this.captionPlace(t, scene));
    }
    drawTicker(ctx, t, this.ticker, this.onAt);
  }
}

let frameErrorLogged = false;
function safeFrame(audio) {
  try {
    return audio.speechFrame();
  } catch (err) {
    if (!frameErrorLogged) console.warn('[graphics] speechFrame failed', err);
    frameErrorLogged = true;
    return null;
  }
}
