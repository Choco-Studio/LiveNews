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
//                    its cache); at level 2 the fallback is asked for only when the
//                    Stage ITSELF is too slow: p95 > 16 ms AND p50 > 8 ms AND the
//                    Stage's p50 is a real share (>= 35 %) of the page's frame
//                    interval. A p95 made of preemption or GC spikes (p50 3-4 ms on an
//                    overloaded box) or a page starved by something else (frame
//                    interval 90 ms whatever is drawn) is not fixed by the old
//                    renderer, so the Stage stays at level 2 (logged at most every
//                    120 s). 120 s under 8 ms at p95 recovers one level. ?perf=1 logs
//                    p50/p95 every 10 s (the watchdog always runs). The host
//                    (runtime/host.js) swaps on a 'fallback' verdict only at the next
//                    episode boundary or full-screen channel shot, never mid-sentence.
//                    Windows are measured in ON-AIR time of the v2 shot (a clock that
//                    only runs while studio frames are drawn; a gap between two
//                    samples counts at most GAP s): maps, cards, ads and opens never
//                    age a window, so a window always holds ~30 s of studio frames
//                    and the few costly first frames after a long cutaway (re-framing,
//                    cache misses) cannot dominate a nearly empty window. Seen in the
//                    offline channel: a wall-clock window over a 30 s map round-up
//                    held ~3 s of studio frames and stepped down on their first frames.
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
const FALL_P95 = 16; // ms at the lowest level: fall back...
const FALL_P50 = 8; // ms: ...only when the median frame is slow too (not preemption / GC spikes)...
const FALL_SHARE = 0.35; // ...and the Stage is this share of the page's frame interval (not a starved page)
const OK_P95 = 8; // ms: recover a level
const HOLD_LOG = 120; // s of on-air time between two 'staying on v2' lines
const STEP_WINDOW = 30; // s
const OK_WINDOW = 120; // s
const MIN_SAMPLES = 90; // frames a window needs before it decides
const GAP = 0.25; // s: the most one gap between two v2 frames adds to the on-air clock
const N = 8192; // ring size: 120 s at 60 fps fits
const BINS = 400; // histogram: 0.1 ms bins up to 40 ms (+ overflow)
const IV_BINS = 200; // frame interval histogram: 1 ms bins up to 200 ms (+ overflow)
const IV_N = 4096; // ring of renderer frame intervals (about 68 s at 60 fps): the starved-page check
const IV_WINDOW = 30; // s of renderer time the starved-page check looks at

export class PerfWatchdog {
  constructor({ log = null, info = log, report = false } = {}) {
    this.log = log;
    this.info = info;
    this.report = report; // ?perf=1: p50/p95 every 10 s
    this.decide = true; // false (?watchdog=0, QA captures on an overloaded machine): measure and report only
    this.ts = new Float64Array(N);
    this.ms = new Float32Array(N);
    this.n = 0; // samples written (ring index = n % N)
    this.levelSince = -Infinity; // samples older than this belong to another level
    this.goodSince = -Infinity; // since when the frames have stayed under OK_P95
    this.level = 0;
    this.nextEval = 0;
    this.nextReport = 0;
    this.hist = new Uint32Array(BINS + 1);
    this.last = { p50: 0, p95: 0, count: 0 };
    this.clock = 0; // on-air time of the v2 shot (s): the windows' time base
    this.lastT = null; // renderer time of the previous sample
    // the renderer's frame interval (every shot, graphics and overlays included): the ?perf=1 report
    // shows total-frame overload the Stage's own time cannot see, and the fallback decision reads its
    // median (a page starved by something else is not helped by the old renderer)
    this.ivHist = new Uint32Array(IV_BINS + 1);
    this.ivCount = 0;
    this.ivT = new Float64Array(IV_N);
    this.ivMs = new Float32Array(IV_N);
    this.ivN = 0;
    this.ivWin = new Uint32Array(IV_BINS + 1);
    this.nextHoldLog = 0;
    this.held = 0; // fallbacks the Stage-cost rule declined (stats, tests)
  }

  /** Renderer frame interval (ms) at renderer time `wall` (s): the starved-page check, and the ?perf=1 report. */
  interval(ms, wall = NaN) {
    if (!(ms >= 0)) return;
    const i = this.ivN % IV_N;
    this.ivT[i] = wall;
    this.ivMs[i] = ms;
    this.ivN++;
    if (!this.report) return;
    this.ivHist[Math.min(IV_BINS, Math.floor(ms))]++;
    this.ivCount++;
  }

