import { buildPrompt, buildReviewPrompt, collapseCrosses, extractJson, normalizeBulletin } from './writer.js';
import { rosterOf } from './correspondents.js';
import { expertsOf, restedExperts } from './experts.js';
import { castOf } from './channel.js';
import { embedCues } from '../public/js/cues.js';
import { onBeat } from './topics.js';
import { pictureCredit } from './news.js';
import { isGrave } from './facts.js';
import { explainTerms } from './glossary.js';
import { writeWeather } from './weatherwriter.js';
import { restageCheck, restageHold, bookGuest, provenanceLine } from './guests/restage.js';
import { rightsGate } from './compliance/credits.js';
import path from 'node:path';
import { writeWeekly } from './weeklywriter.js';
import { QuizDesk } from './quiz/edition.js';
import { pictureCleared, quizEvents } from './quiz/desk.js';
import { balance, prepareStories } from './sport/prepare.js';
import { shapeEpisode } from './sport/shape.js';
import { voicedAir } from './airtime.js';
import { airable, compactRights, currentRights, pictureMode } from './rights.js';
import { locate, lookupPlace, placeSupported, institutionPlace } from './gazetteer.js';
import { boardSpec } from '../public/js/boardspec.js';
import { airedText } from './compliance/verbatim.js';
import { MAX_REWRITES, checkScore, copiedPassages, currentLines, dropStory, editorChanges, mergeRewrite, parseRewrite, rewriteFaults, rewritePrompt, storyCheck, storySources, trimStory } from './ownwords.js';

