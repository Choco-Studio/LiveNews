import { buildPrompt, buildReviewPrompt, extractJson, normalizeBulletin } from './writer.js';
import { castOf } from './channel.js';
import { embedCues } from '../public/js/cues.js';

/**
 * Makes one episode of a programme through a pipeline of stages. Each stage
 * gets the shared production context and can improve it; new quality steps
 * (extra fact checks, better images, server-side voices...) slot in here.
 */
export class Producer {
  constructor({ config, newsDesk, chain, log = console }) {
    this.config = config;
    this.news = newsDesk;
    this.chain = chain;
    this.log = log;
    this.seq = 0;
    this.stages = [
      { name: 'write', run: (ctx) => this.write(ctx) },
      { name: 'review', run: (ctx) => this.review(ctx), enabled: () => this.config.reviewPass },
      { name: 'assets', run: (ctx) => this.assets(ctx) },
    ];
  }

  /** Stories this programme could cover right now. */
  select(program) {
    return this.news.candidates(this.config.candidatePool, { categories: program.categories });
  }

  canProduce(channel, programId) {
    const program = channel.programs[programId];
    return this.select(program).length >= Math.min(program.stories, this.config.minNewStories);
  }

  async produce(channel, programId) {
    const program = { id: programId, ...channel.programs[programId] };
    const cast = castOf(channel, programId);
    const presenters = Object.fromEntries(Object.entries(cast).map(([slot, id]) => [slot, { id, ...channel.presenters[id] }]));
    const candidates = this.select(program);
    if (candidates.length < Math.min(program.stories, this.config.minNewStories)) return null;

    const ctx = { channelName: channel.name, program, presenters, cast, candidates, episode: null, provider: null, pipeline: [] };
    const started = Date.now();
    try {
      for (const stage of this.stages) {
        if (stage.enabled && !stage.enabled()) continue;
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

  async assets(ctx) {
    const stories = ctx.episode.storyIds.map((id) => this.news.get(id)).filter(Boolean);
    await Promise.all(stories.map((s) => this.news.resolveImage(s)));
    const hasImage = (id) => !!this.news.get(id)?.image;
    for (const seg of ctx.episode.segments) if (seg.storyId) seg.hasImage = hasImage(seg.storyId);
    for (const item of ctx.episode.rundown) item.hasImage = hasImage(item.storyId);
    return { images: stories.filter((s) => s.image).length };
  }
}
