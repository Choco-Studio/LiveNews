// The v2 Stage as the Renderer sees it (owner: INTEGRATION stream). studio.js
// loads this module only when v2 is on (?v2=1 during the parallel wave) and
// calls, at the top of drawShot():
//   if (this.v2?.frame(this.ctx, t, scene)) return;   // true = the v2 studio shot is drawn
// frame() runs the Stage's bookkeeping on every frame (the cue clock must see
// every cut and every word, also during maps and pictures) and draws only the
// studio shots (STUDIO_SHOTS); everything else, and any frame the Stage could
// not draw, falls through to the old renderer. Degradation (runtime/watchdog.js):
//   - 3 Stage errors in 10 s drop the Stage; a fresh one is tried at an episode
//     boundary after 1, 2, 4, then 8 episodes;
//   - the perf watchdog lowers the detail level and finally falls back too, but a
//     perf fallback is never a cut in the middle of a programme: the Stage stays on
//     air at its lowest detail level and the old renderer takes over at the next
//     episode boundary or full-screen channel shot (end card, ident, ad, promo,
//     open, breaking card: SWAP_SHOTS), so the viewer never sees the presenters
//     and the set change between two studio frames (critic r2: a mid-chat swap read
//     as a fault). That episode is then aired whole by the old renderer before the
//     backoff counts (retry after 1, 2, 4, 8 more episodes).
// `?perf=1` logs p50/p95 of the v2 shot every 10 s.
import { Stage, STUDIO_SHOTS, episodeKey, warmSets } from './stage.js';
import { FallbackPolicy, PerfWatchdog, LEVEL_MAX } from './watchdog.js';

export { STUDIO_SHOTS };

const nowMs = () => performance.now();
// full-screen channel shots: the old renderer may take over under them (no presenter on screen)
export const SWAP_SHOTS = new Set(['open', 'endcard', 'ident', 'ad', 'promo', 'standby', 'start', 'breakingCard']);

export class StageHost {
  /**
   * @param opts { audio, channel?, perf?: bool (log p50/p95), makeStage?: (opts) => Stage-like (tests),
   *               now?: () => ms (tests), log?: (msg) => void }
   */
  constructor({ audio = null, channel = null, perf = false, makeStage = null, now = nowMs, log = null } = {}) {
    this.audio = audio;
    this.channel = channel;
    this.now = now;
    // degradation transitions are warnings (rare, and a capture should show them); perf reports are info
    this.log = log || ((m) => console.warn(`[v2] ${m}`));
    this.info = log || ((m) => console.info(`[v2] ${m}`));
    this.makeStage = makeStage || ((o) => new Stage(o));
    this.policy = new FallbackPolicy({ log: this.log });
    this.watch = new PerfWatchdog({ log: this.log, info: this.info, report: !!perf });
    // `?watchdog=0` (QA only: captures and soak runs on an overloaded machine): the watchdog
    // still measures and logs, but never lowers the detail or falls back; errors still do
    this.watchdog = !/[?&]watchdog=0(&|$)/.test(globalThis.location?.search || '');
    this.watch.decide = this.watchdog;
    this.key = null;
    this.stage = null;
    this.t = 0;
    this.pendingDrop = null; // a perf fallback waiting for a boundary (reason)
    this.skipKey = null; // the episode a perf drop happened in: leaving it does not count for the backoff
    this.start(0);
    // every programme's set baked ahead of air, one per idle slot (owner 21:05: never a frame without the set)
    if (!makeStage) warmSets(typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 2000 }) : (fn) => setTimeout(fn, 0));
    // dev handle for captures and sync checks (tools in $SP, the browser console): window.__v2.stats()
    if (typeof window !== 'undefined' && !makeStage) window.__v2 = this;
  }

  setChannel(channel) {
    this.channel = channel;
    this.stage?.setChannel?.(channel);
  }

  start(t) {
    try {
      this.stage = this.makeStage({ audio: this.audio, channel: this.channel });
      this.stage.onError = (te) => {
        if (this.policy.error(te)) this.drop('3 errors in 10 s');
      };
      this.watch.restart(t);
    } catch (err) {
      this.stage = null;
      this.log(`v2 stage could not start: ${err?.message || err}`);
      this.policy.drop('start failed');
    }
  }

  drop(reason) {
    this.stage = null;
    this.pendingDrop = null;
    this.policy.drop(reason);
  }

  /** One renderer frame. Returns true when the v2 studio shot was drawn. */
  frame(ctx, t, scene) {
    if (this.lastFrame !== undefined) this.watch.interval((t - this.lastFrame) * 1000, t); // ?perf=1 report + starved-page check
    this.lastFrame = t;
    this.t = t;
    const key = episodeKey(scene);
    if (key !== this.key) {
      const first = this.key === null;
      const left = this.key;
      this.key = key;
      if (this.pendingDrop && this.stage) this.perfDrop(null); // the new episode is aired whole by the old renderer
      else if (!first && left !== null && left === this.skipKey) this.skipKey = null; // not counted (see perfDrop)
      else if (!first && this.policy.episode() && !this.stage) this.start(t);
    }
    // a pending perf fallback swaps under a full-screen channel shot (never between two studio frames)
    if (this.pendingDrop && this.stage && SWAP_SHOTS.has(scene.shot)) this.perfDrop(key);
    const stage = this.stage;
    if (!stage) return false;
    const draw = STUDIO_SHOTS.has(scene.shot);
    const a = draw ? this.now() : 0;
    const ok = stage.frame(ctx, t, scene, draw);
    if (!ok || this.stage !== stage) return false;
    if (!draw) return false;
    const verdict = this.watch.sample(t, this.now() - a);
    if (!this.watchdog) {
      this.watch.level = 0;
      return true;
    }
    if (verdict === 'fallback' && !this.pendingDrop) {
      // never mid-programme: the Stage stays on air at its lowest detail level until a boundary
      this.pendingDrop = 'the Stage itself over budget at the lowest detail level';
      this.log('v2 perf fallback pending: the old renderer takes over at the next episode boundary or channel shot');
    }
    stage.lod = this.pendingDrop ? Math.max(this.watch.level, LEVEL_MAX) : this.watch.level;
    return true;
  }

  /**
   * The pending perf fallback happens now, at a boundary. `skip`: the episode still on air (its end
   * card, a break after it, a breaking card inside it), partly aired by v2, so leaving it does not
   * count for the backoff; null at an episode boundary (the new episode is the old renderer's whole).
   */
  perfDrop(skip) {
    const reason = this.pendingDrop;
    this.skipKey = skip;
    this.drop(reason);
  }

  /** State for labs, tests and the debug panel. */
  stats() {
    const r = this.watch.percentiles(this.t, 10);
    return { active: !!this.stage, level: this.watch.level, p50: r.p50, p95: r.p95, frames: r.count, drops: this.policy.totalDrops, pending: !!this.pendingDrop, held: this.watch.held, clock: this.stage?.clock?.stats ?? null };
  }
}
