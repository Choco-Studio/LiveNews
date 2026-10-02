import { buildPrompt, buildReviewPrompt, extractJson, normalizeBulletin } from './writer.js';
import { castOf } from './channel.js';
import { embedCues } from '../public/js/cues.js';

/**
 * Makes one episode of a programme through a pipeline of stages. Each stage
 * gets the shared production context and can improve it; new quality steps
 * (extra fact checks, better images, server-side voices...) slot in here.
 */
export class Producer {
  constructor({ config, newsDesk, chain, voice = null, images = null, log = console }) {
    this.config = config;
    this.news = newsDesk;
    this.chain = chain;
    this.voice = voice; // server/voice VoiceService (neural voices), optional
    this.images = images; // server/images ImageCache: pictures are verified (and warmed) before air, optional
    this.log = log;
    this.seq = 0;
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
    const avoid = {};
    for (const next of upcoming) {
      const beat = next?.categories?.[0] || null;
      if (beat && beat !== program.categories?.[0] && program.categories?.includes(beat)) avoid[beat] = 0.5;
    }
    return this.news.candidates(this.config.candidatePool, { categories: program.categories, ...(Object.keys(avoid).length ? { avoid } : {}) });
  }

  canProduce(channel, programId) {
    const program = channel.programs[programId];
    return this.select(program).length >= Math.min(program.stories, this.config.minNewStories);
  }

  async produce(channel, programId, { upcoming = [] } = {}) {
    const program = { id: programId, ...channel.programs[programId] };
    const cast = castOf(channel, programId);
    const presenters = Object.fromEntries(Object.entries(cast).map(([slot, id]) => [slot, { id, ...channel.presenters[id] }]));
    const candidates = this.select(program, { upcoming: upcoming.map((id) => channel.programs[id]).filter(Boolean) });
    if (candidates.length < Math.min(program.stories, this.config.minNewStories)) return null;

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

    const used = new Set(ctx.episode.storyIds);
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

  normalizer(ctx, stories) {
    return (text) =>
      normalizeBulletin(extractJson(text), stories, {
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

  async write(ctx) {
    const prompt = buildPrompt({ channelName: ctx.channelName, program: ctx.program, presenters: ctx.presenters, stories: ctx.candidates });
    const { provider, value } = await this.chain.generate(
      { stage: 'write', prompt, stories: ctx.candidates, channelName: ctx.channelName, program: ctx.program, presenters: ctx.presenters, count: ctx.program.stories },
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
    return this.news.findPictures(ctx.candidates, { budgetMs: this.config.pictureBudgetMs ?? 6000 });
  }

  async assets(ctx) {
    const stories = ctx.episode.storyIds.map((id) => this.news.get(id)).filter(Boolean);
    if (typeof this.news.findPictures === 'function') await this.news.findPictures(stories, { budgetMs: this.config.pictureBudgetMs ?? 6000 });
    else await Promise.all(stories.map((s) => this.news.resolveImage(s)));
    const verified = this.images ? await this.verifyPictures(stories) : null;
    const story = (id) => this.news.get(id);
    const apply = (item) => {
      const s = story(item.storyId);
      item.hasImage = !!s?.image;
      if (s?.image && s.imageCredit) item.imageCredit = s.imageCredit;
      else delete item.imageCredit;
    };
    for (const seg of ctx.episode.segments) if (seg.storyId) apply(seg);
    for (const item of ctx.episode.rundown) apply(item);
    const borrowed = stories.filter((s) => s.image && s.imageCredit).length;
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
    const check = async (s) => {
      for (let attempt = 0; attempt < 3 && s.image; attempt++) {
        const entry = await this.images.get(s.id, s.images || [s.image]);
        if (!entry.error) return;
        dropped++;
        if (typeof this.news.pictureFailed !== 'function') {
          s.image = null;
          return;
        }
        this.news.pictureFailed(s);
      }
    };
    const budget = this.config.pictureVerifyMs ?? 12000;
    let timer;
    await Promise.race([Promise.all(stories.filter((s) => s.image).map(check)), new Promise((resolve) => (timer = setTimeout(resolve, budget)))]);
    clearTimeout(timer);
    return { verified: stories.filter((s) => s.image).length, ...(dropped ? { dropped } : {}) };
  }
}
