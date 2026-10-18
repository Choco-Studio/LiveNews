// The picture desk ahead of air (docs/pictures/RIGHTS.md §4). Round 9: the live station aired 59 stories in an hour
// without one picture. The desk decided inside the producer's 6 s picture budget, Wikimedia answered a 429 and asked
// for a 51 s pause, and nothing was ever decided in time. So stories are decided as they come in, in the background,
// through the desk's one paced Wikimedia queue (server/wikimedia.js). Each decision is kept with its lifetime in
// data/pictures/answers.json and survives a restart. At production the producer only reads the decisions that are ready.
//
// The order is what is about to air: the stories the producer is making now (urgent), then the next programmes'
// candidates, then the stories new to the news desk (newest first), then the rest of the desk, and last the week's
// archived stories without a cleared picture (PAY ATTENTION's PICTURE THIS), in small batches of their own so an
// urgent story never waits behind more than one of them.
// A 429 pauses the Wikimedia queue for as long as Retry-After asks. This loop waits the pause out and then carries on
// where it stopped: nothing is asked during the pause, and nothing is asked twice (the desk keeps every answer).
//
//   new PictureAhead({ desk, tiers, watch, onDecided }).start()
//   ahead.urgent(stories)                  the episode in production: decided first
//   ahead.settle(stories, { maxMs })       waits (at most maxMs) for a batch in flight that holds any of them
//   ahead.step()                           one turn of the loop (tests): 'paused' | 'idle' | 'worked'
//   ahead.status()                         decided, requests a story, the wait of a fresh story, the queue by tier
const MIN = 60_000;

export class PictureAhead {
  /**
   * @param o.desk       the picture desk (server/picturedesk.js): decide, needs, ready, decisionOf; `desk.wm` its queue
   * @param o.tiers      () => [{ name, stories: () => [story], batch?, alone? }] in priority order (producer.pictureTiers)
   * @param o.watch      () => [story]: the news desk's stories, stamped when first seen (a fresh story's wait)
   * @param o.onDecided  (story, tier, decision): a decision made, or found ready, for this story object
   */
  constructor({ desk, tiers = () => [], watch = () => [], onDecided = null, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, log = console, batch = 8, budgetMs = 5 * MIN, idleMs = 20_000, gapMs = 250, retry = { minMs: MIN, maxMs: 30 * MIN }, reportMs = 15 * MIN, freshAfterMs = 2 * MIN, lean = true } = {}) {
    this.desk = desk;
    this.tiers = tiers;
    this.watch = watch;
    this.onDecided = onDecided;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.log = log;
    this.batch = batch;
    this.budgetMs = budgetMs;
    this.idleMs = idleMs;
    // a breath between two batches: a batch answered from what is kept asks nothing and would run straight into the
    // next, never letting the station's own work (its requests, its episodes) in
    this.gapMs = gapMs;
    this.retry = retry;
    this.reportMs = reportMs;
    this.freshAfterMs = freshAfterMs;
    this.lean = lean;
    this.running = false;
    this.urgentList = new Map(); // id -> [story, since]
    this.tries = new Map(); // id -> { n, at }: an undecided story is asked again after 1, 2, 4… minutes (30 at most)
    this.firstSeen = new Map(); // id -> when the news desk first had it
    this.readyAt = new Map(); // id -> when its decision was first ready
    this.applied = new WeakMap(); // story object -> the decision (its `at`) put on it
    this.current = null; // the batch in flight: { ids, done }
    this.startedAt = now();
    this.reportedAt = now();
    this.stats = { batches: 0, tried: 0, ready: 0, pictured: 0, requests: 0, limited: 0, pausedMs: 0, idleTurns: 0, byTier: {}, waits: [] };
    this.window = { batches: 0, tried: 0, ready: 0, pictured: 0, requests: 0, pausedMs: 0, arrived: 0 };
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this.startedAt = this.now();
    this.reportedAt = this.now();
    this.loop = this.run();
    return this;
  }

  stop() {
    this.running = false;
    this.wake();
  }

