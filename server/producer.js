import { buildPrompt, buildReviewPrompt, extractJson, normalizeBulletin } from './writer.js';
import { castOf } from './channel.js';
import { embedCues } from '../public/js/cues.js';
import { onBeat } from './topics.js';
import { pictureCredit } from './news.js';
import { writeWeather } from './weatherwriter.js';

const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Is the credit just the outlet itself ("Pixelburg Post" on Pixelburg Post's own picture)? */
const ownCredit = (credit, outlet) => !credit || fold(credit) === fold(outlet) || fold(credit).startsWith(`${fold(outlet)} `);

// The source plate on the strap and on the headline montage card holds about 36 characters: the stop-gap credit
// ("Outlet / Photo: Credit") must fit it whole, never cut mid-word with an ellipsis.
export const SOURCE_MAX = 36;
// The credit line graphics may draw as is ("PHOTO: PIXEL WIRE AGENCY"), in the micro font under a picture.
export const CREDIT_LINE_MAX = 28;
/** The credit's first part: "Getty Images/AFP via Getty Images" -> "Getty Images"; "Jane Doe, Reuters" -> "Jane Doe". */
const shortCredit = (c) => String(c).split(/\s*(?:\/|\bvia\b|,|;|\|)\s*/i)[0].trim();
/** ...and without a trailing generic word ("Pixel Wire Agency" -> "Pixel Wire"), when a name is left. */
const bareCredit = (c) => {
  const t = shortCredit(c).replace(/\s+(?:agency|images|photos?|pictures|press|news|service|services|collective|library|archive)$/i, '').trim();
  return t.split(/\s+/).length >= 1 && t.length >= 3 ? t : shortCredit(c);
};
/**
 * What the source plate says for a picture another outlet or an agency took: "Outlet / Photo: Credit" when it
 * fits, else with the credit's first part, else the outlet alone (the credit stays in `imageCredit`, and in
 * `imageCreditLine` for graphics that draw it on the picture).
 */
export function sourceWithCredit(outlet, credit) {
  if (!credit || ownCredit(credit, outlet)) return outlet;
  // a FILE photo from the image search ("FILE · Jane Doe · CC BY-SA") always says so on air: the source plate
  // may drop the author and the licence, never the word FILE (a viewer must not take it for the event)
  const file = /^FILE\s*·\s*/i.exec(String(credit));
  if (file) {
    const [author = '', licence = ''] = String(credit).slice(file[0].length).split(/\s*·\s*/);
    for (const line of [`${outlet} / File: ${author} · ${licence}`, `${outlet} / File: ${author}`, `${outlet} / File photo`]) if (author && line.length <= SOURCE_MAX) return line;
    const tail = ' / File photo';
    if (`${outlet}${tail}`.length <= SOURCE_MAX) return `${outlet}${tail}`;
    return `${String(outlet).slice(0, SOURCE_MAX - tail.length).replace(/\s+\S*$/, '')}${tail}`;
  }
  for (const c of [credit, shortCredit(credit), bareCredit(credit)]) {
    const line = `${outlet} / Photo: ${c}`;
    if (c && line.length <= SOURCE_MAX) return line;
  }
  return outlet;
}
/** "PHOTO: <CREDIT>" in capitals, whole words, at most CREDIT_LINE_MAX characters (null when it cannot fit). */
export function creditLine(credit) {
  // a FILE photo: "FILE: JANE DOE · CC BY-SA", else "FILE: JANE DOE", else "FILE PHOTO"
  if (/^FILE\s*·/i.test(String(credit))) {
    const [, author = '', licence = ''] = String(credit).split(/\s*·\s*/);
    for (const line of [`FILE: ${author} · ${licence}`, `FILE: ${author}`, 'FILE PHOTO']) if (line.length <= CREDIT_LINE_MAX && !/: $/.test(line)) return line.toUpperCase();
  }
  for (const c of [credit, shortCredit(credit), bareCredit(credit)]) {
    const line = `PHOTO: ${String(c || '').toUpperCase()}`;
    if (c && line.length <= CREDIT_LINE_MAX) return line;
  }
  const words = `PHOTO: ${shortCredit(credit).toUpperCase()}`.split(' ');
  while (words.length > 2 && words.join(' ').length > CREDIT_LINE_MAX) words.pop();
  const line = words.join(' ');
  return words.length > 1 && line.length <= CREDIT_LINE_MAX ? line : null;
}

/**
 * The visual beats a story offers, in the order the desk suggests (`visuals`:
 * the map when it names a place, then its picture, then its figure card), and
 * `locator` when it has both a place and a picture but too few sentences for a
 * beat each (one sentence per shot): the client can then show the picture
 * full frame with a small locator map inset, rather than dropping either.
 * Round-up items stay on their map. Both fields are optional hints.
 */
export function planVisuals(seg, { roundupPictures = false } = {}) {
  const visuals = [];
  if (seg.location) visuals.push('map');
  // A round-up item stays on its map, except where the programme puts a picture on every item (NEWS IN 60).
  if (seg.hasImage && (!seg.roundup || roundupPictures)) visuals.push('picture');
  if (!seg.roundup && (seg.fact || seg.numbers?.length)) visuals.push('fact');
  if (visuals.length) seg.visuals = visuals;
  else delete seg.visuals;
  const sentences = String(seg.text || '').split(/(?<=[.!?…])\s+(?=["“'A-Z0-9])/).filter((x) => x.trim()).length;
  if (seg.location && seg.hasImage && !seg.roundup && sentences < 3) seg.locator = true;
  else delete seg.locator;
}

/**
 * Makes one episode of a programme through a pipeline of stages. Each stage
 * gets the shared production context and can improve it; new quality steps
 * (extra fact checks, better images, server-side voices...) slot in here.
 */
export class Producer {
  constructor({ config, newsDesk, chain, voice = null, images = null, weather = null, log = console }) {
    this.config = config;
    this.news = newsDesk;
    this.weather = weather; // server/weather WeatherDesk: WORLD WEATHER's data (kind 'weather' programmes)
    // news episodes produced since the last weather programme: the weather never airs twice in a row (a news
    // drought falls back to filler and replays, not to the same forecast every slot)
    this.newsSinceWeather = Infinity;
    this.chain = chain;
    this.voice = voice; // server/voice VoiceService (neural voices), optional
    this.images = images; // server/images ImageCache: pictures are verified (and warmed) before air, optional
    this.log = log;
    this.seq = 0;
    // The presenters' own lines (chats, buttons, signposts) aired in the last hours (config.recentLinesHours,
    // 6 by default), oldest first: the writer picks the line aired longest ago, the validator drops a chat
    // line that aired lately, so a 24/7 rotation does not hear the same exchange every half hour.
    this.recentLines = []; // [{ line, at }]
    // Stories that were the number of the day or "And finally" lately: another story takes the feature when one
    // qualifies (a re-run does not bring the same feature back every rotation).
    this.recentFeatures = []; // [{ id, at }]
    this.stages = [
      // The picture desk works before the writer, so the writer knows which candidates have a picture.
      { name: 'pictures', run: (ctx) => this.pictures(ctx), enabled: () => typeof this.news.findPictures === 'function' },
      { name: 'write', run: (ctx) => this.write(ctx) },
      { name: 'review', run: (ctx) => this.review(ctx), enabled: () => this.config.reviewPass },
      { name: 'fit', run: (ctx) => this.fit(ctx), enabled: (ctx) => !!ctx.program.timing },
      { name: 'assets', run: (ctx) => this.assets(ctx) },
      // Presenter voices synthesised ahead of air; never fails the episode (late or missing clips air with browser voices).
      { name: 'voice', run: (ctx) => this.voice.voiceEpisode(ctx).catch((err) => ({ voice: 'browser', error: err.message })), enabled: () => !!this.voice?.enabled },
    ];
  }

  /**
   * Stories this programme could cover right now. With `upcoming` (the next
   * programmes in the rotation), stories on another programme's own beat are
   * left for it: TECH BYTES does not use up the science COSMOS airs next.
   */
  select(program, { upcoming = [] } = {}) {
    // Stories another programme due soon will want as its own: its primary section (science for COSMOS), and
    // the topics its beat takes from our sections (COSMOS's space stories filed under tech) weigh half here.
    const wanted = [];
    for (const next of upcoming) {
      const beat = next?.categories?.[0] || null;
      if (beat && beat !== program.categories?.[0] && program.categories?.includes(beat)) wanted.push((s) => s.category === beat);
      for (const [section, topics] of Object.entries(next?.beat || {})) {
        if (program.categories?.includes(section) && next !== program) wanted.push((s) => s.category === section && onBeat(s, { [section]: topics }));
      }
    }
    const avoid = wanted.length ? (s) => (wanted.some((f) => f(s)) ? 0.5 : 1) : null;
    // Long programmes (pace: up to ~10 min) need a deeper pool than the default 12: at least 1.5 x their stories.
    // A programme with a picture on every item (NEWS IN 60) looks a little deeper, for stories that have one.
    const every = program.pictures === 'every';
    const pool = Math.max(this.config.candidatePool ?? 12, Math.ceil((program.stories || 0) * (every ? 2.5 : 1.5)));
    const list = this.news.candidates(pool, { categories: program.categories, fill: true, ...(avoid ? { avoid } : {}), ...(program.beat ? { beat: program.beat } : {}) });
    if (!every) return list;
    // Stories with a picture first (in the desk's order), then the rest as a fallback for the writer.
    return [...list.filter((s) => s.image), ...list.filter((s) => !s.image)];
  }

  /**
   * The fewest stories a programme airs with: its `minStories` (NEWS IN 60's
   * timing.minStories), else half its stories, never under MIN_NEW_STORIES.
   * A two-story WORLD NOW is not a programme: below its floor the slot is
   * skipped (and never promised as "up next").
   */
  floorOf(program) {
    const stories = Math.max(1, program?.stories || 1);
    const want = program?.minStories ?? program?.timing?.minStories ?? Math.ceil(stories / 2);
    return Math.min(stories, Math.max(this.config.minNewStories ?? 3, want));
  }

  /**
   * select(), and when the desk comes up short of the programme's stories,
   * stories aired longest ago come back first (NewsDesk.recycle): the
   * offline slate (an all-local desk) always; live feeds only with
   * config.recycle 'all', and then only stories aired at least
   * config.recycleAfterHours ago. Never a story of the last few episodes.
   */
  stock(program, opts = {}) {
    let list = this.select(program, opts);
    const policy = this.config.recycle ?? 'local';
    // A programme with a picture on every item (NEWS IN 60) counts only the stories that have one.
    const every = program.pictures === 'every';
    const usable = (l) => (every ? l.filter((s) => s.image) : l);
    const want = program.stories || 0;
    if (usable(list).length >= want || typeof this.news.recycle !== 'function' || policy === 'off') return list;
    if (policy !== 'all' && !this.news.localOnly) return list;
    const pool = Math.max(this.config.candidatePool ?? 12, Math.ceil(want * 1.5));
    const minAgeMs = this.news.localOnly ? 0 : (this.config.recycleAfterHours ?? 4) * 3600_000;
    const cats = program.categories || null;
    // only stories the programme could air: its sections, on its beat (no coral reef on TECH BYTES), with a
    // picture where every item has one
    const fits = (s) => (!cats || cats.includes(s.category)) && (!program.beat || onBeat(s, program.beat)) && (!every || !!s.image);
    const back = this.news.recycle((pool - usable(list).length) * 2, { filter: fits, gap: this.config.recycleGap ?? 6, minAgeMs });
    if (back) list = this.select(program, opts);
    return list;
  }

  canProduce(channel, programId) {
    const program = { id: programId, ...channel.programs[programId] };
    if (program.kind === 'weather') return !!this.weather?.enabled && this.weather.usable?.() !== false && this.newsSinceWeather >= (program.minBetween ?? 3);
    return this.stock(program).length >= this.floorOf(program);
  }

  async produce(channel, programId, { upcoming = [] } = {}) {
    const program = { id: programId, ...channel.programs[programId] };
    const cast = castOf(channel, programId);
    const presenters = Object.fromEntries(Object.entries(cast).map(([slot, id]) => [slot, { id, ...channel.presenters[id] }]));
    if (program.kind === 'weather') return this.produceWeather(channel, program, cast, presenters);
    const candidates = this.stock(program, { upcoming: upcoming.map((id) => channel.programs[id]).filter(Boolean) });
    if (candidates.length < this.floorOf(program)) return null;

    const ctx = { channelName: channel.name, program, presenters, cast, candidates, episode: null, provider: null, pipeline: [] };
    const started = Date.now();
    try {
      for (const stage of this.stages) {
        if (stage.enabled && !stage.enabled(ctx)) continue;
        const t0 = Date.now();
        const note = await stage.run(ctx);
        ctx.pipeline.push({ stage: stage.name, ms: Date.now() - t0, ...(note || {}) });
      }
    } catch (err) {
      this.log.error?.(`[producer] ${program.title}: ${err.message}`);
      throw err;
    }

    this.newsSinceWeather++;
    const used = new Set(ctx.episode.storyIds);
    this.rememberLines(ctx.episode);
    this.rememberFeatures(ctx.episode);
    this.news.markCovered(ctx.episode.storyIds);
    this.news.markOffered(candidates.filter((s) => !used.has(s.id)).map((s) => s.id));

    const episode = {
      kind: 'episode',
      id: `e${Date.now().toString(36)}${(this.seq++).toString(36)}`,
      createdAt: new Date().toISOString(),
      program: { id: program.id, title: program.title, tagline: program.tagline, theme: program.theme },
      cast,
      provider: ctx.provider,
      pipeline: ctx.pipeline,
      ...ctx.episode,
    };
    this.log.info?.(
      `[producer] ${program.title} ${episode.id} ready in ${((Date.now() - started) / 1000).toFixed(1)} s ` +
        `(${ctx.pipeline.map((p) => `${p.stage}${p.provider ? `:${p.provider}` : ''}`).join(' → ')}), ${episode.storyIds.length} stories`
    );
    return episode;
  }

  /**
   * WORLD WEATHER: the script is written from the weather report alone (server/weatherwriter.js: every figure
   * is the forecast's, every warning GDACS's), then voiced like any episode. No report, no programme (null:
   * the station skips the slot); never the offline demo data in place of a failed live fetch.
   */
  async produceWeather(channel, program, cast, presenters) {
    const started = Date.now();
    const t0 = Date.now();
    const report = await this.weather?.report();
    if (!report) {
      this.log.warn?.(`[producer] ${program.title}: no weather data (${this.weather?.lastError || 'off'}); slot skipped`);
      return null;
    }
    const body = writeWeather(report, { presenter: presenters.A, channelName: channel.name, title: program.title, seed: `${this.seq}` });
    if (!body) return null;
    this.newsSinceWeather = 0;
    const ctx = { channelName: channel.name, program, presenters, cast, candidates: [], episode: body, provider: 'weather', pipeline: [{ stage: 'weather', ms: Date.now() - t0, source: report.source }] };
    if (this.voice?.enabled) {
      const tv = Date.now();
      const note = await this.voice.voiceEpisode(ctx).catch((err) => ({ voice: 'browser', error: err.message }));
      ctx.pipeline.push({ stage: 'voice', ms: Date.now() - tv, ...(note || {}) });
    }
    const episode = {
      kind: 'episode',
      id: `e${Date.now().toString(36)}${(this.seq++).toString(36)}`,
      createdAt: new Date().toISOString(),
      program: { id: program.id, title: program.title, tagline: program.tagline, theme: program.theme },
      cast,
      provider: 'weather',
      pipeline: ctx.pipeline,
      ...ctx.episode,
    };
    this.log.info?.(`[producer] ${program.title} ${episode.id} ready in ${((Date.now() - started) / 1000).toFixed(1)} s (${ctx.pipeline.map((p) => p.stage).join(' → ')}), ${report.source}, ${episode.weather.zones.length} zones, ${episode.weather.warnings.length} warnings`);
    return episode;
  }

  normalizer(ctx, stories) {
    return (text) =>
      normalizeBulletin(extractJson(text), stories, {
        // chat lines aired lately are not aired again (any writer)
        recent: this.recentPlain(),
        channelName: ctx.channelName,
        maxStories: ctx.program.stories,
        maxChats: ctx.program.maxChats ?? 3,
        solo: !ctx.presenters.B,
        features: ctx.program.features || [],
        // the programme's editorial rules (headline length, chats, gestures, emotions...) and who sits in which slot
        program: ctx.program,
        presenters: ctx.presenters,
        // names that may legitimately contain numbers ("NEWS IN 60", "UNIT-8")
        ownNames: [ctx.program.title, ...Object.values(ctx.presenters).map((p) => p.name)],
      });
  }

  /** Keep the chat lines of an episode (sentence by sentence, plain text) in the station's memory of what aired. */
  rememberLines(episode, now = Date.now()) {
    const max = this.config.recentLines ?? 1000;
    const window = (this.config.recentLinesHours ?? 6) * 3600_000;
    for (const seg of episode?.segments || []) {
      if (seg.type !== 'chat') continue;
      for (const line of String(seg.text).split(/(?<=[.!?])\s+/)) if (line.trim()) this.recentLines.push({ line: line.trim(), at: now });
    }
    while (this.recentLines.length && (this.recentLines.length > max || now - this.recentLines[0].at > window)) this.recentLines.shift();
  }

  /** The lines in memory, oldest first, as plain strings. */
  recentText() {
    return this.recentLines.map((x) => x.line);
  }

  /** The same, as the validator compares them: lower case, no stage directions. */
  recentPlain() {
    return new Set(this.recentLines.map((x) => x.line.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()));
  }

  /** Remember which stories were the number of the day or "And finally" (the last 16 episodes, at most 6 hours). */
  rememberFeatures(episode, now = Date.now()) {
    for (const seg of episode?.segments || []) if (seg.type === 'story' && (seg.feature === 'number' || seg.feature === 'lighter')) this.recentFeatures.push({ id: seg.storyId, at: now });
    const window = (this.config.recentLinesHours ?? 6) * 3600_000;
    while (this.recentFeatures.length && (this.recentFeatures.length > 32 || now - this.recentFeatures[0].at > window)) this.recentFeatures.shift();
  }

  async write(ctx) {
    const recent = this.recentText();
    const prompt = buildPrompt({ channelName: ctx.channelName, program: ctx.program, presenters: ctx.presenters, stories: ctx.candidates, recentLines: recent.slice(-24) });
    const { provider, value } = await this.chain.generate(
      // `recent`: lines aired lately, for writers that pick from their own repertoire (the offline mock);
      // `featured`: stories that were a feature lately (the same "And finally" does not come round every rotation).
      { stage: 'write', prompt, stories: ctx.candidates, channelName: ctx.channelName, program: ctx.program, presenters: ctx.presenters, count: ctx.program.stories, recent, featured: this.recentFeatures.map((x) => x.id) },
      this.normalizer(ctx, ctx.candidates)
    );
    ctx.episode = value;
    ctx.provider = provider;
    return { provider };
  }

  /** Standards editor: checks the script against the sources. Never blocks the show. */
  async review(ctx) {
    const stories = ctx.episode.storyIds.map((id) => this.news.get(id)).filter(Boolean);
    const script = {
      title: ctx.episode.title,
      segments: ctx.episode.segments.map(({ source, category, hasImage, cues, ...seg }) => ({ ...seg, text: embedCues(seg.text, cues) })),
    };
    const prompt = buildReviewPrompt({ channelName: ctx.channelName, program: ctx.program, script, stories });
    try {
      const { provider, value } = await this.chain.generate(
        { stage: 'review', prompt, script, stories, channelName: ctx.channelName, program: ctx.program, presenters: ctx.presenters },
        this.normalizer(ctx, stories)
      );
      // The editor may drop a story it cannot stand behind, never add one.
      ctx.episode = value;
      return { provider, reviewed: true };
    } catch (err) {
      // Without an AI editor (offline demo: the mock only writes) nothing is checked, and the pipeline says so.
      if (err.code === 'NO_REVIEWER') this.log.info?.(`[producer] review skipped: ${err.message}`);
      else this.log.warn?.(`[producer] review skipped: ${err.message}`);
      return { reviewed: false, error: err.message };
    }
  }

  /**
   * Fit a timed programme (NEWS IN 60) to its slot: estimate the running time
   * from the words (wpm, gaps between segments) and drop stories from the tail
   * (never the lead, a round-up item or breaking news) while that brings the
   * estimate closer to the target. Dropped stories are only "offered", so they
   * can air later. Never pads: a short episode airs short and says so.
   */
  fit(ctx) {
    const timing = ctx.program.timing;
    const words = (seg) => String(seg.text).split(/\s+/).filter(Boolean).length;
    const estimate = (segs) => 0.3 + segs.reduce((n, seg) => n + words(seg), 0) / (timing.wpm / 60) + (timing.gap ?? 0.7) * (segs.length - 1);
    const minStories = timing.minStories ?? 1;
    let segs = ctx.episode.segments;
    const options = [{ segs, t: estimate(segs) }];
    for (;;) {
      const stories = segs.filter((seg) => seg.type === 'story');
      if (stories.length <= minStories) break;
      let i = segs.length - 1;
      while (i >= 0 && !(segs[i].type === 'story' && segs[i] !== stories[0] && !segs[i].roundup && !segs[i].breaking)) i--;
      if (i < 0) break;
      const cut = i;
      segs = segs.filter((seg, k) => k !== cut && !(k === cut + 1 && seg.type === 'chat'));
      options.push({ segs, t: estimate(segs) });
    }
    // Closest to the target; within a second of each other, more stories win.
    let best = options[0];
    for (const o of options.slice(1)) if (Math.abs(o.t - timing.target) < Math.abs(best.t - timing.target) - 1) best = o;
    const kept = new Set(best.segs.filter((seg) => seg.storyId).map((seg) => seg.storyId));
    const dropped = ctx.episode.storyIds.filter((id) => !kept.has(id)).length;
    ctx.episode.segments = best.segs;
    ctx.episode.rundown = ctx.episode.rundown.filter((r) => kept.has(r.storyId));
    ctx.episode.storyIds = ctx.episode.storyIds.filter((id) => kept.has(id));
    const intro = best.segs[0];
    if (intro?.teases) intro.teases = intro.teases.map((id) => (id && kept.has(id) ? id : null));
    const accept = timing.accept || [timing.target * 0.9, timing.target * 1.1];
    return { estimate: Math.round(best.t * 10) / 10, dropped, ...(best.t < accept[0] ? { short: true } : {}) };
  }

  /** Pictures for the candidates: article pages, then other outlets' reports of the same event (within a budget). */
  async pictures(ctx) {
    const pictures = await this.news.findPictures(ctx.candidates, { budgetMs: this.config.pictureBudgetMs ?? 6000 });
    // the story dossier: the article text of the candidates the writer is most likely to make main stories (wave 3
    // §3.1: depth for programmes of 8-10 minutes, never padding)
    if (typeof this.news.readArticles !== 'function') return pictures;
    const articles = await this.news.readArticles(ctx.candidates, { budgetMs: this.config.articleBudgetMs ?? 6000, max: this.config.articleMax ?? 8 });
    return { ...pictures, ...articles };
  }


  async assets(ctx) {
    const stories = ctx.episode.storyIds.map((id) => this.news.get(id)).filter(Boolean);
    if (typeof this.news.findPictures === 'function') await this.news.findPictures(stories, { budgetMs: this.config.pictureBudgetMs ?? 6000 });
    else await Promise.all(stories.map((s) => this.news.resolveImage(s)));
    const verified = this.images ? await this.verifyPictures(stories) : null;
    const story = (id) => this.news.get(id);
    // Every picture on air carries its credit (`imageCredit`, and `imageCreditVia`: media:credit | jsonld |
    // site_name | outlet). Until the graphics draw "PHOTO: <credit>" from it, a picture that is not the
    // outlet's own (lent by another outlet, or an agency's) also shows its credit where the source is
    // already drawn (the strap plate, the montage card): "Bitport Herald / Photo: Pixelburg Post".
    // `outlet` always keeps the outlet's own name for renderers that draw the credit themselves.
    const apply = (item) => {
      const s = story(item.storyId);
      item.hasImage = !!s?.image;
      const outlet = item.outlet || item.source || s?.source || '';
      if (outlet) item.outlet = outlet;
      delete item.imageCredit;
      delete item.imageCreditVia;
      delete item.imageCreditLine;
      item.source = outlet;
      if (!s?.image) return;
      const c = pictureCredit(s, this.images?.sources?.get?.(s.id));
      item.imageCredit = c.credit;
      item.imageCreditVia = c.via;
      const line = creditLine(c.credit);
      if (line) item.imageCreditLine = line;
      // The stop-gap rides on the source only on segments and rundown items whose picture is shown; it never
      // runs past the plate (SOURCE_MAX), and a credit that cannot fit stays in imageCredit only.
      item.source = sourceWithCredit(outlet, c.credit);
    };
    for (const seg of ctx.episode.segments) {
      if (!seg.storyId) continue;
      apply(seg);
      planVisuals(seg, { roundupPictures: ctx.program.pictures === 'every' });
    }
    for (const item of ctx.episode.rundown) apply(item);
    const borrowed = stories.filter((s) => s.image && s.imageFrom).length;
    return { images: stories.filter((s) => s.image).length, ...(borrowed ? { borrowed } : {}), ...(verified || {}) };
  }

  /**
   * Download each picture once before air (warming the cache the client will
   * read): one that fails or is too small is dropped, and another outlet's
   * picture of the same event may stand in. Within a budget: a picture still
   * downloading then keeps its place (the client copes if it fails later).
   */
  async verifyPictures(stories) {
    let dropped = 0;
    const passing = (e) => /timeout|timed out|abort|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket|HTTP 5\d\d/i.test(String(e));
    const check = async (s) => {
      let retried = false;
      for (let attempt = 0; attempt < 3 && s.image; attempt++) {
        let entry = await this.images.get(s.id, s.images || [s.image]);
        // a network error or a timeout is tried once more before the picture is given up (for half an hour)
        if (entry.error && passing(entry.error) && !retried && typeof this.images.forget === 'function') {
          retried = true;
          this.images.forget(s.id);
          entry = await this.images.get(s.id, s.images || [s.image]);
        }
        if (!entry.error) return;
        dropped++;
        if (typeof this.news.pictureFailed !== 'function') {
          s.image = null;
          return;
        }
        this.news.pictureFailed(s, { reason: entry.error });
      }
    };
    const budget = this.config.pictureVerifyMs ?? 12000;
    let timer;
    await Promise.race([Promise.all(stories.filter((s) => s.image).map(check)), new Promise((resolve) => (timer = setTimeout(resolve, budget)))]);
    clearTimeout(timer);
    return { verified: stories.filter((s) => s.image).length, ...(dropped ? { dropped } : {}) };
  }
}
