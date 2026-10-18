// SEVEN DAYS's week, grouped without holding the station (round 10 of the pictures desk): the grouping runs in a thread
// of its own (server/weekworker.js) that keeps the airings it was sent and its kept answers from one edition to the
// next; the station's thread only sends the new airings, a few hundred at a time, and scores the groups that come back.
// The groups are the ones archive.week() gives (server/weekgroups.js runs in both). Should the thread fail, the week is
// grouped on the station's thread, in slices of 20 ms (archive.weekAsync).
//
//   new WeekGrouper({ archive, desk }).week({ days, now }) -> the week, as archive.week({ same: desk.sameStory })
//   grouper.status() -> { thread, lastMs, lastCalls, sent }; grouper.close()
import { Worker } from 'node:worker_threads';
import { NewsDesk } from './news.js';
import { scoreGroups } from './weekgroups.js';

const DAY = 86400_000;
const breathe = () => new Promise((resolve) => setImmediate(resolve));

export class WeekGrouper {
  /**
   * @param o.archive  the archive (its entries, in its order)
   * @param o.desk     the news desk whose sameStory says what one event is (the real NewsDesk: its sameStory is run in
   *                   the thread, with the desk's storm names; any other desk's sameStory runs here, in slices)
   */
  constructor({ archive, desk = null, log = console, thread = true, chunk = 250, timeoutMs = 10 * 60_000, workerUrl = new URL('./weekworker.js', import.meta.url) } = {}) {
    this.archive = archive;
    this.desk = desk;
    this.log = log;
    this.thread = !!thread && desk instanceof NewsDesk;
    this.chunk = chunk;
    this.timeoutMs = timeoutMs;
    this.workerUrl = workerUrl;
    this.worker = null;
    this.ords = new WeakMap(); // airing -> its ord (its place in the archive's order, as the thread knows it)
    this.byOrd = new Map(); // ord -> airing
    this.nextOrd = 0;
    this.seq = 0;
    this.pending = new Map(); // request id -> { resolve, reject, timer }
    this.memo = {}; // (the kept answers when the week is grouped here)
    this.memoKey = null;
    this.last = null;
  }

  storms() {
    try {
      return typeof this.desk?.stormNames === 'function' ? [...this.desk.stormNames()] : [];
    } catch {
      return [];
    }
  }

  /** The week ({ days, now }), from the thread, else on this thread in slices. */
  async week({ days = 7, now = this.archive.now() } = {}) {
    const since = now - days * DAY;
    const t0 = Date.now();
    if (this.thread) {
      try {
        const week = await this.inThread({ since, now });
        this.last = { ...this.last, where: 'thread', ms: Date.now() - t0 };
        return week;
      } catch (err) {
        this.thread = false;
        this.close();
        this.log.warn?.(`[weekly] the grouping thread failed (${err.message}): the week is grouped on the station's thread, in slices`);
      }
    }
    const same = typeof this.desk?.sameStory === 'function' ? (a, b) => {
      try {
        return this.desk.sameStory(a, b);
      } catch {
        return false;
      }
    } : null;
    const key = this.storms().sort().join('|');
    if (key !== this.memoKey) {
      this.memo = {};
      this.memoKey = key;
    }
    const week = await this.archive.weekAsync({ days, now, same, memo: this.memo });
    this.last = { where: 'slices', ms: Date.now() - t0, groups: week.length };
    return week;
  }

  start() {
    if (this.worker) return this.worker;
    const w = new Worker(this.workerUrl);
    w.unref();
    w.on('message', (m) => {
      const p = this.pending.get(m?.id);
      if (!p) return;
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.type === 'groups') p.resolve(m);
      else p.reject(new Error(m.message || 'the grouping thread failed'));
    });
    const fail = (err) => {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(err);
        this.pending.delete(id);
      }
      this.worker = null;
      // (a thread that died forgets what it was sent: everything is sent again to the next one)
      this.ords = new WeakMap();
      this.byOrd.clear();
    };
    w.on('error', fail);
    w.on('exit', (code) => fail(new Error(`the grouping thread stopped (${code})`)));
    this.worker = w;
    return w;
  }

  /** Send the airings the thread has not had (a few hundred at a time) and drop those it no longer needs. */
  async sync(since) {
    const fresh = [];
    for (const e of this.archive.entries) {
      if (this.ords.has(e)) continue;
      const ord = this.nextOrd++;
      this.ords.set(e, ord);
      this.byOrd.set(ord, e);
      // (what sameStory reads; the scoring is done here, from the airings themselves)
      fresh.push({ ord, id: e.id, at: e.at, category: e.category, source: e.source, title: e.title, summary: e.summary, ...(Array.isArray(e.kw) ? { kw: e.kw } : {}) });
    }
    for (let i = 0; i < fresh.length; i += this.chunk) {
      this.worker.postMessage({ type: 'add', entries: fresh.slice(i, i + this.chunk) });
      await breathe();
    }
    const before = since - DAY;
    let dropped = 0;
    for (const [ord, e] of this.byOrd) {
      if (e.at >= before) continue;
      this.byOrd.delete(ord);
      dropped++;
    }
    if (dropped) this.worker.postMessage({ type: 'drop', before });
  }

  async inThread({ since, now }) {
    this.start();
    await this.sync(since);
    const id = ++this.seq;
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`no answer in ${Math.round(this.timeoutMs / 1000)} s`));
      }, this.timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ type: 'group', id, since, now, storms: this.storms() });
    });
    this.last = { calls: reply.calls, threadMs: reply.ms, groups: reply.groups.length };
    await breathe();
    const raw = reply.groups.map((ords) => {
      const entries = ords.map((o) => this.byOrd.get(o));
      if (!entries.length || entries.some((e) => !e)) throw new Error('the thread answered for airings it was never sent');
      return { ids: new Set(entries.map((e) => e.id)), entries };
    });
    await breathe();
    return scoreGroups(raw);
  }

  status() {
    return { thread: this.thread, running: !!this.worker, sent: this.byOrd.size, last: this.last };
  }

  close() {
    const w = this.worker;
    this.worker = null;
    if (w) w.terminate().catch(() => {});
  }
}