  /** The stories of the episode in production: first in the queue (a story already decided is left alone). */
  urgent(stories) {
    const t = this.now();
    let added = 0;
    for (const s of stories || []) {
      if (!s?.id || s.local || !this.desk.needs(s)) continue;
      if (!this.urgentList.has(s.id)) added++;
      this.urgentList.set(s.id, [s, this.urgentList.get(s.id)?.[1] ?? t]);
    }
    if (added) this.wake();
    return added;
  }

  /** Wait (at most maxMs) for the batch in flight when it holds any of these stories; never for anything else. */
  async settle(stories, { maxMs = 3000 } = {}) {
    const cur = this.current;
    if (!cur || !(stories || []).some((s) => s?.id && cur.ids.has(s.id))) return false;
    let timer;
    await Promise.race([cur.done, new Promise((r) => (timer = this.setTimer(r, maxMs)))]);
    this.clearTimer(timer);
    return true;
  }

  wake() {
    const w = this.wakeUp;
    this.wakeUp = null;
    w?.();
  }

  nap(ms, wakeable = true) {
    return new Promise((resolve) => {
      const timer = this.setTimer(() => {
        if (this.wakeUp === done) this.wakeUp = null;
        resolve();
      }, Math.max(0, ms));
      const done = () => {
        this.clearTimer(timer);
        resolve();
      };
      if (wakeable) this.wakeUp = done;
    });
  }

  async run() {
    while (this.running) {
      let turn;
      try {
        turn = await this.step();
      } catch (err) {
        this.log.warn?.(`[pictures] ahead: ${err.message}`);
        turn = { kind: 'idle' };
      }
      this.maybeReport();
      if (!this.running) break;
      // a 429's pause is waited out to the end (and a little over); nothing can be asked meanwhile, so no wake cuts it
      if (turn.kind === 'paused') await this.nap(turn.ms + 250, false);
      else if (turn.kind === 'idle') await this.nap(this.idleMs);
      else await this.nap(this.gapMs, false);
    }
  }

  /** One turn: wait out a pause, decide the next batch, or idle (the desk's answers written to disk then). */
  async step() {
    this.stamp();
    const pause = this.desk.wm?.resumeIn?.() || 0;
    if (pause > 0) {
      this.stats.pausedMs += pause;
      this.window.pausedMs += pause;
      return { kind: 'paused', ms: pause };
    }
    const job = this.next();
    if (!job) {
      this.stats.idleTurns++;
      this.desk.kept?.save?.({ force: true });
      return { kind: 'idle' };
    }
    await this.work(job);
    return { kind: 'worked', stories: job.stories.length, tiers: [...new Set(job.tiers.values())] };
  }

  /** The news desk's stories, stamped when first seen (how long a fresh story waits for its decision). */
  stamp() {
    let list = [];
    try {
      list = this.watch() || [];
    } catch {}
    const t = this.now();
    for (const s of list) {
      if (!s?.id || s.local || this.firstSeen.has(s.id)) continue;
      this.firstSeen.set(s.id, t);
      if (t > this.startedAt + this.freshAfterMs) this.window.arrived++;
      // a story decided before it came in (a restart: its decision was kept) waits for nothing
      if (this.desk.ready(s)) this.readyAt.set(s.id, t);
    }
    for (const m of [this.firstSeen, this.readyAt]) while (m.size > 8000) m.delete(m.keys().next().value);
  }

  /** A story's decision is ready: put on this story object once (the producer applies it, archives it…). */
  offer(s, tier) {
    const d = this.desk.decisionOf(s);
    if (!d || this.applied.get(s) === (d.at ?? 0)) return;
    this.applied.set(s, d.at ?? 0);
    if (!this.readyAt.has(s.id)) this.readyAt.set(s.id, this.now());
    try {
      this.onDecided?.(s, tier, d);
    } catch (err) {
      this.log.warn?.(`[pictures] ahead: ${err.message}`);
    }
  }

