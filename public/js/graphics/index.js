// GLOBIT 24 on-screen graphics package: one brand red plus neutrals and the
// programme accent, calm motion, everything eased in and out.
//   top row  bug (top-left) + LIVE/REPLAY + programme name, London clock (top-right)
//   strap    lower third with kicker/category, source or presenter name, headline
//            (two lines when needed); turns red for breaking news; never scrolls
//   captions white-on-black subtitles, never dropping lines, clear of strap and ticker
//   ticker   one headline (or headline page) at a time
// Programmes differ where their style bibles say so (PROGRAM_GRAPHICS): NEWS IN 60
// keeps its programme tag up, turns the strap's top line into a progress rule and
// holds one static UP NEXT plate; MONEY MINUTE's ticker flips the figures of the
// stories already aired.
// Renderer (studio.js) calls `graphics.draw(ctx, t, scene)` after the shot.
// `update()` is separate from drawing so lab pages can replay a timeline
// deterministically (see public/lab/graphics.html).
import { P } from '../palette.js';
import { THEME_ACCENT } from '../cast.js';
import { zoneTime, STUDIO_TZ } from '../util.js';
import { CAPTION, STRAP, lerp, easeInOut, clamp01 } from './layout.js';
import { drawTopRow, drawAdTag } from './bug.js';
import { StrapState, STRAP_TIMING, strapContent, strapReadTime, categoryLabel, drawStrap } from './strap.js';
import { CaptionState, drawCaptions } from './captions.js';
import { TickerState, makeEntries, makeFigureEntry, makeNextEntry, drawTicker } from './ticker.js';
import { CHANNEL } from '../pace.js';

/** Which graphics sit on top of each shot ('news' all, 'bug' no strap/captions, 'ad', none). */
export const OVERLAYS = {
  wide: 'news',
  close: 'news',
  full: 'news',
  map: 'news',
  fact: 'news',
  montage: 'news',
  weather: 'news', // WORLD WEATHER's weather centre (scenes/weather)
  breakingCard: 'bug',
  ad: 'ad',
};

/** Shots whose full-screen graphic owns the bottom of the frame: captions go to the top, no strap. */
export const CAPTIONS_TOP = new Set(['montage']);

export const PROGRAM_TAG = CHANNEL.programTag; // programme name beside the bug after the open (PACE: pace.js)

/**
 * Per-programme graphics (docs/programmes/*.md). `tagHold`: seconds the
 * programme tag stays up (Infinity = the whole episode); `progressRule`: the
 * strap's top line shows `scene.progress` (0..1); `ticker`: 'flip' (headlines),
 * 'figures' (aired figures, headlines while fewer than two) or 'next' (one
 * static UP NEXT plate).
 */
export const PROGRAM_GRAPHICS = {
  'news-60': { tagHold: Infinity, progressRule: true, ticker: 'next' }, // news-60.md "Graphics"
  'money-minute': { ticker: 'figures' }, // money-minute.md 3.6 "bottom line"
  'world-weather': { ticker: 'next' }, // the forecast is the programme: one calm UP NEXT plate, no headlines
};
const THEME_PROGRAM = { flash: 'news-60', money: 'money-minute' };
const DEFAULT_GRAPHICS = Object.freeze({ tagHold: PROGRAM_TAG.hold, progressRule: false, ticker: 'flip' });
const pgCache = new Map();
/** The graphics config for a programme ({ id, theme }), defaults filled in (cached). */
export function programGraphics(program) {
  const id = program?.id && PROGRAM_GRAPHICS[program.id] ? program.id : THEME_PROGRAM[program?.theme] || '';
  let cfg = pgCache.get(id);
  if (!cfg) pgCache.set(id, (cfg = Object.freeze({ ...DEFAULT_GRAPHICS, ...(PROGRAM_GRAPHICS[id] || {}) })));
  return cfg;
}