  /** Median renderer frame interval (ms) over the last IV_WINDOW s up to `wall`; 0 when unknown. */
  intervalP50(wall) {
    const h = this.ivWin;
    h.fill(0);
    const count = Math.min(this.ivN, IV_N);
    let c = 0;
    for (let k = 1; k <= count; k++) {
      const i = (this.ivN - k) % IV_N;
      if (!(this.ivT[i] >= wall - IV_WINDOW)) break;
      h[Math.min(IV_BINS, Math.floor(this.ivMs[i]))]++;
      c++;
    }
    return c >= MIN_SAMPLES / 3 ? rank(h, c * 0.5) * 10 : 0;
  }

  /**
   * One v2 shot frame that took `ms` at renderer time `wall` (s). Returns 'fallback'
   * when the Stage should be dropped, else null. this.level is the detail level to use.
   */
  sample(wall, ms) {
    // the on-air clock: real time between consecutive v2 frames, a cutaway counts at most GAP
    const dt = this.lastT === null ? 0 : wall - this.lastT;
    this.lastT = wall;
    if (dt > 0) this.clock += dt < GAP ? dt : GAP;
    const t = this.clock;
    const i = this.n % N;
    this.ts[i] = t;
    this.ms[i] = ms;
    this.n++;
    if (this.levelSince === -Infinity) this.levelSince = t;
    if (this.report && wall >= this.nextReport) {
      if (this.nextReport) {
        const r = this.percentiles(wall, 10);
        const iv = this.ivCount ? `; frame interval p95 ${Math.floor(rank(this.ivHist, this.ivCount * 0.95) * 10)} ms over ${this.ivCount} frames` : '';
        this.info?.(`v2 perf p50 ${r.p50.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms over the last ${r.count} studio frames (level ${this.level})${iv}`);
      }
      this.ivHist.fill(0);
      this.ivCount = 0;
      this.nextReport = wall + 10;
    }
    if (t < this.nextEval || !this.decide) return null;
    this.nextEval = t + 1;
    if (t - this.levelSince >= STEP_WINDOW) {
      const r = this.percentiles(t, STEP_WINDOW);
      if (r.count >= MIN_SAMPLES) {
        if (this.level >= LEVEL_MAX && r.p95 > FALL_P95) {
          // only a Stage that is slow itself is worth the old renderer: the median frame too, and a real
          // share of the page's frame time (critic r2: p50 3.7 ms, p95 pinned at 40 ms by preemption on a
          // box at load 70, frame interval 90 ms: the swap bought nothing and looked like a fault)
          const p50 = r.p50, p95 = r.p95;
          const iv = this.intervalP50(wall);
          this.levelSince = t; // the next decision looks at a fresh window (the level stays at its lowest)
          this.goodSince = t;
          if (p50 > FALL_P50 && !(iv > 0 && p50 < FALL_SHARE * iv)) {
            this.log?.(`v2 perf p95 ${p95.toFixed(1)} ms, p50 ${p50.toFixed(1)} ms at the lowest level: fallback`);
            return 'fallback';
          }
          this.held++;
          if (t >= this.nextHoldLog) {
            this.nextHoldLog = t + HOLD_LOG;
            this.log?.(`v2 perf p95 ${p95.toFixed(1)} ms at the lowest level, but p50 ${p50.toFixed(1)} ms${iv > 0 ? ` and the page's frame interval ${iv.toFixed(0)} ms` : ''}: spikes or a starved page the old renderer would not fix; staying on v2`);
          }
          return null;
        }
        if (this.level < LEVEL_MAX && r.p95 > STEP_P95) {
          this.setLevel(this.level + 1, t);
          this.log?.(`v2 perf p95 ${r.p95.toFixed(1)} ms over ${STEP_WINDOW} s: detail level ${this.level}`);
          return null;
        }
      }
    }
    // recovery: every evaluation for OK_WINDOW s found the last 10 s under OK_P95
    if (this.level > 0) {
      const r = this.percentiles(t, 10);
      if (r.count && r.p95 >= OK_P95) this.goodSince = t;
      if (t - this.goodSince >= OK_WINDOW && t - this.levelSince >= OK_WINDOW) {
        this.setLevel(this.level - 1, t);
        this.log?.(`v2 perf p95 under ${OK_P95} ms for ${OK_WINDOW} s: detail level ${this.level}`);
      }
    }
    return null;
  }

  setLevel(level, t) {
    this.level = level;
    this.levelSince = t; // the next decision only looks at frames of this level
    this.goodSince = t;
  }

  /**
   * p50 / p95 (ms) of the samples in the last `win` s of on-air v2 time (only those at the
   * current level). The first argument (renderer time) is kept for callers; the window always
   * ends at the latest sample.
   */
  percentiles(_t, win) {
    const h = this.hist;
    h.fill(0);
    const from = Math.max(this.clock - win, this.levelSince);
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
  restart() {
    this.setLevel(0, this.clock);
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