  /** The next batch: urgent stories, then each tier in order, up to `batch` stories ({ stories, tiers }), or null. */
  next() {
    const t = this.now();
    const due = (s, urgent) => {
      const tr = this.tries.get(s.id);
      if (!tr) return true;
      const wait = urgent ? this.retry.minMs : Math.min(this.retry.maxMs, this.retry.minMs * 2 ** Math.max(0, tr.n - 1));
      return t - tr.at >= wait;
    };
    // (Wikipedia asked for the last pause: once it is over, the stories that need nothing from Wikipedia go first, a
    // batch of their own, and the others wait for a batch with nothing else to do; a 429 is waited out either way)
    const wm = this.desk.wm || {};
    const wikiLimited = wm.limitedHost === 'en.wikipedia.org' && t - (wm.limitedAt || 0) < 10 * MIN && typeof this.desk.asksWikipedia === 'function';
    const held = [];
    let planned = 0; // (the exact titles of at most 64 new stories worked out a turn: the rest wait for the next)
    const seen = new Set();
    const stories = [];
    const tiers = new Map();
    const take = (list, name, size, urgent) => {
      for (const s of list) {
        if (stories.length >= size) return;
        if (!s?.id || s.local || seen.has(s.id)) continue;
        seen.add(s.id);
        if (!this.desk.needs(s)) {
          this.offer(s, name);
          continue;
        }
        if (this.desk.ready(s)) this.offer(s, name); // (a picture already, while a source is asked again)
        if (!due(s, urgent)) continue;
        if (wikiLimited) {
          const known = this.desk.titlesKnown?.(s);
          if (known === undefined && planned >= 64) continue;
          if (known === undefined) planned++;
          if (this.desk.asksWikipedia(s)) {
            if (held.length < this.batch) held.push([s, name]);
            continue;
          }
        }
        stories.push(s);
        tiers.set(s.id, name);
      }
    };
    for (const [id, [s, since]] of this.urgentList) {
      // (an urgent story decided since, or one the producer stopped waiting for long ago, leaves the front)
      if (!this.desk.needs(s) || t - since > 30 * MIN) {
        if (!this.desk.needs(s)) this.offer(s, 'urgent');
        this.urgentList.delete(id);
      }
    }
    take([...this.urgentList.values()].map(([s]) => s), 'urgent', this.batch, true);
    let list;
    try {
      list = this.tiers() || [];
    } catch {
      list = [];
    }
    for (const tier of list) {
      if (stories.length >= this.batch) break;
      // the archive's stories go in a small batch of their own (an urgent story waits behind one at most)
      if (tier.alone && stories.length) break;
      let found;
      try {
        found = tier.stories() || [];
      } catch {
        continue;
      }
      take(found, tier.name, tier.alone ? Math.min(this.batch, tier.batch || this.batch) : this.batch, false);
      if (tier.alone) break;
    }
    if (!stories.length) for (const [s, name] of held) {
      stories.push(s);
      tiers.set(s.id, name);
    }
    return stories.length ? { stories, tiers } : null;
  }