// A category that only repeats the programme's own beat tells the viewer nothing
// ("WORLD" under WORLD NOW): without a kicker the tag falls back to the place, then NEWS.
const PROGRAM_TOPIC = { world: 'WORLD', tech: 'TECH', space: 'SCIENCE', money: 'BUSINESS' };

export const BREAKING_STRAP = 12; // minimum seconds a live breaking item takes over the strap
export const BREAKING_TICKER = 90; // seconds from its first moment on air that it stays in the ticker rotation
export const BREAKING_MAX_AGE = 600; // an item that could not air within this long is dropped
const BREAKING_LEAD = STRAP_TIMING.textDelay + STRAP_TIMING.textRise; // until its text is up
const TICKER_AFTER_STRAP = 1; // the ticker takes a breaking item a beat after the strap hands it back (one push at a time)
const LIFT = 0.3; // captions rise above a strap before it wipes in, and settle after it has gone

const ON = new Set(['news', 'bug']);
const STOP = new Set('A AN THE OF TO IN ON AT BY FOR FROM WITH AND OR BUT IS ARE WAS WERE BE HAS HAVE HAD IT ITS THIS THAT AS'.split(' '));

/** Content words of a line of text, upper-cased, without possessive 's. */
export function contentWords(text) {
  const out = [];
  for (const raw of String(text).toUpperCase().split(/[^\p{L}\p{N}'’]+/u)) {
    const w = raw.replace(/['’]S$/, '').replace(/['’]/g, '');
    if (w && !STOP.has(w)) out.push(w);
  }
  return out;
}

/** True when two headlines tell the same story: half the words of the shorter one are shared. */
export function sameStory(a, b) {
  const wa = contentWords(a);
  const wb = new Set(contentWords(b));
  if (wa.length < 2 || wb.size < 2) return false;
  let shared = 0;
  for (const w of new Set(wa)) if (wb.has(w)) shared++;
  return shared >= 2 && shared >= 0.5 * Math.min(new Set(wa).size, wb.size);
}

/** Country (last part) of a place name: "Venice, Italy" -> "ITALY". */
const countryOf = (place) => {
  const parts = String(place || '').split(',');
  return parts[parts.length - 1].trim().toUpperCase();
};

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
    this.pg = DEFAULT_GRAPHICS;
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
    this.brAir = null; // when the breaking item first went on air (strap shown)
    this.brUntil = 0;
    this.progressMax = 0;
    this.progressRef = null;
    this.rundownRef = null;
    this.maxStory = -1;
    this.figureKey = '';
    this.figures = [];
    this.tickerIn = { items: null, b: null, next: null, mode: '', ref: null, figures: null };
    this.tickerList = [];
    this.tickerKey = 0;
    this.dupText = null;
    this.dupRef = null;
    this.dupTag = '';
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
    this.pg = programGraphics(scene.program);
    this.trackEpisode(scene);
    this.trackBreaking(t, scene, mode);
    if (!ON.has(mode)) return;

    // programme name: from just after the open for tagHold seconds (or the whole episode)
    const until = scene.programTagUntil ?? null;
    if (until !== this.tagUntil) {
      this.tagUntil = until;
      this.tagIn = until && until > t ? Math.max(t, this.onAt) + PROGRAM_TAG.delay : null;
      this.tagOut = null;
    }
    const keep = this.pg.tagHold === Infinity;
    if (this.tagIn !== null && this.tagOut === null && (mode !== 'news' || (!keep && (t >= this.tagIn + this.pg.tagHold || t >= this.tagUntil)))) this.tagOut = t;

    const top = this.captionsOnTop(scene);
    const capsBelow = this.captions.active && !top;
    this.strap.update(t, mode === 'news' ? this.wantStrap(t, scene) : null, capsBelow ? LIFT : 0);
    this.strap.progress = this.progressOf(scene);
    this.updateLift(t);

    let text = mode === 'news' && scene.subtitles !== false && typeof scene.subtitle === 'string' ? scene.subtitle : null;
    if (text && this.repeatsOnAir(text, scene)) text = null;
    const frame = text && this.audio?.speechFrame ? this.safeFrame() : null;
    // while a strap is up the caption shows one line at a time: the bottom third stays light
    const perPage = !top && this.strapUp() ? 1 : 2;
    this.captions.update(t, text, scene.subtitleSince ?? null, frame?.speaking ? frame.charIndex : null, perPage);

    this.updateTickerList(t, scene);
    this.ticker.update(t, this.tickerList, this.tickerKey, mode === 'bug');
    this.updateBand(t);
  }

  strapUp() {
    return !!this.strap.cur && this.strap.outAt === null;
  }

  /** New episode (a new rundown): progress and the aired-story count start again. */
  trackEpisode(scene) {
    const rundown = Array.isArray(scene.rundown) ? scene.rundown : null;
    if (rundown !== this.rundownRef) {
      this.rundownRef = rundown;
      this.maxStory = -1;
      this.progressMax = 0;
    }
    if (rundown && scene.storyId) {
      const i = rundown.findIndex((r) => r?.storyId === scene.storyId);
      if (i > this.maxStory) this.maxStory = i;
    }
  }

  /** NEWS IN 60 progress rule: whole pixels of a value that never shrinks (null = none). */
  progressOf(scene) {
    if (!this.pg.progressRule || !Number.isFinite(scene.progress)) return null;
    this.progressMax = Math.max(this.progressMax, clamp01(scene.progress));
    return this.progressMax;
  }

  /**
   * Breaking items count their strap hold and ticker window in ON-AIR time:
   * one that arrives during a break, an open or a full-screen card waits for
   * the first moment the strap can carry it (within BREAKING_MAX_AGE).
   */
  trackBreaking(t, scene, mode) {
    const b = scene.breaking;
    if (b !== this.brRef) {
      this.brRef = b;
      this.brContent = null;
      this.brAir = null;
    }
    if (!b || !b.text || !Number.isFinite(b.since) || t < b.since) return;
    if (!this.brContent) this.brContent = strapContent({ headline: b.text, source: b.source, breaking: true, since: b.since });
    if (this.brAir === null && mode === 'news' && !this.captionsOnTop(scene) && t - b.since <= BREAKING_MAX_AGE) {
      this.brAir = t;
      this.brUntil = t + this.breakingHold(this.brContent);
    }
  }

  /** Seconds a live breaking item holds the strap: long enough to show every page. */
  breakingHold(content) {
    return Math.max(BREAKING_STRAP, BREAKING_LEAD + strapReadTime(content) + STRAP_TIMING.breakingPage);
  }

  wantStrap(t, scene) {
    if (this.captionsOnTop(scene)) return null; // the full-screen graphic owns the bottom
    if (this.brAir !== null && t < this.brUntil) return this.brContent;
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
      const where = lt.place ?? lt.location?.place ?? story?.location?.place;
      this.ltContent = strapContent({ ...lt, kicker, category, place: where ? countryOf(where) : '' }, { accent });
    }
    return this.ltContent;
  }

  /** The headline on air that a caption or ticker item must not repeat (strap, or the montage card). */
  onAirHeadline(scene) {
    const c = this.strap.cur;
    if (c && this.strap.outAt === null && c.headline) return c.headline;
    if (scene.shot === 'montage' && Array.isArray(scene.rundown)) {
      const r = scene.rundown[scene.card?.index ?? -1];
      if (r?.headline) return r.headline;
    }
    return null;
  }

  /**
   * True when a caption only repeats what the graphics already say: every
   * content word is in the headline on air or the strap's tag ("Around the
   * world." under an AROUND THE WORLD kicker).
   */
  repeatsOnAir(text, scene) {
    const ref = this.onAirHeadline(scene);
    if (!ref) return false;
    const c = this.strap.cur;
    const tag = c && ref === c.headline ? c.tag : '';
    if (text === this.dupText && ref === this.dupRef && tag === this.dupTag) return this.dupSkip;
    const head = new Set(contentWords(tag ? `${ref} ${tag}` : ref));
    const words = contentWords(text);
    this.dupTag = tag;
    this.dupText = text;
    this.dupRef = ref;
    this.dupSkip = words.length >= 2 && words.every((w) => head.has(w));
    return this.dupSkip;
  }

  /** Figures of the stories already aired, for MONEY MINUTE's bottom line (cached by key). */
  airedFigures(scene) {
    if (Array.isArray(scene.tickerFigures)) return scene.tickerFigures;
    const rundown = Array.isArray(scene.rundown) ? scene.rundown : null;
    if (!rundown) return null;
    // the story on air and anything after it never appear (no figure before its turn)
    const cur = scene.storyId ? rundown.findIndex((r) => r?.storyId === scene.storyId) : -1;
    const upTo = cur >= 0 ? cur : this.maxStory + 1;
    const key = `${upTo}`;
    if (key === this.figureKey && this.figuresRundown === rundown) return this.figures;
    const out = [];
    for (let i = 0; i < upTo && i < rundown.length; i++) {
      const nums = Array.isArray(rundown[i]?.numbers) ? rundown[i].numbers : [];
      for (const n of nums) if (n && n.value && n.label) out.push(n);
    }
    this.figureKey = key;
    this.figuresRundown = rundown;
    this.figures = out;
    return out;
  }

  /** Rebuild the flipper list when its inputs change (bumps tickerKey). */
  updateTickerList(t, scene) {
    const items = Array.isArray(scene.ticker) ? scene.ticker : null;
    const raw = scene.breaking;
    // the strap carries a breaking item first (the same words twice on screen read
    // as a glitch); the ticker takes it into its rotation once the strap hands back
    const b = raw && this.brAir !== null && raw === this.brRef && t >= this.brUntil + TICKER_AFTER_STRAP && t < this.brAir + BREAKING_TICKER ? raw : null;
    const next = scene.schedule?.upcoming?.[0] || null;
    const tmode = this.pg.ticker;
    const ref = tmode === 'next' ? null : this.onAirHeadline(scene);
    const figures = tmode === 'figures' ? this.airedFigures(scene) : null;
    const k = this.tickerIn;
    if (items === k.items && b === k.b && next === k.next && tmode === k.mode && ref === k.ref && figures === k.figures) return;
    k.items = items;
    k.b = b;
    k.next = next;
    k.mode = tmode;
    k.ref = ref;
    k.figures = figures;
    const list = [];
    if (tmode === 'next') {
      // NEWS IN 60: one static plate for the whole episode, nothing flips (the strap carries breaking news)
      const e = next?.title ? makeNextEntry(next.title) : null;
      if (e) list.push(e);
    } else {
      if (b) list.push(...makeEntries({ label: 'BREAKING', plate: P.red, source: b.source, text: b.text, breaking: true }));
      const figs = figures && figures.length >= 2 ? figures.map((n) => makeFigureEntry(n, n)).filter(Boolean) : null;
      if (figs && figs.length >= 2) list.push(...figs);
      else if (items) {
        for (const it of items) {
          if (!it || !it.text || (ref && sameStory(it.text, ref))) continue; // never the story on air
          list.push(...makeEntries({ source: it.source, text: it.text, short: it.short }));
        }
      }
      if (next && next.title) {
        const text = next.tagline ? `${next.title} · ${next.tagline}` : next.title;
        list.push(...makeEntries({ label: 'NEXT', plate: P.yellow, text }));
      }
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

  /** Bottom edge (or { top }) of the caption block: 6 px above the strap's top, wherever it is. */
  captionPlace(t, scene) {
    if (this.captionsOnTop(scene)) return TOP_PLACE;
    const above = (this.strap.cur ? this.strap.top(t) : STRAP.tagY) - CAPTION.gap;
    BOTTOM_PLACE.bottom = Math.round(lerp(CAPTION.bottomFree, above, this.liftAt(t)));
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
    if (mode === 'ad') return drawAdTag(ctx, t, this.adAt, scene?.adBreak?.until ?? null);
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
