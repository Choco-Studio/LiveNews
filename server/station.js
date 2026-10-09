import { loadChannel, publicChannel } from './channel.js';
import { isBreaking } from './news.js';
import { publicError } from './usage.js';
import { loadSchedule, slotsFrom } from './clock.js';

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
  constructor({ config, newsDesk, producer, chain, channel = () => loadChannel(), schedule = undefined, log = console }) {
    this.config = config;
    this.news = newsDesk;
    this.producer = producer;
    this.chain = chain;
    this.channel = channel;
    this.log = log;
    this.queue = []; // finished episodes, in air order
    this.history = []; // what has aired (episodes and breaks)
    // ROTATION_START=<programme id>: the channel starts at that slot of the rotation (demos, recordings)
    this.rotationIndex = 0;
    try {
      const start = config?.rotationStart ? channel().rotation.indexOf(config.rotationStart) : -1;
      if (start > 0) this.rotationIndex = start;
    } catch {
      /* the default start */
    }
    this.producing = null; // programme id currently in production
    this.extraBreaks = 0;
    this.lastError = null;
    this.listeners = new Set();
    this.seq = 0;
    this.announcedBreaking = new Set();
    // a programme in parts being produced (WAVE3.md §1, channel.json `format.parts`): { id, programId, n (the next
    // part to make), total, used: story ids the block took, aired: their headlines }
    this.block = null;
    // the hourly clock (server/clock.js, config/schedule.json): programmes by the minute of the hour instead of the
    // rotation; CLOCK=off (config.clock false) or no schedule keeps the rotation
    this.clock = schedule !== undefined ? schedule : config?.clock ? loadSchedule() : null;
    this.lastSlotAt = 0; // the last slot the clock gave a programme to
    this.lastStartAt = 0; // when the item on air started
  }

  /** The next programme to make: the clock's next slot, or the rotation's. */
  nextChoice(channel) {
    if (!this.clock) return { programId: channel.rotation[this.rotationIndex % channel.rotation.length], slot: null };
    const slot = this.pickSlot();
    return slot ? { programId: slot.program, slot } : null;
  }

  /** The choice is used (made, or skipped for want of news): the rotation moves on, or the clock's slot is gone. */
  consume(choice) {
    if (choice.slot) this.lastSlotAt = choice.slot.at;
    else this.rotationIndex++;
  }

  /**
   * When the programme made next would go on air: the end of the item on air, then everything queued with a break
   * before each programme (parts run back to back), then the parts a block in production still has to make.
   */
  airCursor(channel = this.channel()) {
    const BREAK = 70; // a commercial break with its bumper, about
    const air = (item) => (item.kind === 'episode' ? episodeAir(item) : 8 + 35 * (item.ads || 1));
    let t = Date.now();
    const last = this.history.at(-1);
    if (last && this.lastStartAt) t = Math.max(t, this.lastStartAt + air(last) * 1000);
    for (const q of this.queue) t += (air(q) + (!q.part || q.part.n === 1 ? BREAK : 0)) * 1000;
    if (this.block) {
      const parts = channel.programs[this.block.programId]?.format?.parts || [];
      for (let k = this.block.n - 1; k < parts.length; k++) {
        const ts = parts[k].targetSeconds || [300, 300];
        t += ((ts[0] + ts[1]) / 2) * 1000;
      }
    }
    return t;
  }

  /** The clock's slot for the next programme: the first after the last one used that the channel can still reach. */
  pickSlot() {
    const cursor = this.airCursor();
    const from = Math.max(this.lastSlotAt + 1, cursor - this.clock.lateSkip * 1000);
    return slotsFrom(this.clock, from, 1)[0] || null;
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
    const maxMisses = this.clock ? 8 : rotation.length;
    while (this.queue.length < this.config.queueSize && misses < maxMisses) {
      // a programme in parts goes on until its last part, before the rotation (or the clock) moves on
      if (this.block) {
        const went = await this.producePart(channel);
        if (went === 'stop') break;
        continue;
      }
      const choice = this.nextChoice(channel);
      if (!choice || !channel.programs[choice.programId]) {
        if (choice) this.consume(choice);
        misses++;
        continue;
      }
      const programId = choice.programId;
      if (!this.producer.canProduce(channel, programId)) {
        // Not enough fresh news for this programme: skip its slot this time round.
        this.consume(choice);
        misses++;
        continue;
      }
      // a programme in parts: its block starts here (its parts are made one by one, each while the last one airs)
      if (this.config?.programmeParts !== false && channel.programs[programId]?.format?.parts?.length) {
        this.block = { id: `b${Date.now().toString(36)}${(this.seq++).toString(36)}`, programId, n: 1, total: channel.programs[programId].format.parts.length, used: new Set(), aired: [], slot: choice.slot };
        this.consume(choice);
        misses = 0;
        continue;
      }
      this.producing = programId;
      this.emit('status', this.status());
      try {
        // The next programmes in the rotation keep their own beat (COSMOS keeps the science).
        const upcoming = [1, 2, 3].map((k) => rotation[(this.rotationIndex + k) % rotation.length]).filter((id) => id !== programId);
        const episode = await this.producer.produce(channel, programId, { upcoming });
        this.consume(choice);
        if (!episode) {
          misses++;
          continue;
        }
        misses = 0;
        this.lastError = null;
        if (choice.slot) episode.slot = { at: new Date(choice.slot.at).toISOString(), fixed: !!choice.slot.fixed };
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

  /**
   * The next part of the programme in parts. It is the LAST part when the format has no more, or when the desk
   * could not fill the next one after this one takes its stories: the programme then signs off here, never on a
   * hand-over to a part that will not come. Returns 'stop' when the provider chain failed (try again next tick).
   */
  async producePart(channel) {
    const b = this.block;
    const program = channel.programs[b.programId];
    const parts = program?.format?.parts || [];
    const spec = parts[b.n - 1];
    if (!spec) {
      this.block = null;
      return 'done';
    }
    const breaks = program.format.breakAfter || [];
    const next = parts[b.n];
    let last = !next;
    if (next && typeof this.producer.stock === 'function') {
      const left = this.producer.stock({ id: b.programId, ...program, stories: next.stories }).filter((s) => !b.used.has(s.id)).length;
      last = left - (spec.stories || 0) < (next.minStories ?? Math.min(next.stories || 3, 3));
    }
    const part = { block: b.id, n: b.n, total: parts.length, last, afterBreak: breaks.includes(b.n - 1), breakNext: !last && breaks.includes(b.n), used: b.used, aired: b.aired };
    this.producing = b.programId;
    this.emit('status', this.status());
    try {
      const rotation = channel.rotation;
      const upcoming = [0, 1, 2].map((k) => rotation[(this.rotationIndex + k) % rotation.length]).filter((id) => id !== b.programId);
      const episode = await this.producer.produce(channel, b.programId, { upcoming, part });
      if (!episode) {
        // the desk ran dry before the planned last part: the part before it ended on a hand-over, so the programme
        // closes on its own sign-off (never a programme that stops mid-sentence)
        this.log.warn?.(`[station] ${program.title} part ${b.n} could not be made; the programme closes after part ${b.n - 1}`);
        this.block = null;
        if (b.n > 1 && typeof this.producer.closePart === 'function') this.queue.push(await this.producer.closePart(channel, b.programId, part));
        return 'done';
      }
      if (b.n === 1 && b.slot) episode.slot = { at: new Date(b.slot.at).toISOString(), fixed: !!b.slot.fixed };
      for (const id of episode.storyIds || []) b.used.add(id);
      for (const r of episode.rundown || []) if (r.headline) b.aired.push(r.headline);
      this.queue.push(episode);
      this.lastError = null;
      b.n++;
      if (last) this.block = null;
      return 'made';
    } catch (err) {
      this.lastError = err.message;
      return 'stop';
    } finally {
      this.producing = null;
      this.emit('status', this.status());
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
    for (const id of this.plannedIds(channel, 8)) {
      if (typeof this.producer.canProduce !== 'function' || this.producer.canProduce(channel, id)) return { ...this.programMeta(channel, id), ready: false };
    }
    return null;
  }

  /** The programmes planned next, after what is queued: the clock's next slots, or the rotation's next slots. */
  plannedIds(channel, n) {
    if (this.clock) return slotsFrom(this.clock, Math.max(this.lastSlotAt + 1, this.airCursor(channel) - this.clock.lateSkip * 1000), n).map((s) => s.program).filter((id) => channel.programs[id]);
    return Array.from({ length: Math.min(n, channel.rotation.length) }, (_, k) => channel.rotation[(this.rotationIndex + k) % channel.rotation.length]);
  }

  schedule() {
    const channel = this.channel();
    const upcoming = this.queue.filter((e) => !e.part || e.part.n === 1).map((e) => ({ ...this.programMeta(channel, e.program.id), ready: true }));
    for (const id of this.plannedIds(channel, 4)) {
      if (upcoming.length >= 4) break;
      upcoming.push({ ...this.programMeta(channel, id), ready: false });
    }
    const current = this.history.at(-1);
    return {
      now: current ? (current.kind === 'episode' ? { kind: 'episode', ...current.program } : { kind: 'break' }) : null,
      upcoming,
    };
  }

  breakItem(channel, { filler = false, early = false } = {}) {
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
      // a break the clock adds to land a fixed slot on time
      ...(early ? { early: true } : {}),
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
    if (last?.kind === 'episode') {
      // the parts of a programme run back to back: the next part straight after, the format's internal break where
      // it has one; a part still in production gets the elastic break below (never dead air)
      const nextPart = this.queue[0];
      if (last.part && !last.part.last && !last.part.breakAfter && nextPart?.part?.block === last.part.block) {
        this.queue.shift();
        this.fill().catch(() => {});
        return nextPart;
      }
      return this.breakItem(channel);
    }

    // the clock lands a fixed slot (NEWS IN 60 at :00 and :30) within its tolerance: early, a short break more
    const due = this.queue[0]?.slot;
    if (this.clock && due?.fixed && Date.now() < Date.parse(due.at) - this.clock.tolerance * 1000) return this.breakItem(channel, { filler: true, early: true });
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
    this.lastStartAt = Date.now();
    this.history.push(item);
    this.airedTotal = (this.airedTotal || 0) + 1; // the history keeps the last 30; this counts them all
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
      airedTotal: this.airedTotal || 0,
      lastError: this.lastError ? publicError(this.lastError) : null,
      stories: this.news.stories.size,
      uncovered: this.news.uncovered().length,
      feeds: publicFeedStatus(this.news.feedStatus),
      lastRefresh: this.news.lastRefresh ? new Date(this.news.lastRefresh).toISOString() : null,
      providers: this.chain.status(),
    };
  }
}