const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Is the credit just the outlet itself ("Pixelburg Post" on Pixelburg Post's own picture)? */
const ownCredit = (credit, outlet) => !credit || fold(credit) === fold(outlet) || fold(credit).startsWith(`${fold(outlet)} `);

// The source plate on the strap and on the headline montage card holds about 36 characters: the stop-gap credit
// ("Outlet / Photo: Credit") must fit it whole, never cut mid-word with an ellipsis.
export const SOURCE_MAX = 36;
// PAY ATTENTION's pictures kept as fetched for its editions (two editions' worth, DOUBLE OR NOTHING's offers with them)
const QUIZ_PICTURES_KEPT = 16;
// Where one spoken sentence ends and the next begins: a stop, then a capital (never "Mr. Smith", "U.S. officials", "$10.5m").
const SENTENCE_BREAK = /(?<=[.!?]["”’)]?)(?<!\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Gen|Lt|Col|Sgt|Rep|Sen|Gov|Prof|No|vs|Inc|Ltd|Co|U\.S|U\.K|a\.m|p\.m)\.)\s+(?=["“‘(]?\p{Lu})/u;
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
  // (a FILE picture of an earlier event keeps its year: "FILE 2023 · ...")
  const file = /^FILE(?: (\d{4}))?\s*·\s*/i.exec(String(credit));
  if (file) {
    const [author = '', licence = ''] = String(credit).slice(file[0].length).split(/\s*·\s*/);
    const word = file[1] ? `File ${file[1]}` : 'File';
    for (const line of [`${outlet} / ${word}: ${author} · ${licence}`, `${outlet} / ${word}: ${author}`, `${outlet} / ${word} photo`]) if (author && line.length <= SOURCE_MAX) return line;
    const tail = ` / ${word} photo`;
    if (`${outlet}${tail}`.length <= SOURCE_MAX) return `${outlet}${tail}`;
    return `${String(outlet).slice(0, SOURCE_MAX - tail.length).replace(/\s+\S*$/, '')}${tail}`;
  }
  for (const c of [credit, shortCredit(credit), bareCredit(credit)]) {
    const line = `${outlet} / Photo: ${c}`;
    if (c && line.length <= SOURCE_MAX) return line;
  }
  return outlet;
}
/**
 * The place a story's headline board shows (graphics/locator.js), as a rundown location, or null (no place: the topic
 * board). The place the headline names wins: its first country or city (server/gazetteer.js locate: a country that
 * opens the headline and acts elsewhere is put where it acted, "off <country>" is that country's coast, a country
 * that speaks is itself), unless the writer's place is in it (a city of that country is more precise). A headline that
 * names no place keeps the writer's place only where the story's lead names it (a newsletter's "First Thing: Pope
 * Leo recovering from surgery" was put on Florida), else none.
 */
export function boardPlace(headline, location, lead = '') {
  const asLocation = (e) => ({ place: e.label, lat: e.lat, lon: e.lon, ...(e.kind === 'country' ? { scope: 'country' } : {}) });
  const country = (x) => (x ? (x.kind === 'country' ? x.name : x.country) : null);
  const cur = location?.place ? lookupPlace(location.place) : null;
  // (a headline in capitals is read in title case: "KENYA CONFIRMS THIRD EBOLA CASE" names Kenya)
  const h = String(headline || '');
  const head = /\p{Ll}/u.test(h) ? h : h.toLowerCase().replace(/(^|[^\p{L}'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const e = locate(head, '')?.entry;
  // (the writer's more precise place within the headline's country only where the story names it: "CALIFORNIA, USA"
  // for a story set in Baja California is not)
  if (e && !e.broad) return cur && country(cur) === country(e) && (cur === e || placeSupported(location.place, `${h} ${lead}`)) ? location : asLocation(e);
  // (never another place taken from the lead instead: a sports story's lead names clubs, "Atletico Madrid")
  if (location && (!lead || placeSupported(location.place, `${headline} ${lead}`))) return location;
  // (a headline that names no place, and a writer's place the story never names: a country's court, police or
  // government acting in the lead is where it happened, "A Mexican judge sentenced the three men")
  const acting = institutionPlace(lead);
  return acting ? asLocation(acting) : null;
}

/** "PHOTO: <CREDIT>" in capitals, whole words, at most CREDIT_LINE_MAX characters (null when it cannot fit). */
export function creditLine(credit) {
  // a FILE photo: "FILE: JANE DOE · CC BY-SA", else "FILE: JANE DOE", else "FILE PHOTO"
  const file = /^(FILE(?: \d{4})?)\s*·/i.exec(String(credit));
  if (file) {
    const [, author = '', licence = ''] = String(credit).split(/\s*·\s*/);
    const tag = file[1].toUpperCase();
    for (const line of [`${tag}: ${author} · ${licence}`, `${tag}: ${author}`, `${tag} PHOTO`]) if (line.length <= CREDIT_LINE_MAX && !/: $/.test(line)) return line.toUpperCase();
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
  constructor({ config, newsDesk, chain, voice = null, images = null, weather = null, footage = null, identity = null, audit = null, archive = null, pictureDesk = null, pictureAhead = null, log = console }) {
    this.config = config;
    // the rights-aware picture desk (server/picturedesk.js): every picture on air is one the channel may publish, with
    // its rights record; without it (tests, older callers) the news desk's own pictures air as before
    this.pictureDesk = pictureDesk;
    this.pictureMode = pictureMode(config?.pictures?.rights);
    // ...deciding ahead of air (server/pictureahead.js; round 9): stories are decided in the background as they come in,
    // the next programmes' first; production only reads the decisions that are ready. Without it (tests, older callers)
    // the desk decides within the picture budget, as before
    this.pictureAhead = pictureDesk ? pictureAhead : null;
    this.lookAheadAt = null; // { channel, ids }: the programmes the station makes next (their candidates decided first)
    if (this.pictureAhead) {
      this.pictureAhead.tiers = () => this.pictureTiers();
      this.pictureAhead.watch = () => this.liveStories();
      this.pictureAhead.onDecided = (s, tier) => this.pictureDecided(s, tier);
    }
    // the channel's memory of what it aired (server/archive.js): every news episode is recorded, SEVEN DAYS is
    // written from it
    this.archive = archive;
    this.lastWeeklyAt = 0;
    // PAY ATTENTION's pictures as fetched for its editions (id -> { type, body }), served by /api/img: a story days old
    // is no longer on the news desk, which /api/img otherwise serves from (on air, 13 Oct: every PICTURE THIS of an
    // edition aired with an empty frame)
    this.quizPictures = new Map();
    // PAY ATTENTION (kind 'quiz'): the quiz desk plans each edition from the archive and keeps its history and weekly
    // table in data/quiz (server/quiz/edition.js)
    this.quiz = archive ? new QuizDesk({ archive, same: newsDesk?.sameStory ? (a, b) => newsDesk.sameStory(a, b) : null, dir: config?.dataDir ? path.join(config.dataDir, 'quiz') : null, log, view: !!config?.quizView, pictures: this.pictureMode }) : null;
    // FULL TIME (kind 'sport'): when it last aired, the stories it told then, and its leads lately (a lead that led in
    // the last three hours does not lead again; an edition airs at least 40 % new stories)
    this.lastSportAt = 0;
    this.lastSportStories = new Set();
    this.recentSportLeads = []; // [{ id, at }]
    // IN THEIR WORDS, re-staged (server/guests/restage.js): who a named speaker is (server/guests/identity.js) and
    // where every re-staged line is logged (data/guests/audit.jsonl), both optional
    this.identity = identity;
    this.audit = audit;
    this.footageDesk = footage; // server/footage FootageDesk: moving pictures of a correspondent link's place, optional
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
    // The experts' analyses lately: an expert waits REST_HOURS before the same programme books them again (its
    // resident aside), and the one seen longest ago goes first (server/experts.js restedExperts).
    this.recentExperts = []; // [{ id, programId, at }]
    // The station's count of analyses so far: each kind of presenter line round them walks through its forms.
    this.analysisTurn = 0;
    this.stages = [
      // The picture desk works before the writer, so the writer knows which candidates have a picture.
      { name: 'pictures', run: (ctx) => this.pictures(ctx), enabled: () => typeof this.news.findPictures === 'function' || !!this.pictureDesk },
      // FULL TIME: its stories made ready before the writer sees them (time words from today, no verdicts on players,
      // scorelines and fixtures read) and balanced across sports (server/sport/prepare.js)
      { name: 'sport-desk', run: (ctx) => this.sportDesk(ctx), enabled: (ctx) => ctx.program.kind === 'sport' },
      { name: 'write', run: (ctx) => this.write(ctx) },
      { name: 'review', run: (ctx) => this.review(ctx), enabled: () => this.config.reviewPass },
      // ...and shaped for the day and the hour after the writer (server/sport/shape.js)
      { name: 'sport', run: (ctx) => this.shapeSport(ctx), enabled: (ctx) => ctx.program.kind === 'sport' && !!ctx.episode?.segments },
      // IN THEIR WORDS, re-staged: a story's sourced quote said by the person themselves, a labelled recreation (after
      // the review: the editor checks the words where the presenter reads them, the recreation adds none of its own)
      { name: 'guests', run: (ctx) => this.guests(ctx), enabled: (ctx) => (Number(ctx.program.restage) || 0) > 0 && this.config.restage !== false && !!ctx.episode?.segments },
      // IN PLAIN ENGLISH (server/glossary.js): the programme's explainer translates a story's jargon from our fixed
      // glossary (never the model's words), a term once in the hours of recent lines
      { name: 'terms', run: (ctx) => this.terms(ctx), enabled: (ctx) => !!ctx.program.terms && !!ctx.episode?.segments },
      { name: 'fit', run: (ctx) => this.fit(ctx), enabled: (ctx) => !!ctx.program.timing },
      { name: 'assets', run: (ctx) => this.assets(ctx) },
      // Footage of each correspondent link's place (FILE clips the client pixelates); never fails the episode.
      { name: 'footage', run: (ctx) => this.footage(ctx), enabled: (ctx) => !!this.footageDesk?.enabled && !!ctx.episode?.segments?.some((s) => s.type === 'cross') },
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
    // (FULL TIME too: its balance needs other sports to swap in, and SCORE CENTRE the results its stories do not tell)
    // (a long programme that may take `moreStories` when it runs short looks as much deeper)
    const deeper = program.moreStories && !this.news?.localOnly; // (never on the offline slate: producer.deepen)
    const pool = Math.max(this.config.candidatePool ?? 12, Math.ceil(((program.stories || 0) + (deeper ? Number(program.moreStories) || 0 : 0)) * (every || program.kind === 'sport' ? 2.5 : deeper ? 2 : 1.5)));
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
    if (program.kind === 'weekly') return this.weeklyReady(program);
    if (program.kind === 'sport') return this.sportReady(program);
    if (program.kind === 'quiz') return !!this.quiz?.ready(program, channel).air;
    return this.stock(program).length >= this.floorOf(program);
  }

  async produce(channel, programId, { upcoming = [] } = {}) {
    const program = { id: programId, ...channel.programs[programId] };
    const cast = castOf(channel, programId);
    const presenters = Object.fromEntries(Object.entries(cast).map(([slot, id]) => [slot, { id, ...channel.presenters[id] }]));
    if (program.kind === 'weather') return this.produceWeather(channel, program, cast, presenters);
    if (program.kind === 'weekly') return this.produceWeekly(channel, program, cast, presenters);
    if (program.kind === 'quiz') return this.produceQuiz(channel, program);
    const candidates = this.stock(program, { upcoming: upcoming.map((id) => channel.programs[id]).filter(Boolean) });
    // (the programmes after this one, and the clock's pinned bulletin: their candidates are the picture desk's next work)
    this.lookAhead(channel, [...upcoming, ...(channel.clock?.pins || []).map((p) => p.program)]);
    if (candidates.length < this.floorOf(program)) return null;

    // the programme's correspondents (links: server/correspondents.js), voiced in the slots the writer gives them
    const correspondents = rosterOf(program, channel.presenters);
    // ...and its experts (analyses: server/experts.js), voiced in the slots that follow the links'
    const experts = restedExperts(program, expertsOf(program, channel.presenters), this.recentExperts);
    const ctx = { channelName: channel.name, program, presenters, cast, candidates, episode: null, provider: null, pipeline: [], correspondents, experts, channelPresenters: channel.presenters, channelClock: channel.clock };
    const started = Date.now();
    try {
      for (const stage of this.stages) {
        // (an episode the own-words check left below its floor is not finished: server/ownwords.js)
        if (ctx.skip) break;
        if (stage.enabled && !stage.enabled(ctx)) continue;
        const t0 = Date.now();
        const note = await stage.run(ctx);
        ctx.pipeline.push({ stage: stage.name, ms: Date.now() - t0, ...(note || {}) });
      }
    } catch (err) {
      this.log.error?.(`[producer] ${program.title}: ${err.message}`);
      throw err;
    }
    if (ctx.skip) {
      // the slot is skipped (the station moves on); the stories that could not be told in our own words sink in the
      // ranking, then drop out (NewsDesk.markOffered), so the next episode does not meet them first
      if (ctx.dropped?.length) this.news.markOffered(ctx.dropped);
      this.log.warn?.(`[producer] ${program.title}: ${ctx.skip}; slot skipped`);
      return null;
    }

    this.newsSinceWeather++;
    try {
      this.archive?.record({ ...ctx.episode, program: { id: program.id } }, { get: (id) => this.news.get(id) });
    } catch (err) {
      this.log.warn?.(`[archive] ${err.message}`);
    }
    const used = new Set(ctx.episode.storyIds);
    this.rememberLines(ctx.episode);
    this.rememberFeatures(ctx.episode);
    this.rememberExperts(ctx.episode, program.id);
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

  /** The week as the archive groups it (the news desk's sameStory joins a story's tellings across days). */
  weekStories() {
    if (!this.archive) return [];
    const same = typeof this.news.sameStory === 'function' ? (a, b) => {
      try {
        return this.news.sameStory(a, b);
      } catch {
        return false;
      }
    } : null;
    return this.archive.week({ same });
  }

  /**
   * FULL TIME can air: not again within `minGapHours`, its floor of stories, and at least 40 % of the stories it would
   * tell new since its last edition (overnight in UK time, when the sport desk barely moves, the slot is skipped).
   */
  sportReady(program) {
    if (Date.now() - this.lastSportAt < (program.minGapHours ?? 1.5) * 3600_000) return false;
    const list = this.stock(program);
    if (list.length < this.floorOf(program)) return false;
    const top = list.slice(0, program.stories || 10);
    const fresh = top.filter((s) => !this.lastSportStories.has(s.id)).length;
    return fresh >= Math.ceil(0.4 * top.length);
  }

  /** FULL TIME's stories made ready and balanced (the 'sport-desk' stage). */
  sportDesk(ctx) {
    const now = Date.now();
    const tz = ctx.channelClock?.timezone || 'Europe/London';
    const before = ctx.candidates.length;
    const led = new Set(this.recentSportLeads.filter((x) => now - x.at < 3 * 3600_000).map((x) => x.id));
    const list = balance(prepareStories(ctx.candidates, { now, tz }), { count: ctx.program.stories || 10, ledLately: (id) => led.has(id), now });
    // the writer tells the edition (football at most half of it); the shape reads results and dates from all of them
    ctx.sportPool = list;
    // (never a one-line report kept only for its result: server/sport/prepare.js resultOnly)
    ctx.candidates = list.slice(0, Math.max(list.edition ?? list.length, this.floorOf(ctx.program))).filter((s) => !s.resultOnly);
    return { stories: ctx.candidates.length, pool: list.length, dropped: before - list.length };
  }

  /** FULL TIME's shape for the day and the hour (the 'sport' stage). */
  shapeSport(ctx) {
    const note = shapeEpisode(ctx.episode, {
      candidates: ctx.sportPool || ctx.candidates, program: ctx.program, presenters: ctx.presenters, channelName: ctx.channelName,
      now: Date.now(), tz: ctx.channelClock?.timezone || 'Europe/London', recentLines: this.recentText(), seed: `${this.seq}`,
    });
    const now = Date.now();
    for (const line of note.lines || []) this.recentLines.push({ line, at: now });
    this.lastSportAt = now;
    this.lastSportStories = new Set(ctx.episode.storyIds || []);
    const lead = ctx.episode.segments.find((s) => s.type === 'story' && s.storyId && !s.feature);
    if (lead) this.recentSportLeads.push({ id: lead.storyId, at: now });
    this.recentSportLeads = this.recentSportLeads.filter((x) => now - x.at < 6 * 3600_000);
    return { shape: note.shape, results: note.results, fixtures: note.fixtures };
  }

  /** SEVEN DAYS can air: a week told on three days or more, six stories at least, and not again within `minGapHours`. */
  weeklyReady(program) {
    if (!this.archive) return false;
    if (Date.now() - this.lastWeeklyAt < (program.minGapHours ?? 3) * 3600_000) return false;
    // a count first: grouping the week by sameStory is quadratic, and canProduce runs at every /api/next. On the
    // 5,600 airings of 17 Oct it held the station's event loop 60 % of the time (every programme "ready in" 70-120 s,
    // Wikimedia's answers timing out unread). The days told are the entries' own days; thirty stories or more are six
    // events or more however they group (fewer are grouped as before)
    const now = typeof this.archive.now === 'function' ? this.archive.now() : Date.now(); // (the archive's clock, as week())
    const entries = (this.archive.entries || []).filter((e) => e.at >= now - 7 * 86400_000 && e.at <= now);
    const days = new Set(entries.map((e) => new Date(e.at).toISOString().slice(0, 10)));
    const ids = new Set(entries.map((e) => e.id));
    if (days.size < 3 || ids.size < 6) return false;
    if (ids.size >= 30) return true;
    const week = this.weekStories();
    return week.length >= 6 && new Set(week.flatMap((c) => c.days)).size >= 3;
  }

  /**
   * SEVEN DAYS (server/weeklywriter.js): the week retold from the archive, the presenters' own aired words; then the
   * stages any episode has after its writer (IN THEIR WORDS re-staging, pictures, voices). Null when the week is thin.
   */
  async produceWeekly(channel, program, cast, presenters) {
    const t0 = Date.now();
    const body = writeWeekly(this.weekStories(), { presenters, people: channel.presenters, channelName: channel.name, title: program.title, seed: `${this.seq}`, timeZone: channel.clock?.timezone || 'UTC' });
    if (!body) return null;
    const candidates = body.storyIds.map((id) => this.news.get(id)).filter(Boolean);
    const ctx = { channelName: channel.name, program, presenters, cast, candidates, episode: body, provider: 'weekly', pipeline: [{ stage: 'weekly', ms: Date.now() - t0, stories: body.weekly.stories, days: body.weekly.days }], correspondents: [], experts: [], channelPresenters: channel.presenters };
    // the expert who explained the story of the week speaks in their own voice slot
    this.castCorrespondents(ctx);
    for (const stage of this.stages) {
      if (!['guests', 'assets', 'voice'].includes(stage.name)) continue;
      if (stage.enabled && !stage.enabled(ctx)) continue;
      const s0 = Date.now();
      const note = await stage.run(ctx);
      ctx.pipeline.push({ stage: stage.name, ms: Date.now() - s0, ...(note || {}) });
    }
    this.lastWeeklyAt = Date.now();
    const episode = {
      kind: 'episode',
      id: `e${Date.now().toString(36)}${(this.seq++).toString(36)}`,
      createdAt: new Date().toISOString(),
      program: { id: program.id, title: program.title, tagline: program.tagline, theme: program.theme },
      cast,
      provider: 'weekly',
      pipeline: ctx.pipeline,
      ...ctx.episode,
    };
    this.log.info?.(`[producer] ${program.title} ${episode.id} ready in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${body.weekly.stories} stories of the week`);
    return episode;
  }

  /**
   * PAY ATTENTION (server/quiz/): the edition the quiz desk plans from the archive, written by its writer (every fact
   * the channel's own aired words); then the voices. The host speaks in slot H, the two contestants in A and B. Null
   * when no edition fits (the station skips the slot).
   */
  async produceQuiz(channel, program) {
    const t0 = Date.now();
    const plan0 = this.quiz?.planFor(program, channel);
    if (!plan0) return null;
    // never PICTURE THIS without its picture (pay-attention.md §9 step 3): every picture the edition may ask is fetched
    // into the station's picture cache now (the director preloads it from /api/img); one that fails, no edition
    const missing = await this.quizPicturesMissing(plan0);
    if (missing) {
      this.quiz.drop();
      this.log.warn?.(`[producer] ${program.title}: a picture is not cleared or could not be fetched (${missing}); no edition this time`);
      return null;
    }
    const made = this.quiz.make(program, channel, { recentLines: this.recentText(), plan: plan0 });
    if (!made) return null;
    const { episode: body, plan } = made;
    const cast = body.cast.H === 'host' ? { ...body.cast, H: program.presenters[0] } : body.cast;
    const presenters = Object.fromEntries(Object.entries(cast).map(([slot, id]) => [slot, { id, ...channel.presenters[id] }]));
    const ctx = { channelName: channel.name, program, presenters, cast, candidates: [], episode: { ...body, cast }, provider: 'quiz', pipeline: [{ stage: 'quiz', ms: Date.now() - t0, pair: plan.pair, types: plan.types, pool: plan.pool }], correspondents: [], experts: [], channelPresenters: channel.presenters };
    for (const stage of this.stages) {
      if (stage.name !== 'voice') continue;
      if (stage.enabled && !stage.enabled(ctx)) continue;
      const s0 = Date.now();
      const note = await stage.run(ctx);
      ctx.pipeline.push({ stage: stage.name, ms: Date.now() - s0, ...(note || {}) });
    }
    this.rememberLines(ctx.episode);
    const episode = {
      ...ctx.episode,
      kind: 'episode',
      id: `e${Date.now().toString(36)}${(this.seq++).toString(36)}`,
      createdAt: new Date().toISOString(),
      program: { id: program.id, title: program.title, tagline: program.tagline, theme: program.theme },
      cast,
      provider: 'quiz',
      pipeline: ctx.pipeline,
      // a private preview may show an outlet's photo in PICTURE THIS: such an episode says so, and is never published
      ...(this.pictureMode === 'preview' ? { picturePreview: true } : {}),
    };
    this.log.info?.(`[producer] ${program.title} ${episode.id} ready in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${plan.pair.join(' v ')}, ${plan.types.join(' / ')}`);
    return episode;
  }

  /**
   * PAY ATTENTION's pictures (PICTURE THIS, and DOUBLE OR NOTHING's when it is a picture): fetched into the picture
   * cache under the airing that carried them (question.imageId), so /api/img serves each at once. Returns the id of
   * the first that failed, or null (also without a picture cache: tests).
   */
  async quizPicturesMissing(plan) {
    const questions = [...(plan.rounds || []).flatMap((r) => r.questions || []), ...(plan.don?.offers || []).map((o) => o.question)].filter((q) => q?.type === 'picture');
    // never a picture the channel may not show (an outlet's photo outside a private preview): the desk plans none, and
    // an edition that carries one is not made (server/rights.js, PICTURE_RIGHTS)
    for (const q of questions) if (!pictureCleared(q, { pictures: this.pictureMode })) return q.imageId || q.key || 'picture';
    if (!this.images || typeof this.images.get !== 'function') return null;
    for (const q of questions) {
      const id = q.imageId || q.key;
      try {
        const entry = await this.images.get(id, [q.image].filter(Boolean));
        if (!entry || entry.error) return id;
        this.quizPictures.delete(id);
        this.quizPictures.set(id, entry);
        while (this.quizPictures.size > QUIZ_PICTURES_KEPT) this.quizPictures.delete(this.quizPictures.keys().next().value);
      } catch {
        return id;
      }
    }
    return null;
  }

  /** A PAY ATTENTION picture as fetched for an edition ({ type, body }), or null: /api/img serves it before the desk's. */
  quizPicture(id) {
    return this.quizPictures.get(id) || null;
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
        correspondents: ctx.correspondents || [],
        experts: ctx.experts || [],
        analysisTurn: this.analysisTurn,
      });
  }

  /** The correspondents' and experts' voice slots of the episode in production (R1, R2...: episode.correspondents) as presenters. */
  castCorrespondents(ctx) {
    for (const k of Object.keys(ctx.presenters)) if (/^R\d$/.test(k)) delete ctx.presenters[k];
    for (const [slot, id] of Object.entries(ctx.episode?.correspondents || {})) {
      const p = ctx.channelPresenters?.[id];
      if (p) ctx.presenters[slot] = { id, ...p };
    }
  }

  /**
   * IN THEIR WORDS, re-staged (owner 12 Oct; server/guests/restage.js, WAVE3 §6): after a story that carries a quote
   * its source attributes to a person in a public role, that person appears in a press room and says those words
   * (a `cross` of kind 'restage': a recreation, labelled, in a generic voice). The presenter's sentence that read the
   * quote becomes the hand-over that says where the words come from, at the story's end; at most `program.restage`
   * an episode (two at most), the first stories first. Never a round-up item, breaking news or a story with a link of
   * its own; in a grave story only an official or a politician speaking in their role, staged soberly (decision 3).
   */
  async guests(ctx) {
    const max = Math.min(Number(ctx.program.restage) || 0, 2);
    const segs = ctx.episode.segments;
    const taken = new Set(Object.keys(ctx.episode.correspondents || {}));
    const nextSlot = () => {
      let n = 1;
      while (taken.has(`R${n}`)) n++;
      taken.add(`R${n}`);
      return `R${n}`;
    };
    const restaged = [];
    const declined = [];
    for (let i = 0; i < segs.length && restaged.length < max; i++) {
      const seg = segs[i];
      if (seg.type !== 'story' || !seg.quote?.text || !seg.quote.by || seg.link || seg.roundup || seg.breaking || seg.feature) continue;
      const story = this.news.get(seg.storyId);
      if (!story) continue;
      const source = story.body ? `${story.summary || ''} ${story.body}` : story.summary || '';
      const check = restageCheck({ quote: seg.quote, source, story, grave: seg.emotion === 'sad' });
      if (!check.ok) {
        declined.push({ storyId: seg.storyId, reasons: check.reasons });
        continue;
      }
      // a named person is checked (an adult, alive, a public figure); one the check rules out keeps the quote card
      const identity = check.speaker.name && this.identity ? await this.identity.lookup(check.speaker.name, { role: check.speaker.role }) : null;
      if (identity?.refused) {
        declined.push({ storyId: seg.storyId, reasons: [identity.refused] });
        continue;
      }
      // an election period for their country, a candidacy, or a request not to be re-staged (compliance.md §5)
      const held = restageHold({ speaker: check.speaker, identity, story });
      if (held.length) {
        declined.push({ storyId: seg.storyId, reasons: held });
        continue;
      }
      const booking = bookGuest(check.speaker, { outlet: seg.source, identity });
      const slot = nextSlot();
      // the presenter no longer reads the words the person is about to say: that sentence (never the story's first)
      // goes, and the hand-over ends the story
      const sentences = String(seg.text).split(/(?<=[.!?…]["”’]?)\s+(?=["“‘]?[A-Z0-9])/);
      // (its first five words, or fewer when its first sentence is shorter: "As Trump put it: “She went to Greece. She was
      // doing a good job…”" was read by the presenter and then again by the recreation, NPR 14 Oct)
      const head = squashWords(String(seg.quote.text).split(/(?<=[.!?…])\s+/)[0]).split(' ').slice(0, 5).join(' ');
      const k = sentences.findIndex((t, j) => j > 0 && head.length >= 12 && squashWords(t).includes(head));
      // (all of a quotation of several sentences goes, to its closing mark: "Russia is targeting yet another power plant and
      // the lives of our people.”" was left in the presenter's voice when only Zelensky's first sentence went, 14 Oct)
      if (k > 0) {
        let end = k - 1;
        let curly = 0;
        let straight = 0;
        do {
          end++;
          curly += (sentences[end].match(/“/g) || []).length - (sentences[end].match(/”/g) || []).length;
          straight ^= (sentences[end].match(/"/g) || []).length % 2;
        } while ((curly > 0 || straight) && end + 1 < sentences.length && end - k < 5);
        sentences.splice(k, end - k + 1);
      }
      // (and a toss to the co-presenter goes: the recreation follows, not them; "…becomes. Nova? This is what Jevgenij
      // Raskatov… said", COSMOS 14 Oct)
      // (and "Over to you, UNIT-8." before Raskatov's words, COSMOS 15 Oct)
      while (sentences.length > 1 && (/^(?:\[[^\]]*\]\s*)*\p{Lu}[\p{L}-]+[?.]$/u.test(sentences.at(-1).trim()) || /^(?:\[[^\]]*\]\s*)*(?:Over|Back|Now over) to you,?\s+[\p{L}\d-]+[?.]$/u.test(sentences.at(-1).trim()))) sentences.pop();
      sentences.push(provenanceLine(booking, seg.source, seg.storyId));
      seg.text = sentences.join(' ');
      seg.link = slot;
      seg.linkKind = 'restage';
      const words = String(seg.quote.text).trim();
      const piece = {
        // a grave story's official is staged soberly (serious, still; the client keeps the music out)
        type: 'cross', part: 'piece', kind: 'restage', anchor: slot, reporter: booking.id, emotion: check.grave ? 'serious' : 'neutral', cues: [],
        ...(check.grave ? { grave: true } : {}),
        text: /[.!?…]["”’]?$/.test(words) ? words : `${words}.`,
        recreation: true,
        quoteRef: { outlet: seg.source || null, by: seg.quote.by },
        storyId: seg.storyId, headline: seg.headline, source: seg.source, category: seg.category, hasImage: seg.hasImage,
        backdrop: 'press', place: '', desk: booking.strap.role || booking.strap.name,
      };
      segs.splice(i + 1, 0, piece);
      i++;
      ctx.episode.correspondents = { ...(ctx.episode.correspondents || {}), [slot]: booking.id };
      ctx.episode.guests = { ...(ctx.episode.guests || {}), [booking.id]: booking };
      // the voice service casts the slot from the booking (a generic blend, never an imitation)
      ctx.presenters[slot] = { id: booking.id, name: booking.name || booking.role, voice: { gender: booking.presentation === 'woman' ? 'female' : 'male', lang: 'en-gb' }, cast: booking.voice };
      restaged.push(booking.id);
      this.audit?.({ at: new Date().toISOString(), program: ctx.program.id, storyId: seg.storyId, outlet: seg.source || null, link: story.link || null, guest: booking.id, name: booking.name, role: booking.role, words: piece.text });
    }
    return { restaged: restaged.length, ...(declined.length ? { declined: declined.length } : {}) };
  }

  /** IN PLAIN ENGLISH lines after the stories that use a glossary term (server/glossary.js). */
  terms(ctx) {
    const { segments, terms } = explainTerms(ctx.episode.segments, { program: ctx.program, presenters: ctx.presenters, recent: this.recentText() });
    ctx.episode.segments = segments;
    return { terms };
  }

  /** Keep the chat lines of an episode (sentence by sentence, plain text) in the station's memory of what aired. */
  rememberLines(episode, now = Date.now()) {
    const max = this.config.recentLines ?? 1000;
    const window = (this.config.recentLinesHours ?? 6) * 3600_000;
    for (const seg of episode?.segments || []) {
      if (seg.type !== 'chat' && seg.type !== 'quiz') continue;
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

  /** Remember the experts an episode put stories to (6 hours at most), and move the lines' turn on. */
  rememberExperts(episode, programId, now = Date.now()) {
    const pieces = (episode?.segments || []).filter((seg) => seg.type === 'cross' && seg.kind === 'expert' && seg.part === 'piece');
    for (const seg of pieces) this.recentExperts.push({ id: seg.reporter, programId, at: now });
    this.analysisTurn += pieces.length;
    const window = (this.config.recentLinesHours ?? 6) * 3600_000;
    while (this.recentExperts.length && (this.recentExperts.length > 64 || now - this.recentExperts[0].at > window)) this.recentExperts.shift();
  }

  /** Remember which stories were the number of the day or "And finally" (the last 16 episodes, at most 6 hours). */
  rememberFeatures(episode, now = Date.now()) {
    for (const seg of episode?.segments || []) if (seg.type === 'story' && (seg.feature === 'number' || seg.feature === 'lighter')) this.recentFeatures.push({ id: seg.storyId, at: now });
    const window = (this.config.recentLinesHours ?? 6) * 3600_000;
    while (this.recentFeatures.length && (this.recentFeatures.length > 32 || now - this.recentFeatures[0].at > window)) this.recentFeatures.shift();
  }

  async write(ctx) {
    const recent = this.recentText();
    const prompt = buildPrompt({ channelName: ctx.channelName, program: ctx.program, presenters: ctx.presenters, stories: ctx.candidates, recentLines: recent.slice(-24), experts: ctx.experts || [] });
    // `recent`: lines aired lately, for writers that pick from their own repertoire (the offline mock);
    // `featured`: stories that were a feature lately (the same "And finally" does not come round every rotation).
    const request = { stage: 'write', prompt, stories: ctx.candidates, channelName: ctx.channelName, program: ctx.program, presenters: ctx.presenters, count: ctx.program.stories, recent, featured: this.recentFeatures.map((x) => x.id), experts: ctx.experts || [], analysisTurn: this.analysisTurn };
    const { provider, value } = await this.chain.generate(request, this.normalizer(ctx, ctx.candidates));
    ctx.episode = value;
    ctx.provider = provider;
    const deeper = await this.deepen(ctx, request, provider);
    const own = await this.ownWords(ctx, 'write');
    this.castCorrespondents(ctx);
    return { provider, ...(deeper ? { depth: deeper.depth, air: Math.round(deeper.air), ...(deeper.fewer ? { fewer: deeper.fewer } : {}) } : {}), ...(own ? { own } : {}) };
  }

  /** The script as a writer gives it: links folded back into their stories, stage directions back in the text. */
  scriptOf(episode) {
    return {
      title: episode.title,
      // a correspondent link reads as its story's `cross`, as the writer gave it (the validator rebuilds the link)
      segments: collapseCrosses(episode.segments).map(({ source, category, hasImage, cues, ...seg }) => ({ ...seg, text: embedCues(seg.text, cues || []) })),
    };
  }

  /** Was this episode written by a writer that copies its sources (the offline fallback writer, which never reviews)? */
  offlineWriter(name) {
    const p = this.chain?.providers?.find?.((x) => x.name === name);
    return p ? p.reviews === false : name === 'mock';
  }

  /**
   * The channel's own words (server/ownwords.js; docs/publishing/verbatim.md): every story of an AI-written episode is
   * measured against its sources (the verbatim rule: no run over 12 words, at most 20 % copied, attributed quotations
   * exempt) and checked for the paraphrase traps (a hedge dropped, words given to another speaker, a rise told as a
   * fall). A story that fails goes back to the model, at most MAX_REWRITES times, with its copied passages and faults
   * named; a rewrite that gives a figure another value is refused. One still failing is cut to its compliant sentences, else
   * dropped from the episode: a copy never airs. Below the programme's floor the slot is skipped (ctx.skip). Every
   * rewrite, cut and drop is logged. The offline fallback writer is measured only (the publish gate holds it). Runs after
   * the writer and again after the standards editor (`phase`). -> the pipeline note, or null
   */
  async ownWords(ctx, phase) {
    if (!ctx.episode?.storyIds?.length) return null;
    const title = ctx.program.title;
    const storyOf = (id) => this.news.get(id) || ctx.candidates?.find((s) => s.id === id) || null;
    const ignore = [ctx.channelName, title, ...Object.values(ctx.presenters || {}).map((p) => p?.name), ...(ctx.correspondents || []).map((c) => c.name), ...(ctx.experts || []).map((e) => e.name)].filter(Boolean);
    const check = (episode, id) => storyCheck(episode, id, storySources(storyOf(id)), { ignore: [...ignore, storyOf(id)?.source].filter(Boolean) });
    const checkAll = (episode) => new Map(episode.storyIds.map((id) => [id, check(episode, id)]));
    const sum = (checks) => {
      let words = 0;
      let copied = 0;
      let longest = 0;
      let violating = 0;
      let faults = 0;
      for (const c of checks.values()) {
        words += c.report.words;
        copied += c.report.copied;
        longest = Math.max(longest, c.report.longest);
        violating += c.report.violations.length ? 1 : 0;
        faults += c.faults.length;
      }
      return { stories: checks.size, share: words ? Math.round((copied / words) * 1000) / 1000 : 0, longest, violating, faults };
    };
    let checks = checkAll(ctx.episode);
    if (this.offlineWriter(ctx.provider)) {
      // (the offline writer reads its sources out by design: never rewritten or cut here; the publish gate holds it)
      const s = sum(checks);
      if (s.violating) this.log.info?.(`[own words] ${title}: written offline (${ctx.provider}): ${s.violating} of ${s.stories} stories copy their sources (${Math.round(s.share * 100)} % of the words); never published (publish gate: offline-writer)`);
      return { offline: true, ...s };
    }
    const normalize = (script) => this.normalizer(ctx, ctx.candidates?.length ? ctx.candidates : ctx.episode.storyIds.map(storyOf).filter(Boolean))(JSON.stringify(script));
    const pct = (c) => `${Math.round(c.report.share * 100)} %`;
    const why = (c) => [...c.report.violations.map((v) => (v.rule === 'run' ? `a run of ${v.length} words copied` : `${Math.round(v.share * 100)} % copied`)), ...c.faults.map((f) => f.message)].join('; ');
    let script = this.scriptOf(ctx.episode);
    const note = { rounds: 0, rewritten: [], refused: 0, trimmed: [], dropped: [] };
    for (let round = 1; round <= MAX_REWRITES; round++) {
      const failing = [...checks].filter(([, c]) => c.failing).map(([id]) => id);
      if (!failing.length) break;
      note.rounds = round;
      const items = failing.map((id) => {
        const seg = script.segments.find((x) => x.type === 'story' && x.storyId === id);
        const c = checks.get(id);
        return { storyId: id, story: storyOf(id), current: currentLines(seg), copied: copiedPassages(c.report), faults: c.faults.map((f) => `"${f.sentence}" ${f.message}`) };
      });
      const request = { stage: 'rewrite', prompt: rewritePrompt({ channelName: ctx.channelName, program: ctx.program, items }), storyIds: failing, stories: failing.map(storyOf).filter(Boolean), channelName: ctx.channelName, program: ctx.program, presenters: ctx.presenters, round, phase };
      let reply;
      let provider;
      try {
        // (an unreadable reply is no reason to pause the provider: the editor still needs it for the review)
        ({ provider, value: reply } = await this.chain.generate(request, (text) => {
          try {
            return parseRewrite(text, failing);
          } catch (err) {
            return Object.assign(new Map(), { error: err.message });
          }
        }));
      } catch (err) {
        note.error = err.message;
        this.log.warn?.(`[own words] ${title}: no rewrite (${err.message})`);
        break;
      }
      if (!reply.size) {
        note.error = reply.error || 'empty rewrite';
        this.log.warn?.(`[own words] ${title}: the rewrite reply holds none of the stories (${note.error})`);
        continue;
      }
      for (const [id, fields] of reply) {
        const before = checks.get(id);
        const refuse = (reason) => {
          note.refused++;
          this.log.warn?.(`[own words] ${title}: rewrite of story ${id} refused (round ${round}): ${reason}`);
        };
        const candidate = mergeRewrite(script, id, fields);
        let episode = null;
        try {
          episode = normalize(candidate);
        } catch {
          /* refused below */
        }
        if (!episode?.storyIds?.includes(id)) {
          refuse('the story did not survive the checks');
          continue;
        }
        const changed = rewriteFaults(airedText(ctx.episode, id), airedText(episode, id));
        if (changed.length) {
          refuse(changed.join('; '));
          continue;
        }
        const after = check(episode, id);
        if (after.faults.length > before.faults.length) {
          refuse(after.faults.map((f) => f.message).join('; '));
          continue;
        }
        if (after.failing && checkScore(after) >= checkScore(before)) {
          refuse(`no better (${why(after)})`);
          continue;
        }
        script = candidate;
        ctx.episode = episode;
        checks = checkAll(episode);
        if (!note.rewritten.includes(id)) note.rewritten.push(id);
        this.log.info?.(`[own words] ${title}: story ${id} rewritten (round ${round}, ${provider}): copied ${pct(before)} -> ${pct(after)}, longest run ${before.report.longest} -> ${after.report.longest}${after.failing ? `; still ${why(after)}` : ''}`);
      }
    }
    // Still failing: the shorter compliant version, else out of the episode. (Checked again once the whole script is
    // normalised: dropping a story re-cuts the intro and the chats.)
    for (let pass = 0; pass < 3; pass++) {
      const failing = [...checks].filter(([, c]) => c.failing);
      if (!failing.length) break;
      for (const [id, c] of failing) {
        const trimmed = trimStory(script, id, storySources(storyOf(id)), c.faults.map((f) => f.sentence));
        let kept = false;
        if (trimmed) {
          try {
            const episode = normalize(trimmed);
            if (episode.storyIds.includes(id) && !check(episode, id).failing) {
              script = trimmed;
              kept = true;
              if (!note.trimmed.includes(id)) note.trimmed.push(id);
              this.log.warn?.(`[own words] ${title}: story ${id} cut to its own sentences (${why(c)})`);
            }
          } catch {
            /* not a version we air */
          }
        }
        if (!kept) {
          script = dropStory(script, id);
          note.dropped.push(id);
          this.log.warn?.(`[own words] ${title}: story ${id} dropped: ${why(c)}`);
        }
      }
      try {
        ctx.episode = normalize(script);
      } catch (err) {
        ctx.skip = `no story left in the channel's own words (${err.message})`;
        break;
      }
      checks = checkAll(ctx.episode);
    }
    if (!ctx.skip && [...checks.values()].some((c) => c.failing)) ctx.skip = 'a story still copies its source after the rewrites';
    // (a programme's floor counts only against what this check took out: a writer's own shorter choice is its own)
    const floor = Math.min(this.floorOf(ctx.program), ctx.episode.storyIds.length + note.dropped.length);
    if (!ctx.skip && note.dropped.length && ctx.episode.storyIds.length < floor) ctx.skip = `only ${ctx.episode.storyIds.length} stories left in the channel's own words (the floor is ${floor})`;
    if (note.dropped.length) ctx.dropped = [...new Set([...(ctx.dropped || []), ...note.dropped])];
    const out = { ...sum(checks), ...(note.rounds ? { rounds: note.rounds } : {}) };
    for (const k of ['rewritten', 'trimmed', 'dropped']) if (note[k].length) out[k] = note[k];
    if (note.refused) out.refused = note.refused;
    if (note.error) out.error = note.error;
    return out;
  }

  /**
   * The fallback writer has no running time of its own (an AI writer is asked for the programme's length in its prompt):
   * it tells as much of each story as the programme needs. While the episode runs short of the programme's
   * targetSeconds as it will air (server/airtime.js voicedAir: the open, every line at its voice's rate, the pauses, the
   * end card), it is written again one depth deeper, telling more of each story's dossier (server/providers/mock.js
   * `depth`; at the deepest, up to the programme's `moreStories` more stories), and the telling nearest the target range
   * is kept; the first that reaches the range stops the search, so a programme is never told longer than it needs. A
   * programme timed to the second (NEWS IN 60: the fit stage) is left alone. { depth, air } or null when nothing was
   * rewritten.
   */
  async deepen(ctx, request0, providerName) {
    let request = request0;
    const writer = this.chain.providers?.find((p) => p.name === providerName);
    const target = ctx.program.targetSeconds;
    if (!(writer?.depths > 0) || !Array.isArray(target) || ctx.program.timing) return null;
    const [lo, hi] = target;
    // (aimed a little inside the range, never on its floor: MONEY MINUTE once kept tellings of 241-247 s of its 240-360, a
    // slower clip or a line the validator drops away from running short; a quarter of the range up, at most 30 s)
    const aim = lo + Math.min(30, (hi - lo) / 4);
    const off = (air) => (air < aim ? aim - air : air > hi ? air - hi : 0);
    // (the episode as it will air: its programme's open and pauses, its cast's voices)
    const airOf = (episode) => voicedAir({ ...episode, program: { id: ctx.program.id }, cast: ctx.cast });
    const stories = Number(ctx.program.stories) || 0;
    // (more stories only when the rotation allows: the desk offered a full pool, twice the programme's stories and its
    // extra ones; a desk running short keeps them for the programmes after it, the offline slate of ~80 stories once
    // left NEWS IN 60 and TECH BYTES without theirs in the fourth rotation)
    // (and never on the offline demo slate, a closed set of stories that comes round again: the stories it would add are
    // the next programmes' own)
    const want = stories + (Number(ctx.program.moreStories) || 0);
    const stock = !this.news?.localOnly && (ctx.candidates?.length || 0) >= Math.ceil(want * 1.5);
    const moreOf = (depth) => (depth >= writer.depths && stock ? Number(ctx.program.moreStories) || 0 : 0);
    if (!stock && ctx.program.moreStories) request = { ...request, program: { ...request.program, moreStories: 0 } };
    // (on the offline slate the deeper telling keeps the desk's own choice of stories, too: looking further down for a
    // story with an article would take the pictured ones NEWS IN 60 comes round for)
    if (this.news?.localOnly) request = { ...request, closedSlate: true };
    const make = async (depth, count) => {
      const result = await writer.generate({ ...request, depth, ...(count ? { count } : {}) });
      // (the deepest telling may carry the programme's `moreStories` more)
      const cap = stories + moreOf(depth);
      return this.normalizer(cap !== stories ? { ...ctx, program: { ...ctx.program, stories: cap } } : ctx, ctx.candidates)(result.text);
    };
    let best = { depth: 0, episode: ctx.episode, air: airOf(ctx.episode) };
    if (best.air >= aim && best.air <= hi) return null;
    // (the telling that first went past the top, kept even when a shorter one is nearer the range: told with fewer stories
    // it may land inside it; WORLD NOW once stayed at 434 s, depth 2, its depth 3 at 760 s never tried shorter, 12 Oct)
    let over = null;
    if (best.air < aim) {
      for (let depth = 1; depth <= writer.depths; depth++) {
        let episode;
        try {
          episode = await make(depth);
        } catch {
          break;
        }
        const air = airOf(episode);
        if (air > hi && !over) over = { depth, episode, air };
        if (off(air) < off(best.air)) best = { depth, episode, air };
        if (air >= aim) break;
      }
    }
    // Past the top of the range (a telling one depth deeper went over it, or a full one at depth 0): the same telling with
    // one story fewer, then two, three, four, while it stays over the range; the nearest is kept. A programme never runs
    // long on our side either (never past its slot on the clock).
    const from = best.air > hi ? best : best.air < aim ? over : null;
    if (from) {
      const floor = Math.max(3, Number(ctx.program.minStories) || 0);
      // (up to six when the telling carries the programme's extra stories: it has that many more to lose)
      for (let drop = 1; drop <= (moreOf(from.depth) ? 6 : 4); drop++) {
        const count = stories - drop;
        if (count + moreOf(from.depth) < floor) break;
        let episode;
        try {
          episode = await make(from.depth, count);
        } catch {
          break;
        }
        const air = airOf(episode);
        if (off(air) < off(best.air)) best = { depth: from.depth, episode, air, fewer: drop };
        if (air <= hi) break;
      }
    }
    if (best.episode === ctx.episode) return null;
    ctx.episode = best.episode;
    return best;
  }

  /** Standards editor: checks the script against the sources. Never blocks the show. */
  async review(ctx) {
    const stories = ctx.episode.storyIds.map((id) => this.news.get(id)).filter(Boolean);
    const script = this.scriptOf(ctx.episode);
    const prompt = buildReviewPrompt({ channelName: ctx.channelName, program: ctx.program, script, stories });
    try {
      const { provider, value } = await this.chain.generate(
        { stage: 'review', prompt, script, stories, channelName: ctx.channelName, program: ctx.program, presenters: ctx.presenters },
        this.normalizer(ctx, stories)
      );
      // The editor may drop a story it cannot stand behind, never add one.
      const before = ctx.episode;
      ctx.episode = value;
      // what the editor found and put right (the review's faults: stories taken out, sentences and graphics fields changed)
      const changes = editorChanges(before, value);
      // ...and the editor's corrections are in our own words too (a correction that pastes the source goes back once more)
      const own = await this.ownWords(ctx, 'review');
      this.castCorrespondents(ctx);
      return { provider, reviewed: true, ...(changes.stories || changes.dropped.length ? { changes } : {}), ...(own ? { own } : {}) };
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
    // (a programme of the channel's is timed as it will air, server/airtime.js: its open, every line at its voice's
    // measured rate, the pauses and the end card; NEWS IN 60 once ran 74 s against its 55 to 70 when only its words were
    // counted, at a rate faster than its voices, real news 12-16 Oct)
    const voiced = !!ctx.program.id && timing.voiced !== false;
    const estimate = voiced
      ? (segs) => voicedAir({ ...ctx.episode, segments: segs, program: { id: ctx.program.id }, cast: ctx.cast })
      : (segs) => 0.3 + segs.reduce((n, seg) => n + words(seg), 0) / (timing.wpm / 60) + (timing.gap ?? 0.7) * (segs.length - 1);
    const minStories = timing.minStories ?? 1;
    const accept = (voiced && Array.isArray(ctx.program.targetSeconds) && ctx.program.targetSeconds) || timing.accept || [timing.target * 0.9, timing.target * 1.1];
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
    // (still past the window at the fewest stories: one sentence less, the last of the longest item that has one to spare,
    // never an item's first sentence nor the one that credits its outlet, while that keeps the edition inside the window;
    // NEWS IN 60 ran up to 77 s in 5 of 56 replayed editions with five stories, its floor, round 4)
    let trimmed = 0;
    while (best.t > accept[1] && trimmed < 3) {
      const spare = best.segs
        .map((seg, k) => ({ seg, k, parts: String(seg.text || '').trim().split(SENTENCE_BREAK) }))
        // (and never the sentence that says a card's figure)
        .filter(({ seg, parts }) => seg.type === 'story' && parts.length >= 2 && !/\b(?:reports?|according to)\b/i.test(parts.at(-1)) && !/["“”]/.test(parts.at(-1)) && !((seg.fact || seg.numbers) && /\d/.test(parts.at(-1))))
        .sort((a, b) => String(b.seg.text).length - String(a.seg.text).length)[0];
      if (!spare) break;
      const cues = (spare.parts.at(-1).match(/(?:\s*\[[^\]]*\])+\s*$/) || [''])[0];
      const text = `${spare.parts.slice(0, -1).join(' ').trim()}${cues ? ` ${cues.trim()}` : ''}`;
      const segs2 = best.segs.map((seg, k) => (k === spare.k ? { ...seg, text, ...(Array.isArray(seg.cues) ? { cues: seg.cues.filter((c) => !(c.char > text.length)) } : {}) } : seg));
      const t2 = estimate(segs2);
      if (t2 < accept[0]) break;
      best = { segs: segs2, t: t2 };
      trimmed++;
    }
    const kept = new Set(best.segs.filter((seg) => seg.storyId).map((seg) => seg.storyId));
    const dropped = ctx.episode.storyIds.filter((id) => !kept.has(id)).length;
    ctx.episode.segments = best.segs;
    ctx.episode.rundown = ctx.episode.rundown.filter((r) => kept.has(r.storyId));
    ctx.episode.storyIds = ctx.episode.storyIds.filter((id) => kept.has(id));
    const intro = best.segs[0];
    if (intro?.teases) intro.teases = intro.teases.map((id) => (id && kept.has(id) ? id : null));
    return { estimate: Math.round(best.t * 10) / 10, dropped, ...(trimmed ? { trimmed } : {}), ...(voiced ? { voiced: true } : {}), ...(best.t < accept[0] ? { short: true } : {}) };
  }

  /** Pictures for the candidates: article pages, then other outlets' reports of the same event (within a budget). */
  async pictures(ctx) {
    const desk = this.pictureDesk;
    // the outlets' own photos are looked for only where they may still be shown: without the rights desk, or in a private
    // preview (PICTURE_RIGHTS=preview). By default they never air, so their article pages are not read for them.
    const outlets = typeof this.news.findPictures === 'function' && (!desk || this.pictureMode === 'preview');
    const found = outlets ? await this.news.findPictures(ctx.candidates, { budgetMs: this.config.pictureBudgetMs ?? 6000 }) : {};
    // the rights desk: each candidate carries a cleared picture (with its rights record) or none, before the writer
    // chooses (the writer knows which stories have a picture)
    const pictures = desk ? { ...found, cleared: await this.clearPictures(ctx.candidates) } : found;
    // the story dossier: the article text of the candidates the writer is most likely to make main stories (wave 3
    // §3.1: depth for programmes of 8-10 minutes, never padding)
    if (typeof this.news.readArticles !== 'function') return pictures;
    // (every candidate: a story the writer picks without its article is told from its headline alone, as TECH BYTES'
    // ninth and tenth stories once were, 4 Oct)
    const articles = await this.news.readArticles(ctx.candidates, { budgetMs: this.config.articleBudgetMs ?? 6000, max: this.config.articleMax ?? Math.max(8, ctx.candidates.length), concurrency: 6 });
    return { ...pictures, ...articles };
  }


  /**
   * The rights desk for these stories, within the picture budget; then, in the background, the rest of the news desk
   * a few stories at a time (decisions are kept, so the next episodes find theirs ready and Wikimedia is asked little).
   */
  async clearPictures(stories) {
    // ahead of air: the decisions that are ready (the rest go to the front of the queue, for the assets stage)
    if (this.pictureAhead) {
      this.pictureAhead.urgent(stories);
      return this.pictureDesk.assign(stories, { ready: true });
    }
    const stats = await this.pictureDesk.assign(stories, { budgetMs: this.config.pictureBudgetMs ?? 6000 });
    this.warmPictures();
    return stats;
  }

  // ---------------------------------------------------------------- the picture desk ahead of air

  /** The programmes the station makes next (produce: the rotation's next three and the clock's pins). */
  lookAhead(channel, ids) {
    if (!channel?.programs) return;
    this.lookAheadAt = { channel, ids: [...new Set((ids || []).filter((id) => channel.programs[id]))] };
    this.nextStories = null;
  }

  /** The news desk's own stories (never the operator's local feed: its pictures are its own). */
  liveStories() {
    return typeof this.news?.stories?.values === 'function' ? [...this.news.stories.values()].filter((s) => s && !s.local) : [];
  }

  /**
   * The picture desk's queue in the order things air: the next programmes' candidates (as select() would choose them
   * now), the stories new in the last three hours (the newest first), the rest of the news desk (the last in first),
   * then the week's archived stories without a cleared picture (PICTURE THIS), in small batches of their own.
   */
  pictureTiers() {
    const t = Date.now();
    const tiers = [
      { name: 'next', stories: () => this.upcomingStories() },
      { name: 'fresh', stories: () => this.liveStories().filter((s) => t - (s.published || 0) < 3 * 3600_000).sort((a, b) => (b.published || 0) - (a.published || 0)) },
      { name: 'pool', stories: () => this.liveStories().reverse() },
    ];
    if (this.archive?.entries && this.config?.pictures?.archiveAhead !== false) tiers.push({ name: 'archive', alone: true, batch: 4, stories: () => this.archivedWithoutPicture() });
    return tiers;
  }

  /** The candidates of the programmes the station makes next (kept half a minute: select() ranks the whole desk). */
  upcomingStories() {
    const at = this.lookAheadAt;
    if (!at) return [];
    if (this.nextStories && Date.now() - this.nextStories.at < 30_000) return this.nextStories.list;
    const list = [];
    for (const id of at.ids) {
      const program = { id, ...at.channel.programs[id] };
      if (['weather', 'weekly', 'quiz'].includes(program.kind)) continue;
      try {
        const upcoming = at.ids.filter((x) => x !== id).map((x) => at.channel.programs[x]).filter(Boolean);
        list.push(...this.select(program, { upcoming }).slice(0, Math.ceil((program.stories || 8) * 1.5)));
      } catch {
        /* a programme that cannot select now */
      }
    }
    this.nextStories = { at: Date.now(), list };
    return list;
  }

  /** The week's archived stories without a picture the channel may show (the latest telling of each), newest first. */
  archivedWithoutPicture() {
    if (this.archivedCache && Date.now() - this.archivedCache.at < 10 * 60_000) return this.archivedCache.list;
    const since = Date.now() - 7 * 86400_000;
    const latest = new Map();
    const shown = new Set();
    for (const e of this.archive.entries || []) {
      if (!e?.id || e.at < since) continue;
      if (e.image && ((e.imageRights?.cleared && e.imageRights.url === e.image) || /^file:/i.test(e.image))) shown.add(e.id);
      latest.set(e.id, e);
    }
    // (the stories PAY ATTENTION could ask about first: its PICTURE THIS needs a cleared picture of the latest telling)
    let quiz = new Set();
    try {
      quiz = new Set(quizEvents(this.archive, { pictures: this.pictureMode }).events.filter((ev) => !ev.image).map((ev) => ev.latest?.id));
    } catch {
      /* the order by time alone */
    }
    const list = [...latest.values()]
      .filter((e) => !shown.has(e.id) && !this.news?.stories?.has?.(e.id))
      .sort((a, b) => (quiz.has(b.id) ? 1 : 0) - (quiz.has(a.id) ? 1 : 0) || b.at - a.at)
      .map((e) => ({ id: e.id, title: e.title, summary: e.summary, source: e.source, category: e.category, link: e.link, grave: !!e.grave, published: e.at, archived: true }));
    this.archivedCache = { at: Date.now(), list };
    return list;
  }

  /**
   * A decision is ready for this story: on the news desk's own story it is applied at once (NEWS IN 60 picks the stories
   * that have a picture); a story that already aired without one has the cleared picture put on its archive entries
   * (SEVEN DAYS, PICTURE THIS).
   */
  pictureDecided(s, tier) {
    const desk = this.pictureDesk;
    if (!desk || !s) return;
    if (tier !== 'archive' && this.news?.stories?.get?.(s.id) === s) desk.apply(s);
    if (!this.archive?.amendPicture) return;
    const pick = desk.pickFor(s);
    if (!pick?.rights?.cleared) return;
    const n = this.archive.amendPicture(s.id, { image: pick.url, imageRights: compactRights(pick.rights), imageSubject: pick.subject?.kind ? { kind: pick.subject.kind, label: pick.subject.label || null } : null });
    if (n) this.archivedCache = null;
  }

  warmPictures() {
    if (this.pictureAhead || this.pictureWarm || typeof this.news?.stories?.values !== 'function') return;
    const pool = [...this.news.stories.values()].filter((s) => s && !s.local).slice(-300);
    const step = async (i) => {
      if (i >= pool.length) return;
      const batch = pool.slice(i, i + 12);
      await this.pictureDesk.decide(batch, { budgetMs: 60_000 });
      // (applied at once: the next selection sees which stories have a cleared picture, NEWS IN 60 picks by it)
      for (const s of batch) this.pictureDesk.apply(s);
      // (a pause after a rate limit: the rest waits for the next episode)
      if (!this.pictureDesk.wm?.paused) await step(i + 12);
    };
    this.pictureWarm = step(0)
      .catch(() => {})
      .finally(() => (this.pictureWarm = null));
  }

  async assets(ctx) {
    const stories = ctx.episode.storyIds.map((id) => this.news.get(id)).filter(Boolean);
    const desk = this.pictureDesk;
    const mode = this.pictureMode;
    if (!desk || mode === 'preview') {
      if (typeof this.news.findPictures === 'function') await this.news.findPictures(stories, { budgetMs: this.config.pictureBudgetMs ?? 6000 });
      else await Promise.all(stories.map((s) => this.news.resolveImage(s)));
    }
    // ahead of air: only the decisions that are ready; a batch in flight that holds one of these stories is waited for,
    // within the picture budget (never a request of its own here)
    let cleared = null;
    if (desk && this.pictureAhead) {
      this.pictureAhead.urgent(stories);
      await this.pictureAhead.settle(stories, { maxMs: this.config.pictureBudgetMs ?? 6000 });
      cleared = await desk.assign(stories, { ready: true });
    } else if (desk) cleared = await desk.assign(stories, { budgetMs: this.config.pictureBudgetMs ?? 6000 });
    // (one file a story: a story whose picture an earlier one shows takes its own next cleared picture, before the
    // downloads are checked)
    if (desk && typeof desk.spread === 'function') desk.spread(stories.filter((s) => !s.local));
    const verified = this.images ? await this.verifyPictures(stories) : null;
    // (each story keeps the picture it airs with, once it downloaded: a decision the queue makes again later never
    // changes it under the episode's credit)
    if (desk && typeof desk.pin === 'function') desk.pin(stories);
    // (an archived story is a fresh object at every look: the desk's kept decision is put on it each time)
    const story = (id) => {
      const s = this.news.get(id);
      if (desk && s && !s.local) desk.apply(s);
      return s;
    };
    const rightsOnAir = new Map();
    // Every picture on air carries its credit (`imageCredit`, and `imageCreditVia`: media:credit | jsonld |
    // site_name | outlet). Until the graphics draw "PHOTO: <credit>" from it, a picture that is not the
    // outlet's own (lent by another outlet, or an agency's) also shows its credit where the source is
    // already drawn (the strap plate, the montage card): "Bitport Herald / Photo: Pixelburg Post".
    // `outlet` always keeps the outlet's own name for renderers that draw the credit themselves.
    // a picture file -> the story that shows it in this episode
    const fileOwner = new Map();
    const apply = (item) => {
      const s = story(item.storyId);
      // with the rights desk, a picture airs only with a cleared rights record for that very picture (or, in a private
      // preview, an outlet's photo marked as not cleared)
      item.hasImage = desk ? airable(s, { mode }) : !!s?.image;
      // never one picture file under two stories of an episode (a public figure's portraits rotate: picturedesk.js
      // rotate; a story whose picture another story of the episode already shows has its board instead)
      if (desk && item.hasImage && s?.image) {
        const owner = fileOwner.get(s.image);
        if (owner && owner !== item.storyId) item.hasImage = false;
        else fileOwner.set(s.image, item.storyId);
      }
      const outlet = item.outlet || item.source || s?.source || '';
      if (outlet) item.outlet = outlet;
      for (const k of ['imageCredit', 'imageCreditVia', 'imageCreditLine', 'imageLabel', 'imageLicence', 'imageRights', 'imageFocus', 'imageFit', 'imageUncleared']) delete item[k];
      item.source = outlet;
      if (!item.hasImage) return;
      const rights = desk ? currentRights(s) : null;
      // the credit each licence asks for, drawn while the picture is on screen ("FILE · AUTHOR · CC BY-SA 4.0 · PIXELATED")
      const c = rights && rights.source !== 'outlet' ? { credit: rights.credit, via: 'rights' } : pictureCredit(s, this.images?.sources?.get?.(s.id)) || { credit: s.source, via: 'outlet' };
      item.imageCredit = c.credit;
      item.imageCreditVia = c.via;
      if (rights) {
        item.imageLabel = rights.label;
        item.imageLicence = rights.licence?.id || null;
        if (!rights.cleared) item.imageUncleared = true;
        // the record rides on the item too: the compliance desk's rights gate reads the desk's verdict from it
        item.imageRights = compactRights(rights);
        rightsOnAir.set(item.storyId, { storyId: item.storyId, ...item.imageRights });
      }
      if (Number.isFinite(s.imageFocus)) item.imageFocus = s.imageFocus;
      // (a person's portrait keeps the whole head on screen: pixelate.js portraitDraw)
      if (s.imageFit === 'portrait') item.imageFit = 'portrait';
      const line = creditLine(c.credit);
      if (line) item.imageCreditLine = line;
      // The stop-gap rides on the source only on segments and rundown items whose picture is shown; it never
      // runs past the plate (SOURCE_MAX), and a credit that cannot fit stays in imageCredit only.
      item.source = sourceWithCredit(outlet, c.credit);
    };
    for (const seg of ctx.episode.segments) {
      if (!seg.storyId) continue;
      apply(seg);
      // a correspondent link shows the pictures of its place (the director's own plan), not the story's beats
      if (seg.type !== 'cross') planVisuals(seg, { roundupPictures: ctx.program.pictures === 'every' });
    }
    for (const item of ctx.episode.rundown) apply(item);
    // the locator board's place: the place the headline names wins over the writer's ("Jamaica accepts first flight of
    // deportations from US" is Jamaica's story; "boat capsizes off Djibouti" is Djibouti's coast), see boardPlace
    for (const item of ctx.episode.rundown) {
      if (item.hasImage) continue;
      const s = story(item.storyId);
      const lead = s?.summary ? (String(s.summary).match(/[^.!?]+[.!?]+["”’)]*\s*/g) || [String(s.summary)]).slice(0, 2).join(' ').slice(0, 400) : '';
      const where = boardPlace(item.headline, item.location, lead);
      if (where) item.location = where;
      else delete item.location;
    }
    // a story with neither a picture nor a place shows the topic board (public/js/graphics/topicboard.js); under a grave
    // story without its glyph: the story's segment says it (its emotion) or its words do
    // and the board shows the story's own strongest element (public/js/boardspec.js): its key figure, a short quote, the
    // named actor as a wordmark (the picture desk names it), its topic in words with a line glyph, its key phrase
    for (const item of ctx.episode.rundown) {
      if (item.hasImage) continue;
      const st = ctx.episode.segments.find((x) => x.type === 'story' && x.storyId === item.storyId);
      if ((st && (st.emotion === 'serious' || st.emotion === 'sad')) || isGrave(`${item.headline || ''} ${st?.text || ''}`)) item.grave = true;
      delete item.board;
      if (item.location) continue;
      const s = story(item.storyId);
      const lead = s?.summary ? (String(s.summary).match(/[^.!?]+[.!?]+["”’)]*\s*/g) || [String(s.summary)]).slice(0, 2).join(' ').slice(0, 400) : '';
      const actor = desk && s && !s.local && typeof desk.boardActor === 'function' ? desk.boardActor(s) : null;
      item.board = boardSpec({ headline: item.headline, alt: s?.title || '', kicker: st?.kicker || item.kicker || null, numbers: st?.numbers || null, quote: st?.quote || null, grave: !!item.grave, actor, text: `${s?.title || ''} ${lead}` });
    }
    if (desk) {
      // what a description or a publisher needs: every picture on air with its full attribution, and whether all are
      // cleared (false only in a private preview: such an episode is never to be published)
      ctx.episode.pictureRights = [...rightsOnAir.values()];
      ctx.episode.picturesCleared = ctx.episode.pictureRights.every((r) => r.cleared);
      if (mode === 'preview') ctx.episode.picturePreview = true;
    }
    const borrowed = stories.filter((s) => s.image && s.imageFrom).length;
    // every picture on air has a rights record (server/compliance/credits.js reads the desk's own, server/rights.js):
    // RIGHTS_GATE=strict (required at launch) takes one without a cleared record off air, the story keeping its map or
    // card; 'report' counts them in the pipeline
    const rights = rightsGate(ctx.episode, { mode: this.config.rightsGate || process.env.RIGHTS_GATE || 'report', annotate: false });
    return {
      images: stories.filter((s) => s.image).length,
      ...(borrowed ? { borrowed } : {}),
      ...(verified || {}),
      ...(cleared ? { cleared: cleared.cleared, uncleared: stories.filter((s) => s.image && !currentRights(s)?.cleared).length } : {}),
      // (ahead of air: how many of the episode's stories had their decision ready when it was made)
      ...(desk && this.pictureAhead ? { decidedAhead: stories.filter((s) => !s.local && desk.ready(s)).length, decidable: stories.filter((s) => !s.local).length } : {}),
      ...(rights.missing ? { unlicensed: rights.missing, ...(rights.dropped ? { offAir: rights.dropped } : {}) } : {}),
    };
  }

  /**
   * Footage for the correspondent links: one clip of each linked story's place (never for a grave story),
   * attached to every segment of that link as `footage` { id, credit, duration, width, height, start }.
   * Within a budget: a link whose clip is not ready airs with its pictures (the client falls back).
   */
  async footage(ctx) {
    const { segments, rundown = [] } = ctx.episode;
    const links = new Map();
    for (const seg of segments) if (seg.type === 'cross' && !links.has(seg.storyId)) links.set(seg.storyId, seg);
    // the headline montage: a teased story with no picture of its own shows its place's footage instead of the
    // map (never a grave story: the same rule as a link's)
    const teased = new Set((segments.find((s) => s.type === 'intro')?.teases || []).filter(Boolean));
    const grave = (id) => {
      const st = segments.find((s) => s.type === 'story' && s.storyId === id);
      return !st || st.emotion === 'serious' || st.emotion === 'sad' || isGrave(st.text);
    };
    const montage = rundown.filter((r) => teased.has(r.storyId) && !r.hasImage && r.location?.place && !grave(r.storyId));
    // (a clip's rights record carries the credit its licence asks for, the modification said: footage is pixelated too)
    const asFootage = (clip) => ({ id: clip.id, credit: clip.rights?.credit || clip.credit, duration: clip.duration, width: clip.width, height: clip.height, start: clip.start, ...(clip.rights ? { rights: clip.rights } : {}) });
    let found = 0;
    let shown = 0;
    // the links first (the desk asks Commons one request at a time), then the montage
    const jobs = [
      ...[...links.values()].map(async (seg) => {
        const clip = await this.footageDesk.find(seg.location, { grave: !!seg.grave }).catch(() => null);
        if (!clip) return;
        found++;
        const footage = asFootage(clip);
        for (const s of segments) if (s.type === 'cross' && s.storyId === seg.storyId) s.footage = footage;
      }),
      ...montage.map(async (r) => {
        const clip = await this.footageDesk.find(r.location, { grave: false }).catch(() => null);
        if (!clip) return;
        shown++;
        r.footage = asFootage(clip);
      }),
    ];
    let timer;
    await Promise.race([Promise.all(jobs), new Promise((resolve) => (timer = setTimeout(resolve, this.config.footage?.budgetMs ?? 20000)))]);
    clearTimeout(timer);
    // the clips join the episode's list of pictures and their attributions (a description credits them too)
    if (Array.isArray(ctx.episode.pictureRights)) {
      const seen = new Set(ctx.episode.pictureRights.map((r) => r.url));
      for (const x of [...segments, ...rundown]) {
        const r = x.footage?.rights;
        if (r && !seen.has(r.url)) {
          seen.add(r.url);
          ctx.episode.pictureRights.push({ storyId: x.storyId, footage: true, ...r });
        }
      }
      ctx.episode.picturesCleared = ctx.episode.pictureRights.every((r) => r.cleared);
    }
    return { links: links.size, footage: found, montage: shown };
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
        // a cleared picture that would not download: the desk's next cleared picture of the story, or none
        const ours = this.pictureDesk ? currentRights(s) : null;
        if (ours && ours.source !== 'outlet') {
          this.pictureDesk.failed(s, entry.error);
          continue;
        }
        if (typeof this.news.pictureFailed !== 'function') {
          s.image = null;
          return;
        }
        this.news.pictureFailed(s, { reason: entry.error });
        // (a lender's photo the news desk put in its place never airs by default: the desk's decision goes back on)
        if (this.pictureDesk) this.pictureDesk.apply(s);
      }
    };
    const budget = this.config.pictureVerifyMs ?? 12000;
    let timer;
    await Promise.race([Promise.all(stories.filter((s) => s.image).map(check)), new Promise((resolve) => (timer = setTimeout(resolve, budget)))]);
    clearTimeout(timer);
    return { verified: stories.filter((s) => s.image).length, ...(dropped ? { dropped } : {}) };
  }
}

/** Words of a text, folded: lower case, no accents, no punctuation (to find a quote's sentence). */
function squashWords(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[“”"‘’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
