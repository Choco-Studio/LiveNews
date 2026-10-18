// How long the station's event loop was held (round 10 of the pictures desk: SEVEN DAYS's grouping held it 88-212 s,
// Wikimedia's answers timed out unread meanwhile). A timer that should fire every `everyMs`: how late it fires is how
// long the loop did not turn (`maxMs`), and the processor time the station's own thread spent meanwhile is how long its
// own work held it (`ownMaxMs`: on a machine shared with other work, the thread also waits for the processor, which
// lateness alone counts too). Read by the operator at /api/wikimedia (and /api/pictures/ahead).
//
//   new LoopWatch().start(); watch.status() -> { since, maxMs, maxAt, ownMaxMs, ownMaxAt, over100ms, over1s, p99Ms, meanMs }
import { monitorEventLoopDelay } from 'node:perf_hooks';

// the processor time of this thread alone, in ms (Node 22: process.threadCpuUsage), or null
const threadCpuMs = () => {
  try {
    const u = process.threadCpuUsage();
    return (u.user + u.system) / 1000;
  } catch {
    return null;
  }
};

export class LoopWatch {
  constructor({ everyMs = 50, now = () => Date.now(), clock = () => performance.now(), cpu = threadCpuMs, setTimer = setInterval, clearTimer = clearInterval } = {}) {
    this.everyMs = everyMs;
    this.now = now;
    this.clock = clock;
    this.cpu = cpu;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.reset();
  }

  reset() {
    this.since = this.now();
    this.max = { ms: 0, at: null };
    this.own = { ms: 0, at: null };
    this.over100 = 0;
    this.over1s = 0;
    this.worst = [];
    this.ticks = 0;
    this.last = this.clock();
    this.lastCpu = this.cpu?.() ?? null;
    this.histogram?.reset?.();
  }

  start() {
    if (this.timer) return this;
    try {
      this.histogram = monitorEventLoopDelay({ resolution: 20 });
      this.histogram.enable();
    } catch {
      this.histogram = null;
    }
    this.last = this.clock();
    this.timer = this.setTimer(() => this.tick(), this.everyMs);
    this.timer?.unref?.();
    return this;
  }

  /** One firing of the timer: how late it came. */
  tick() {
    const t = this.clock();
    const late = Math.max(0, t - this.last - this.everyMs);
    this.last = t;
    this.ticks++;
    if (late > this.max.ms) this.max = { ms: late, at: this.now() };
    const c = this.cpu?.() ?? null;
    let own = null;
    if (c !== null && this.lastCpu !== null) {
      own = Math.max(0, c - this.lastCpu);
      if (own > this.own.ms) this.own = { ms: own, at: this.now() };
    }
    this.lastCpu = c;
    if (late > 100) this.over100++;
    if (late > 1000) this.over1s++;
    // the five longest holds, with the station's own share of each and when (where to look in the log)
    if (late > 100 && (this.worst.length < 5 || late > this.worst.at(-1).ms)) {
      this.worst.push({ ms: Math.round(late), ownMs: own === null ? null : Math.round(own), at: new Date(this.now()).toISOString() });
      this.worst.sort((a, b) => b.ms - a.ms);
      this.worst.length = Math.min(5, this.worst.length);
    }
    return late;
  }

  stop() {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.histogram?.disable?.();
  }

  status() {
    const h = this.histogram;
    return {
      since: new Date(this.since).toISOString(),
      maxMs: Math.round(this.max.ms),
      maxAt: this.max.at ? new Date(this.max.at).toISOString() : null,
      ...(this.lastCpu !== null ? { ownMaxMs: Math.round(this.own.ms), ownMaxAt: this.own.at ? new Date(this.own.at).toISOString() : null } : {}),
      over100ms: this.over100,
      over1s: this.over1s,
      worst: this.worst,
      ...(h ? { p99Ms: Math.round(h.percentile(99) / 1e6), meanMs: Math.round((h.mean / 1e6) * 10) / 10 } : {}),
    };
  }
}
