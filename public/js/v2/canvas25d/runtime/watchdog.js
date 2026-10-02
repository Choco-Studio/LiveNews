// Degradation rules for the v2 Stage (owner: INTEGRATION stream). The channel
// runs 24/7 inside OBS, often unattended: v2 must never freeze the picture and
// must step down gracefully. Two pure state machines, fed by runtime/host.js
// (clock injected, so tests can simulate hours in milliseconds):
//
//   FallbackPolicy   errors: 3 Stage errors within 10 s drop the Stage (the old
//                    renderer draws); at the next episode boundary a fresh Stage
//                    is tried, with a backoff of 1, 2, 4, then 8 episodes between
//                    retries (never downgraded for the whole session). A Stage that
//                    survives 4 episodes resets the backoff.
//   PerfWatchdog     frame cost of the v2 shot: p95 > 12 ms over 30 s steps the
//                    level of detail down (1: lag pose off, wall clocks at half
//                    rate; 2: time-driven wall content frozen, so the set comes from
//                    its cache); p95 > 16 ms at level 2 asks for the fallback;
//                    120 s under 8 ms at p95 recovers one level. ?perf=1 logs
//                    p50/p95 every 10 s (the watchdog always runs).
// Each transition is logged once, when it happens.

export const ERRORS_TO_DROP = 3;
export const ERROR_WINDOW = 10; // s
export const BACKOFF = [1, 2, 4, 8]; // episodes between retries
export const STEADY_EPISODES = 4; // episodes without a drop that reset the backoff

export class FallbackPolicy {
  constructor({ log = null } = {}) {
    this.log = log;
    this.errors = new Float64Array(ERRORS_TO_DROP).fill(-Infinity);
    this.ei = 0;
    this.active = true; // the Stage is drawing
    this.drops = 0; // drops since the last steady run
    this.totalDrops = 0;
    this.wait = 0; // episodes still to wait before the next retry
    this.since = 0; // episodes since the last (re)start
  }

  /** A Stage error at time t. Returns true when the Stage must be dropped now. */
  error(t) {
    if (!this.active) return false;
    this.errors[this.ei] = t;
    this.ei = (this.ei + 1) % ERRORS_TO_DROP;
    let n = 0;
    for (const e of this.errors) if (t - e <= ERROR_WINDOW) n++;
    return n >= ERRORS_TO_DROP;
  }

  /** The Stage is dropped (errors or performance). */
  drop(reason) {
    if (!this.active) return;
    this.active = false;
    this.wait = BACKOFF[Math.min(this.drops, BACKOFF.length - 1)];
    this.drops++;
    this.totalDrops++;
    this.errors.fill(-Infinity);
    this.log?.(`v2 stage dropped (${reason}); old renderer on air, retry in ${this.wait} episode${this.wait > 1 ? 's' : ''}`);
  }

  /** An episode boundary. Returns true when a fresh Stage should be tried now. */
  episode() {
    if (this.active) {
      if (++this.since >= STEADY_EPISODES && this.drops) {
        this.drops = 0;
        this.log?.('v2 stage steady: backoff reset');
      }
      return false;
    }
    if (--this.wait > 0) return false;
    this.active = true;
    this.since = 0;
    this.log?.('v2 stage retry: a fresh stage is on air');
    return true;
  }
}

// ---------------------------------------------------------------------------

export const LEVEL_MAX = 2;
const STEP_P95 = 12; // ms: step down a level
const FALL_P95 = 16; // ms at the lowest level: fall back
const OK_P95 = 8; // ms: recover a level
const STEP_WINDOW = 30; // s
const OK_WINDOW = 120; // s
const MIN_SAMPLES = 90; // frames a window needs before it decides
const N = 8192; // ring size: 120 s at 60 fps fits
const BINS = 400; // histogram: 0.1 ms bins up to 40 ms (+ overflow)

export class PerfWatchdog {
  constructor({ log = null, report = false } = {}) {
    this.log = log;
    this.report = report; // ?perf=1: p50/p95 every 10 s
    this.ts = new Float64Array(N);
    this.ms = new Float32Array(N);
    this.n = 0; // samples written (ring index = n % N)
    this.levelSince = -Infinity; // samples older than this belong to another level
    this.level = 0;
    this.nextEval = 0;
    this.nextReport = 0;
    this.hist = new Uint32Array(BINS + 1);
    this.last = { p50: 0, p95: 0, count: 0 };
  }

  /**
   * One v2 shot frame that took `ms` at time t (s). Returns 'fallback' when the
   * Stage should be dropped, else null. this.level is the detail level to use.
   */
  sample(t, ms) {
    const i = this.n % N;
    this.ts[i] = t;
    this.ms[i] = ms;
    this.n++;
    if (this.levelSince === -Infinity) this.levelSince = t;
    if (this.report && t >= this.nextReport) {
      if (this.nextReport) {
        const r = this.percentiles(t, 10);
        this.log?.(`v2 perf p50 ${r.p50.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms over ${r.count} frames (level ${this.level})`);
      }
      this.nextReport = t + 10;
    }
    if (t < this.nextEval) return null;
    this.nextEval = t + 1;
    if (t - this.levelSince >= STEP_WINDOW) {
      const r = this.percentiles(t, STEP_WINDOW);
      if (r.count >= MIN_SAMPLES) {
        if (this.level >= LEVEL_MAX && r.p95 > FALL_P95) {
          this.log?.(`v2 perf p95 ${r.p95.toFixed(1)} ms at the lowest level: fallback`);
          this.setLevel(0, t);
          return 'fallback';
        }
        if (this.level < LEVEL_MAX && r.p95 > STEP_P95) {
          this.setLevel(this.level + 1, t);
          this.log?.(`v2 perf p95 ${r.p95.toFixed(1)} ms over ${STEP_WINDOW} s: detail level ${this.level}`);
          return null;
        }
      }
    }
    if (this.level > 0 && t - this.levelSince >= OK_WINDOW) {
      const r = this.percentiles(t, OK_WINDOW);
      if (r.count >= MIN_SAMPLES && r.p95 < OK_P95) {
        this.setLevel(this.level - 1, t);
        this.log?.(`v2 perf p95 ${r.p95.toFixed(1)} ms over ${OK_WINDOW} s: detail level ${this.level}`);
      }
    }
    return null;
  }

  setLevel(level, t) {
    this.level = level;
    this.levelSince = t; // the next decision only looks at frames of this level
  }

  /** p50 / p95 (ms) of the samples in the last `win` s (only those at the current level). */
  percentiles(t, win) {
    const h = this.hist;
    h.fill(0);
    const from = Math.max(t - win, this.levelSince);
    const count = Math.min(this.n, N);
    let c = 0;
    for (let k = 1; k <= count; k++) {
      const i = (this.n - k) % N;
      if (this.ts[i] < from) break;
      const b = Math.min(BINS, Math.floor(this.ms[i] * 10));
      h[b]++;
      c++;
    }
    const out = this.last;
    out.count = c;
    out.p50 = rank(h, c * 0.5);
    out.p95 = rank(h, c * 0.95);
    return out;
  }

  /** Mark the start of a fresh Stage: forget older samples. */
  restart(t) {
    this.setLevel(0, t);
  }
}

function rank(h, r) {
  let acc = 0;
  for (let b = 0; b < h.length; b++) {
    acc += h[b];
    if (acc >= r && acc > 0) return (b + 0.5) / 10;
  }
  return 0;
}
