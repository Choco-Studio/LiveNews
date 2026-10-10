import { loadChannel, publicChannel } from './channel.js';
import { isBreaking, notNews } from './news.js';
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

/** Expected length of a break in seconds (its bumper, spots and promo, and the countdown clock's hold). */
export const breakAir = (b) => 20 + 30 * (Number(b?.ads) || 2) + (Number(b?.hold) || 0);

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The local time of `t` (ms) in `timeZone`: { hour, minute, second, day } (day 0 = Sunday). */
export function localTime(t, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(t));
    const get = (k) => parts.find((p) => p.type === k)?.value;
    return { hour: Number(get('hour') || 0) % 24, minute: Number(get('minute') || 0), second: Number(get('second') || 0), day: WEEKDAYS[get('weekday')] ?? 0 };
  } catch {
    const d = new Date(t);
    return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), day: d.getUTCDay() };
  }
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
    // the clock (channel `clock`, on with config.clock): the item on air and when it started, the pinned marks served
    this.clockOn = config?.clock === true;
    this.now = typeof config?.now === 'function' ? config.now : () => Date.now();
    this.onAir = null;
    this.pinsDone = new Set();
    this.airMade = {}; // programme id -> air of its recent episodes (s), for the clock's estimates
    this.pinOf = new WeakMap(); // a queued episode the clock placed -> its mark
    this.owed = []; // rotation programmes the clock passed to fit one before a mark: made next, in order
  }

  /**
   * Seconds until the episode produced now would go on air: what is left of the item on air, then each ready
   * episode with the break before it (light or full, as breakItem will decide) and the countdown before a
   * programme the clock placed. Estimates (episodeAir, breakAir), good to a few seconds when the episodes are made.
   */
  secondsToAir() {
    let breaks = {};
    try {
      breaks = this.channel().breaks || {};
    } catch {
      /* the defaults */
    }
    const { adsPerBreak = 2, minProgrammeBetween = 0 } = breaks;
    const on = this.onAir?.item;
    let since = this.airSinceBreak();
    if (on && on !== this.history.at(-1) && on.kind === 'episode') since += episodeAir(on); // handed over, not yet in the history
    let t = 0;
    if (on) t += Math.max(0, (on.kind === 'episode' ? episodeAir(on) : breakAir(on)) - (this.now() - this.onAir.since) / 1000);
    const brk = () => {
      const light = minProgrammeBetween > 0 && since < minProgrammeBetween;
      if (!light) since = 0;
      return breakAir({ ads: light ? 1 : adsPerBreak });
    };
    let needBreak = on?.kind === 'episode';
    for (const ep of this.queue) {
      if (needBreak) t += brk();
      // a programme the clock placed waits for its mark (up to the countdown's hold)
      const mark = this.pinOf.get(ep);
      if (mark) t += Math.max(0, Math.min(this.channelHold(), (mark - this.now()) / 1000 - t));
      const air = episodeAir(ep);
      t += air;
      since += air;
      needBreak = true;
    }
    return needBreak ? t + brk() : t;
  }

  /** Expected air of `programId` in seconds: its recent episodes (as made), else the middle of its targetSeconds. */
  airEstimate(channel, programId) {
    if (this.airMade[programId]) return this.airMade[programId];
    const t = channel.programs[programId]?.targetSeconds;
    return Array.isArray(t) ? (t[0] + t[1]) / 2 : 300;
  }

  /**
   * The channel's clock (config/channel.json `clock`; owner decision 1, a schedule by the hour): the next mark a
   * pinned programme (NEWS IN 60 at :00 and :30) has not had yet, unless the next airing is already more than `late`
   * seconds past it: { programId, mark (ms), gap (seconds from the next airing to the mark, negative past it) } or null.
   */
  markAhead(channel) {
    const c = this.clockOn ? channel.clock : null;
    if (!c?.pins?.length) return null;
    const at = Math.floor((this.now() + this.secondsToAir() * 1000) / 1000) * 1000; // whole seconds: the same mark every call
    for (const m of this.pinsDone) if (m < at - 3 * 3600_000) this.pinsDone.delete(m);
    const { minute, second } = localTime(at, c.timezone || 'UTC');
    const hourStart = at - (minute * 60 + second) * 1000;
    const late = (c.late ?? 600) * 1000;
    const marks = [];
    for (const h of [-1, 0, 1]) for (const pin of c.pins) marks.push({ programId: pin.program, mark: hourStart + h * 3600_000 + pin.minute * 60_000 });
    marks.sort((a, b) => a.mark - b.mark);
    const m = marks.find((x) => !this.pinsDone.has(x.mark) && at <= x.mark + late);
    return m ? { ...m, gap: (m.mark - at) / 1000 } : null;
  }

  /**
   * What the station makes next with the clock on: { programId, mark?, commit() } or null (nothing can be made).
   * - The pinned programme when the next airing reaches its mark within `hold` seconds (the break before it then
   *   holds on the countdown clock until the mark), or when making it now lands closer to the mark than the
   *   rotation's next programme, which would run over it.
   * - Else the rotation's next programme; when it would run over the mark, the first of the next three that fits
   *   before it goes first and the ones it passed are owed (made next, in order): the rotation is kept, only
   *   reordered around the marks.
   * Rotation slots the clock leaves out (the pinned programme, a daypart's skip) are passed; the same programme twice
   * running only when nothing else can be made. `commit()` books the choice once its episode is made.
   */
  clockChoice(channel) {
    const can = (id) => typeof this.producer.canProduce !== 'function' || this.producer.canProduce(channel, id);
    const rotation = channel.rotation;
    const L = rotation.length;
    const hold = this.channelHold();
    let ahead = this.markAhead(channel);
    if (ahead && !can(ahead.programId)) {
      this.pinsDone.add(ahead.mark); // short of news for the round-up: the rotation carries on
      ahead = this.markAhead(channel);
    }
    const cands = [];
    for (const repeat of [false, true]) {
      const ok = (id) => (repeat || id !== this.lastMade) && !cands.some((c) => c.id === id) && this.rotationAllows(channel, id) && can(id);
      for (const id of this.owed) if (ok(id)) cands.push({ id, owed: true });
      for (let k = 0; k < L; k++) {
        const id = rotation[(this.rotationIndex + k) % L];
        if (ok(id)) cands.push({ id, k });
      }
      if (cands.length) break;
    }
    const pin = (a) => ({ programId: a.programId, mark: a.mark, commit: () => this.pinsDone.add(a.mark) });
    const take = (i) => {
      const c = cands[i];
      return {
        programId: c.id,
        commit: () => {
          if (c.owed) {
            this.owed.splice(this.owed.indexOf(c.id), 1);
            return;
          }
          // a rotation slot moves the rotation past it: the slots it passed that could have been made are owed
          for (let k = 0; k < c.k; k++) {
            const id = rotation[(this.rotationIndex + k) % L];
            if (this.rotationAllows(channel, id) && can(id)) this.owed.push(id);
          }
          this.owed = this.owed.slice(-6);
          this.rotationIndex += c.k + 1;
        },
      };
    };
    if (!cands.length) return ahead ? pin(ahead) : null;
    if (!ahead) return take(0);
    if (ahead.gap <= hold) return pin(ahead);
    // plan up to three programmes before the mark (from the next five candidates, any order): the run that lands the
    // pinned programme in [mark - hold, mark] (the countdown covers the rest), else closest; each step a candidate
    // jumps ahead of the rotation costs 45 s, so the order only changes for a real gain. Re-planned at every choice.
    const { adsPerBreak = 2, minProgrammeBetween = 0 } = channel.breaks || {};
    const len = (id) => {
      const air = this.airEstimate(channel, id);
      return air + breakAir({ ads: air < minProgrammeBetween ? 1 : adsPerBreak }); // the programme and the break after it
    };
    const pool = cands.slice(0, 5);
    const lens = pool.map((c) => len(c.id));
    const reach = [...lens].sort((x, y) => y - x).slice(0, 3).reduce((sum, x) => sum + x, 0);
    if (ahead.gap - hold > reach) return take(0); // the mark is further than any run: the rotation as it comes
    const lo = ahead.gap - hold;
    let best = { score: lo, first: -1 }; // the pinned programme now: early by (gap - hold)
    const visit = (seq, T) => {
      if (seq.length) {
        const err = T < lo + 0.2 * hold ? lo + 0.2 * hold - T : T > ahead.gap - 0.3 * hold ? T - ahead.gap + 0.3 * hold : 0; // aim inside the hold: room both ways
        const score = err + 45 * seq.reduce((sum, i, j) => sum + Math.max(0, i - j), 0);
        if (score < best.score) best = { score, first: seq[0] };
      }
      if (seq.length < 3 && T < ahead.gap) for (let i = 0; i < pool.length; i++) if (!seq.includes(i)) visit([...seq, i], T + lens[i]);
    };
    visit([], 0);
    return best.first < 0 ? pin(ahead) : take(best.first);
  }

  /** The longest hold of the countdown clock before a pinned programme (s): channel `clock.hold`, 90 by default. */
  channelHold() {
    try {
      return this.clockOn ? (this.channel().clock?.hold ?? 90) : 0;
    } catch {
      return 0;
    }
  }

  /** May the rotation's `programId` be made for the next airing? Not a pinned one (the clock places it), nor one its daypart leaves out. */
  rotationAllows(channel, programId) {
    const c = this.clockOn ? channel.clock : null;
    if (!c) return true;
    if ((c.pins || []).some((p) => p.program === programId)) return false;
    const { hour, day } = localTime(this.now() + this.secondsToAir() * 1000, c.timezone || 'UTC');
    for (const d of c.dayparts || []) {
      const inside = d.from <= d.to ? hour >= d.from && hour < d.to : hour >= d.from || hour < d.to;
      if (inside && (!d.days || d.days.includes(day)) && (d.skip || []).includes(programId)) return false;
    }
    return true;
  }

  /** The programme the station would make next with the clock on (see clockChoice), or null. */
  nextToMake(channel) {
    return this.clockChoice(channel)?.programId || null;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event, data) {
    for (const fn of this.listeners) fn(event, data);
  }

  ticker() {
    // (the LATEST ticker shows news only: an advice column, a gallery or a shopping deal never scrolls under the
    // programme, "My brother-in-law convinced his parents to sign over their home...", 9 Oct)
    return [...this.news.stories.values()]
      .filter((s) => !notNews(s))
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
    const clocked = this.clockOn && !!channel.clock;
    while (this.queue.length < this.config.queueSize && misses < rotation.length) {
      let programId;
      let choice = null;
      if (clocked) {
        // the clock decides: a pinned programme on its mark, else the rotation (reordered around the marks)
        choice = this.clockChoice(channel);
        if (!choice) break;
        programId = choice.programId;
      } else {
        programId = rotation[this.rotationIndex % rotation.length];
        if (!this.producer.canProduce(channel, programId)) {
          // Not enough fresh news for this programme: skip its slot this time round.
          this.rotationIndex++;
          misses++;
          continue;
        }
      }
      this.producing = programId;
      this.emit('status', this.status());
      try {
        // The next programmes in the rotation keep their own beat (COSMOS keeps the science).
        const upcoming = [1, 2, 3].map((k) => rotation[(this.rotationIndex + k) % rotation.length]).filter((id) => id !== programId);
        const episode = await this.producer.produce(channel, programId, { upcoming });
        if (choice) choice.commit();
        else this.rotationIndex++;
        if (!episode) {
          misses++;
          continue;
        }
        misses = 0;
        this.lastError = null;
        this.lastMade = programId;
        const air = episodeAir(episode);
        this.airMade[programId] = this.airMade[programId] ? 0.5 * this.airMade[programId] + 0.5 * air : air;
        if (choice?.mark) this.pinOf.set(episode, choice.mark);
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
    if (this.clockOn && channel.clock) {
      const id = this.nextToMake(channel);
      return id ? { ...this.programMeta(channel, id), ready: false } : null;
    }
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
    // then, with the clock, what it makes next (a pinned programme on its mark, an owed slot), and the rotation slots
    // it leaves to the rotation
    const first = this.clockOn && channel.clock ? this.nextToMake(channel) : null;
    if (first && upcoming.length < 4) upcoming.push({ ...this.programMeta(channel, first), ready: false });
    for (let i = 0; upcoming.length < 4 && i < channel.rotation.length; i++) {
      const id = channel.rotation[(this.rotationIndex + i) % channel.rotation.length];
      if (id !== first && this.rotationAllows(channel, id)) upcoming.push({ ...this.programMeta(channel, id), ready: false });
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
    const ads = filler || light ? 1 : adsPerBreak;
    // the countdown clock: the programme after this break is the clock's (NEWS IN 60 at :00) and the break would end
    // before its mark, so the break holds on the clock until then (at most clock.hold seconds; `at` = the mark, ms)
    const mark = !filler && this.queue.length ? this.pinOf.get(this.queue[0]) : 0;
    const wait = mark ? Math.round((mark - this.now()) / 1000 - breakAir({ ads })) : 0;
    const hold = wait >= 5 ? Math.min(this.channelHold(), wait) : 0;
    return {
      kind: 'break',
      id: `k${Date.now().toString(36)}${(this.seq++).toString(36)}`,
      filler,
      ads,
      ...(light ? { light: true } : {}),
      ...(hold ? { hold, at: mark } : {}),
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
      this.onAir = { item: episode, since: this.now() }; // on air from now: the fill below counts it
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
    this.onAir = { item, since: this.now() };
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
