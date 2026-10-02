import { loadChannel, publicChannel } from './channel.js';

const BREAKING_RE = /\bbreaking\b|[-–—]\s*live\b|\blive updates?\b|última hora/i;

/**
 * Master control: keeps finished episodes ready ahead of air, follows the
 * programme rotation, and puts commercial breaks between programmes. Breaks
 * are elastic: while the next episode is still in production the break is
 * extended with more ads, so the channel never goes to a blank screen.
 */
export class Station {
  constructor({ config, newsDesk, producer, chain, channel = () => loadChannel(), log = console }) {
    this.config = config;
    this.news = newsDesk;
    this.producer = producer;
    this.chain = chain;
    this.channel = channel;
    this.log = log;
    this.queue = []; // finished episodes, in air order
    this.history = []; // what has aired (episodes and breaks)
    this.rotationIndex = 0;
    this.producing = null; // programme id currently in production
    this.extraBreaks = 0;
    this.lastError = null;
    this.listeners = new Set();
    this.seq = 0;
    this.announcedBreaking = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event, data) {
    for (const fn of this.listeners) fn(event, data);
  }

  ticker() {
    return [...this.news.stories.values()]
      .sort((a, b) => b.published - a.published)
      .slice(0, 18)
      .map((s) => ({ source: s.source, text: s.title }));
  }

  async refreshNews() {
    try {
      await this.news.refresh();
      this.emit('ticker', this.ticker());
      for (const s of this.news.uncovered()) {
        if (BREAKING_RE.test(s.title) && !this.announcedBreaking.has(s.id) && Date.now() - s.published < 3 * 3600_000) {
          this.announcedBreaking.add(s.id);
          this.emit('breaking', { source: s.source, text: s.title });
          break;
        }
      }
    } catch (err) {
      this.log.warn?.(`[news] refresh failed: ${err.message}`);
    }
  }

  /** Produce episodes until queueSize are ready, following the rotation. */
  async fill() {
    if (this.producing) return;
    const channel = this.channel();
    const rotation = channel.rotation;
    let misses = 0;
    while (this.queue.length < this.config.queueSize && misses < rotation.length) {
      const programId = rotation[this.rotationIndex % rotation.length];
      if (!this.producer.canProduce(channel, programId)) {
        // Not enough fresh news for this programme: skip its slot this time round.
        this.rotationIndex++;
        misses++;
        continue;
      }
      this.producing = programId;
      this.emit('status', this.status());
      try {
        const episode = await this.producer.produce(channel, programId);
        this.rotationIndex++;
        if (!episode) {
          misses++;
          continue;
        }
        misses = 0;
        this.lastError = null;
        this.queue.push(episode);
      } catch (err) {
        this.lastError = err.message;
        break; // the provider chain is paused; try again on the next tick
      } finally {
        this.producing = null;
        this.emit('status', this.status());
      }
    }
  }

  programMeta(channel, programId) {
    const p = channel.programs[programId];
    return p ? { id: programId, title: p.title, tagline: p.tagline, theme: p.theme, presenters: p.presenters } : null;
  }

  /** What comes after the current break, as far as we know. */
  upNext(channel) {
    if (this.queue.length) return { ...this.programMeta(channel, this.queue[0].program.id), ready: true };
    const id = this.producing || channel.rotation[this.rotationIndex % channel.rotation.length];
    return { ...this.programMeta(channel, id), ready: false };
  }

  schedule() {
    const channel = this.channel();
    const upcoming = this.queue.map((e) => ({ ...this.programMeta(channel, e.program.id), ready: true }));
    for (let i = 0; upcoming.length < 4 && i < channel.rotation.length; i++) {
      const id = channel.rotation[(this.rotationIndex + i) % channel.rotation.length];
      upcoming.push({ ...this.programMeta(channel, id), ready: false });
    }
    const current = this.history.at(-1);
    return {
      now: current ? (current.kind === 'episode' ? { kind: 'episode', ...current.program } : { kind: 'break' }) : null,
      upcoming,
    };
  }

  breakItem(channel, { filler = false } = {}) {
    const { adsPerBreak = 2 } = channel.breaks || {};
    return {
      kind: 'break',
      id: `k${Date.now().toString(36)}${(this.seq++).toString(36)}`,
      filler,
      ads: filler ? 1 : adsPerBreak,
      next: this.upNext(channel),
    };
  }

  /** Decide the next item on air. Returns null only when there is nothing at all to show. */
  advance() {
    const channel = this.channel();
    const last = this.history.at(-1);
    if (last?.kind === 'episode') return this.breakItem(channel);

    if (this.queue.length) {
      this.extraBreaks = 0;
      const episode = this.queue.shift();
      this.fill().catch(() => {});
      return episode;
    }
    const { maxExtraAds = 6 } = channel.breaks || {};
    const lastEpisode = [...this.history].reverse().find((h) => h.kind === 'episode');
    if (!lastEpisode) {
      // Nothing has aired yet: run ads while the first episode is produced.
      return this.producing ? this.breakItem(channel, { filler: true }) : null;
    }
    if (this.extraBreaks < maxExtraAds) {
      this.extraBreaks++;
      return this.breakItem(channel, { filler: true });
    }
    // Production is stuck or there is no fresh news: rerun the latest episode.
    this.extraBreaks = 0;
    return { ...lastEpisode, id: `r${Date.now().toString(36)}${(this.seq++).toString(36)}`, replay: true };
  }

  /**
   * Next item after `afterId`. Clients that are behind follow the same
   * sequence from history; otherwise the channel advances.
   */
  next(afterId) {
    const idx = this.history.findIndex((h) => h.id === afterId);
    if (idx >= 0 && idx < this.history.length - 1) return this.history[idx + 1];
    const item = this.advance();
    if (!item) return null;
    this.history.push(item);
    if (this.history.length > 30) this.history.shift();
    this.emit('schedule', this.schedule());
    return item;
  }

  publicChannel() {
    return publicChannel(this.channel());
  }

  status() {
    return {
      queue: this.queue.map((e) => e.program.title),
      producing: this.producing ? this.channel().programs[this.producing]?.title : null,
      aired: this.history.length,
      lastError: this.lastError,
      stories: this.news.stories.size,
      uncovered: this.news.uncovered().length,
      feeds: this.news.feedStatus,
      lastRefresh: this.news.lastRefresh ? new Date(this.news.lastRefresh).toISOString() : null,
      providers: this.chain.status(),
    };
  }
}