  async work({ stories, tiers }) {
    const wm = this.desk.wm || {};
    const r0 = wm.stats?.requests || 0;
    const l0 = wm.stats?.limited || 0;
    let done;
    this.current = { ids: new Set(stories.map((s) => s.id)), done: new Promise((r) => (done = r)) };
    try {
      await this.desk.decide(stories, { budgetMs: this.budgetMs, lean: this.lean });
    } catch (err) {
      this.log.warn?.(`[pictures] ahead: ${err.message}`);
    } finally {
      this.current = null;
      done();
    }
    const requests = (wm.stats?.requests || 0) - r0;
    const limited = (wm.stats?.limited || 0) - l0 > 0;
    const t = this.now();
    let ready = 0;
    let pictured = 0;
    for (const s of stories) {
      const tier = tiers.get(s.id);
      const by = (this.stats.byTier[tier] ||= { tried: 0, ready: 0, pictured: 0, requests: 0 });
      by.tried++;
      by.requests += requests / stories.length;
      const fresh = !this.readyAt.has(s.id);
      if (this.desk.ready(s)) {
        if (fresh) {
          ready++;
          by.ready++;
          if (this.desk.decisionOf(s)?.picks?.length) {
            pictured++;
            by.pictured++;
          }
          const seenAt = this.firstSeen.get(s.id);
          if (seenAt != null && seenAt > this.startedAt + this.freshAfterMs) {
            this.stats.waits.push({ at: t, ms: t - seenAt, tier });
            if (this.stats.waits.length > 5000) this.stats.waits.shift();
          }
        }
        this.offer(s, tier);
      }
      if (!this.desk.needs(s)) {
        this.tries.delete(s.id);
        this.urgentList.delete(s.id);
        continue;
      }
      // (a batch a 429 cut short is asked again as soon as the pause is over; one that failed otherwise, later and later)
      const tr = this.tries.get(s.id) || { n: 0, at: 0 };
      this.tries.set(s.id, limited ? { n: tr.n, at: t - this.retry.minMs } : { n: tr.n + 1, at: t });
    }
    while (this.tries.size > 8000) this.tries.delete(this.tries.keys().next().value);
    for (const k of ['batches', 'tried', 'ready', 'pictured', 'requests']) {
      const v = { batches: 1, tried: stories.length, ready, pictured, requests }[k];
      this.stats[k] += v;
      this.window[k] += v;
    }
    if (limited) this.stats.limited++;
  }

  /** Stories the queue would still decide, by tier (a story counted once, in its first tier). */
  waiting() {
    const out = { urgent: 0 };
    const seen = new Set();
    for (const [s] of this.urgentList.values()) {
      seen.add(s.id);
      if (this.desk.needs(s)) out.urgent++;
    }
    let list = [];
    try {
      list = this.tiers() || [];
    } catch {}
    for (const tier of list) {
      let n = 0;
      let found = [];
      try {
        found = tier.stories() || [];
      } catch {}
      for (const s of found) {
        if (!s?.id || s.local || seen.has(s.id)) continue;
        seen.add(s.id);
        if (this.desk.needs(s)) n++;
      }
      out[tier.name] = n;
    }
    return out;
  }

  status() {
    const ms = this.stats.waits.map((w) => w.ms).sort((a, b) => a - b);
    const q = (p) => (ms.length ? Math.round(ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] / 1000) : null);
    const hours = Math.max(1 / 60, (this.now() - this.startedAt) / 3600_000);
    return {
      running: this.running,
      since: new Date(this.startedAt).toISOString(),
      ...this.stats,
      waits: undefined,
      requestsPerStory: this.stats.tried ? +(this.stats.requests / this.stats.tried).toFixed(2) : null,
      requestsPerReady: this.stats.ready ? +(this.stats.requests / this.stats.ready).toFixed(2) : null,
      readyPerHour: Math.round(this.stats.ready / hours),
      freshWait: { n: ms.length, medianS: q(0.5), p90S: q(0.9), maxS: ms.length ? Math.round(ms.at(-1) / 1000) : null },
      waiting: this.waiting(),
      wikimedia: this.desk.wm?.stats ? { ...this.desk.wm.stats, ...(this.desk.wm.hosts ? { hosts: this.desk.wm.hosts } : {}) } : null,
    };
  }

  maybeReport() {
    const t = this.now();
    if (t - this.reportedAt < this.reportMs) return;
    const w = this.window;
    const mins = Math.round((t - this.reportedAt) / MIN);
    this.reportedAt = t;
    this.window = { batches: 0, tried: 0, ready: 0, pictured: 0, requests: 0, pausedMs: 0, arrived: 0 };
    const left = this.waiting();
    const st = this.status();
    this.log.info?.(
      `[pictures] ahead, last ${mins} min: ${w.ready} decided (${w.pictured} with a picture), ${w.arrived} new stories, ${w.requests} Wikimedia requests (${w.tried ? (w.requests / w.tried).toFixed(1) : '0'} a story tried), paused ${Math.round(w.pausedMs / 1000)} s; ` +
        `a fresh story waited ${st.freshWait.medianS ?? '-'} s (median), ${st.freshWait.p90S ?? '-'} s (90 %); still to decide: ${Object.entries(left).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    );
  }
}
