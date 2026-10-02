// GLOBIT 24 on-screen graphics package: one brand red plus neutrals and the
// programme accent, calm motion, everything eased in and out.
//   top row  bug (top-left) + LIVE/REPLAY + programme name, London clock (top-right)
//   strap    lower third with kicker/category, source or presenter name, headline;
//            turns red for breaking news; long text is paged, never scrolled
//   captions yellow-on-black pages, never dropping lines, clear of strap and ticker
//   ticker   one headline (or headline page) at a time
// Renderer (studio.js) calls `graphics.draw(ctx, t, scene)` after the shot.
// `update()` is separate from drawing so lab pages can replay a timeline
// deterministically (see public/lab/graphics.html).
import { P } from '../palette.js';
import { THEME_ACCENT } from '../cast.js';
import { zoneTime, STUDIO_TZ } from '../util.js';
import { CAPTION, lerp, easeInOut } from './layout.js';
import { drawTopRow, drawAdTag } from './bug.js';
import { StrapState, STRAP_TIMING, strapContent, strapReadTime, categoryLabel, drawStrap } from './strap.js';
import { CaptionState, drawCaptions } from './captions.js';
import { TickerState, makeEntries, drawTicker } from './ticker.js';

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

// A category that only repeats the programme's own beat tells the viewer nothing
// ("WORLD" under WORLD NOW): without a kicker the strap tag shows the source then.
const PROGRAM_TOPIC = { world: 'WORLD', tech: 'TECH', space: 'SCIENCE', money: 'BUSINESS' };

export const PROGRAM_TAG = { delay: 0.5, hold: 8 }; // programme name beside the bug after the open
export const BREAKING_STRAP = 12; // minimum seconds a live breaking item takes over the strap
export const BREAKING_TICKER = 90; // seconds it stays in the ticker rotation
const BREAKING_LEAD = STRAP_TIMING.in + STRAP_TIMING.textDelay + STRAP_TIMING.textRise; // until its text is up
const TICKER_AFTER_STRAP = 1; // the ticker takes a breaking item a beat after the strap hands it back (one push at a time)
const LIFT = 0.3; // captions rise above a strap before it wipes in, and settle after it has gone

const ON = new Set(['news', 'bug']);
const STOP = new Set('A AN THE OF TO IN ON AT BY FOR FROM WITH AND OR BUT IS ARE WAS WERE BE HAS HAVE HAD IT ITS THIS THAT AS'.split(' '));

