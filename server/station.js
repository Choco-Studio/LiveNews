import { loadChannel, publicChannel } from './channel.js';
import { isBreaking } from './news.js';
import { publicError } from './usage.js';

/** A feed's status as the public may see it: ok and item count, or a short reason (the detail is in the log). */
function publicFeedStatus(feeds) {
  const reason = (e) => {
    const m = String(e || '');
    if (/^HTTP \d{3}$/.test(m)) return m;
    if (/ENOENT|no such file/i.test(m)) return 'feed file not found';
    if (/timeout|timed out|abort/i.test(m)) return 'timeout';
    if (/ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket|refused/i.test(m)) return 'unreachable';
    if (/xml|parse|tag/i.test(m)) return 'not a feed';
    return publicError(m) === 'internal error' ? 'error' : publicError(m).slice(0, 60);
  };
  return Object.fromEntries(Object.entries(feeds || {}).map(([name, f]) => [name, f?.ok ? { ok: true, items: f.items } : { ok: false, error: reason(f?.error) }]));
}

/**
 * Expected air time of an episode in seconds: each segment's recorded voice, or its words at 2.75 a second (pace.js
 * estimateAir), a short pause between segments and the open and close. Rough, but it only decides whether a programme ran long enough to earn a full break.
 */
export function episodeAir(ep) {
  const segs = Array.isArray(ep?.segments) ? ep.segments : [];
  let t = 12; // open, sign-off and end card
  for (const seg of segs) {
    const d = Number(seg?.audio?.duration);
    t += Number.isFinite(d) && d > 0 ? d : String(seg?.text || '').split(/\s+/).filter(Boolean).length / 2.75;
  }
  return t + 0.6 * Math.max(0, segs.length - 1);
}

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
        if (isBreaking(s.title) && !this.announcedBreaking.has(s.id) && Date.now() - s.published < 3 * 3600_000) {
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
        // The next programmes in the rotation keep their own beat (COSMOS keeps the science).
        const upcoming = [1, 2, 3].map((k) => rotation[(this.rotationIndex + k) % rotation.length]).filter((id) => id !== programId);
        const episode = await this.producer.produce(channel, programId, { upcoming });
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

  /**
   * What comes after the current break, as far as we know: the next ready
   * episode, the one in production, else the next slot of the rotation that
   * can really be made (a slot short of news is skipped, so it is never
   * promised). Null when nothing can be made right now: no promise at all.
   */
  upNext(channel) {
    if (this.queue.length) return { ...this.programMeta(channel, this.queue[0].program.id), ready: true };
    if (this.producing) return { ...this.programMeta(channel, this.producing), ready: false };
    const rotation = channel.rotation;
    for (let k = 0; k < rotation.length; k++) {
      const id = rotation[(this.rotationIndex + k) % rotation.length];
      if (typeof this.producer.canProduce !== 'function' || this.producer.canProduce(channel, id)) return { ...this.programMeta(channel, id), ready: false };
    }
    return null;
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
    const { adsPerBreak = 2, minProgrammeBetween = 0 } = channel.breaks || {};
    // Break cadence (pace: CHANNEL.breaks.minProgrammeBetween): a programme that ends within that much programme air of
    // the last commercial break goes on with a LIGHT break: one spot and the UP NEXT promo (`light: true`; a director
    // that honours it may play the promo alone). NEWS IN 60 is no longer sandwiched between two full breaks.
    const light = !filler && minProgrammeBetween > 0 && this.airSinceBreak() < minProgrammeBetween;
    return {
      kind: 'break',
      id: `k${Date.now().toString(36)}${(this.seq++).toString(36)}`,
      filler,
      ads: filler || light ? 1 : adsPerBreak,
      ...(light ? { light: true } : {}),
      next: this.upNext(channel),
    };
  }

  /** Seconds of programme air since the last commercial break (a light break does not count as one). */
  airSinceBreak() {
    let air = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const h = this.history[i];
      if (h.kind === 'break') {
        if (!h.light) break;
        continue;
      }
      air += episodeAir(h);
    }
    return air;
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
      lastError: this.lastError ? publicError(this.lastError) : null,
      stories: this.news.stories.size,
      uncovered: this.news.uncovered().length,
      feeds: publicFeedStatus(this.news.feedStatus),
      lastRefresh: this.news.lastRefresh ? new Date(this.news.lastRefresh).toISOString() : null,
      providers: this.chain.status(),
    };
  }
}