/** Content words of a line of text, upper-cased, without possessive 's. */
function contentWords(text) {
  const out = [];
  for (const raw of String(text).toUpperCase().split(/[^\p{L}\p{N}'’]+/u)) {
    const w = raw.replace(/['’]S$/, '').replace(/['’]/g, '');
    if (w && !STOP.has(w)) out.push(w);
  }
  return out;
}

export class Graphics {
  /** `audio` (optional) may expose speechFrame(); `now()` gives the wall clock in ms. */
  constructor({ audio = null, now = () => Date.now() } = {}) {
    this.audio = audio;
    this.now = now;
    this.strap = new StrapState();
    this.captions = new CaptionState();
    this.ticker = new TickerState();
    this.mode = null;
    this.lastShot = null;
    this.onAt = 0; // when the graphics came on (programme tag, glint)
    this.topAt = 0; // the top row's own clock: already settled when we come out of an open
    this.adAt = 0;
    this.band = { on: false, inAt: 0, outAt: null }; // the ticker band (hidden while it has nothing to say)
    this.lift = { from: 0, to: 0, at: 0 };
    this.tagUntil = null;
    this.tagIn = null;
    this.tagOut = null;
    this.ltRef = null;
    this.ltAccent = null;
    this.ltContent = null;
    this.brRef = null;
    this.brContent = null;
    this.brUntil = 0;
    this.tickerItems = null;
    this.tickerBreak = null;
    this.tickerNext = null;
    this.tickerList = [];
    this.tickerKey = 0;
    this.dupText = null;
    this.dupStrap = null;
    this.dupSkip = false;
    this.errors = new Set();
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
      if (ON.has(mode) && !ON.has(this.mode)) {
        this.onAt = t; // everything wipes in, the bug glints once...
        // ...unless we cut from a programme open, which ends on these very pixels (opens/kit.js drawBug)
        this.topAt = this.lastShot === 'open' ? t - 3 : t;
      }
      if (mode === 'ad' && this.mode !== 'ad') this.adAt = t;
      if (!ON.has(mode)) {
        this.strap.reset();
        this.captions.reset();
        this.band.on = false;
      }
      this.mode = mode;
    }
    this.lastShot = scene.shot;
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

    let text = mode === 'news' && scene.subtitles !== false && typeof scene.subtitle === 'string' ? scene.subtitle : null;
    if (text && this.repeatsStrap(text)) text = null;
    const frame = text && this.audio?.speechFrame ? this.safeFrame() : null;
    this.captions.update(t, text, scene.subtitleSince ?? null, frame?.speaking ? frame.charIndex : null);

    this.updateTickerList(t, scene);
    this.ticker.update(t, this.tickerList, this.tickerKey);
    this.updateBand(t);
  }

  /** Seconds a live breaking item holds the strap: long enough to show every page. */
  breakingHold(content) {
    return Math.max(BREAKING_STRAP, BREAKING_LEAD + strapReadTime(content) + STRAP_TIMING.breakingPage);
  }

  breakingContent(b) {
    if (b !== this.brRef) {
      this.brRef = b;
      this.brContent = strapContent({ headline: b.text, source: b.source, breaking: true, since: b.since });
      this.brUntil = b.since + this.breakingHold(this.brContent);
    }
    return this.brContent;
  }

  wantStrap(t, scene) {
    const b = scene.breaking;
    if (b && b.text && Number.isFinite(b.since) && t >= b.since) {
      const content = this.breakingContent(b);
      if (t < this.brUntil) return content;
    }
    const lt = scene.lowerThird;
    if (!lt || typeof lt !== 'object') return null;
    const accent = this.accentOf(scene);
    if (lt !== this.ltRef || accent !== this.ltAccent) {
      this.ltRef = lt;
      this.ltAccent = accent;
      const rundown = Array.isArray(scene.rundown) ? scene.rundown : null;
      const story = scene.storyId && rundown ? rundown.find((r) => r?.storyId === scene.storyId) : null;
      const kicker = lt.kicker ?? story?.kicker;
      let category = lt.category ?? story?.category;
      if (!kicker && categoryLabel(category) === PROGRAM_TOPIC[scene.program?.theme]) category = '';
      this.ltContent = strapContent({ ...lt, kicker, category }, { accent });
    }
    return this.ltContent;
  }

  /** True when a caption only repeats the headline on the strap (every content word is in it). */
  repeatsStrap(text) {
    const c = this.strap.cur;
    if (!c || this.strap.outAt !== null || !c.headline) return false;
    if (text === this.dupText && c === this.dupStrap) return this.dupSkip;
    const head = new Set(contentWords(c.headline));
    const words = contentWords(text);
    this.dupText = text;
    this.dupStrap = c;
    this.dupSkip = words.length >= 2 && words.every((w) => head.has(w));
    return this.dupSkip;
  }

  /** Rebuild the flipper list when its inputs change (bumps tickerKey). */
  updateTickerList(t, scene) {
    const items = Array.isArray(scene.ticker) ? scene.ticker : null;
    const raw = scene.breaking;
    let b = null;
    if (raw && raw.text && Number.isFinite(raw.since) && t >= raw.since && t - raw.since < BREAKING_TICKER) {
      // the strap carries the item first (the same words twice on screen read as a
      // glitch); the ticker takes it into its rotation once the strap hands back
      this.breakingContent(raw);
      if (t >= this.brUntil + TICKER_AFTER_STRAP) b = raw;
    }
    const next = scene.schedule?.upcoming?.[0] || null;
    if (items === this.tickerItems && b === this.tickerBreak && next === this.tickerNext) return;
    this.tickerItems = items;
    this.tickerBreak = b;
    this.tickerNext = next;
    const list = [];
    if (b) list.push(...makeEntries({ label: 'BREAKING', plate: P.red, source: b.source, text: b.text, breaking: true }));
    if (items) for (const it of items) if (it && it.text) list.push(...makeEntries({ source: it.source, text: it.text }));
    if (next && next.title) {
      const text = next.tagline ? `${next.title} · ${next.tagline}` : next.title;
      list.push(...makeEntries({ label: 'NEXT', plate: P.yellow, text }));
    }
    this.tickerList = list;
    this.tickerKey++;
  }

  /** The band shows while the ticker has something to say; it slides in and out. */
  updateBand(t) {
    const want = this.tickerList.length > 0 || this.ticker.cur !== null;
    const band = this.band;
    if (want && !band.on) {
      band.on = true;
      band.inAt = Math.max(t, this.onAt);
      band.outAt = null;
    } else if (!want && band.on) {
      band.on = false;
      band.outAt = t;
    }
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
    this.lift.from = from;
    this.lift.to = occupied;
    this.lift.at = at;
  }

  /** Bottom edge (or { top }) of the caption block. */
  captionPlace(t, scene) {
    if (this.captionsOnTop(scene)) return TOP_PLACE;
    BOTTOM_PLACE.bottom = Math.round(lerp(CAPTION.bottomFree, CAPTION.bottomStrap, this.liftAt(t)));
    return BOTTOM_PLACE;
  }

  /**
   * Update and draw every overlay for this frame. A bad scene field or a bug in
   * one element must never take the picture (or the stinger after us) down:
   * errors are logged once each and the frame carries on.
   */
  draw(ctx, t, scene) {
    try {
      this.update(t, scene);
      this.render(ctx, t, scene);
    } catch (err) {
      ctx.globalAlpha = 1;
      this.logOnce(err);
    }
  }

  logOnce(err) {
    const key = `${err?.name}: ${err?.message}`;
    if (this.errors.has(key) || this.errors.size >= 20) return;
    this.errors.add(key);
    console.error('[graphics]', err);
  }

  /** Draw the current state (no state changes). */
  render(ctx, t, scene) {
    const mode = this.mode;
    if (mode === 'ad') return drawAdTag(ctx, t, this.adAt);
    if (!ON.has(mode)) return;
    const program = mode === 'news' && scene.program?.title ? this.programTag(scene) : null;
    TOP_ROW.onAt = this.topAt;
    TOP_ROW.replay = !!scene.replay;
    TOP_ROW.program = program;
    TOP_ROW.programIn = this.tagIn;
    TOP_ROW.programOut = this.tagOut;
    TOP_ROW.clock = zoneTime(STUDIO_TZ, this.now()).label;
    drawTopRow(ctx, t, TOP_ROW);
    if (mode === 'news') {
      drawStrap(ctx, t, this.strap);
      drawCaptions(ctx, t, this.captions, this.captionPlace(t, scene));
    }
    if (this.band.on || this.band.outAt !== null) drawTicker(ctx, t, this.ticker, this.band.inAt, this.band.outAt);
  }

  programTag(scene) {
    const title = String(scene.program.title);
    const color = this.accentOf(scene);
    if (this.progTag?.title !== title || this.progTag.color !== color) this.progTag = { title, color };
    return this.progTag;
  }

  safeFrame() {
    try {
      return this.audio.speechFrame();
    } catch (err) {
      this.logOnce(err);
      return null;
    }
  }
}

// Reused per frame (no allocations in steady state).
const TOP_ROW = { onAt: 0, replay: false, program: null, programIn: null, programOut: null, clock: '' };
const TOP_PLACE = Object.freeze({ top: CAPTION.top });
const BOTTOM_PLACE = { bottom: CAPTION.bottomFree };
