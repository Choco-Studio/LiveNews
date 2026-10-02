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
//   - the perf watchdog lowers the detail level and finally falls back too.
// `?perf=1` logs p50/p95 of the v2 shot every 10 s.
import { Stage, STUDIO_SHOTS, episodeKey, warmSets } from './stage.js';
import { FallbackPolicy, PerfWatchdog } from './watchdog.js';

export { STUDIO_SHOTS };

const nowMs = () => performance.now();

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
    this.policy.drop(reason);
  }

  /** One renderer frame. Returns true when the v2 studio shot was drawn. */
  frame(ctx, t, scene) {
    this.t = t;
    const key = episodeKey(scene);
    if (key !== this.key) {
      const first = this.key === null;
      this.key = key;
      if (!first && this.policy.episode() && !this.stage) this.start(t);
    }
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
    if (verdict === 'fallback') {
      this.drop('p95 over 16 ms at the lowest detail level');
      return true; // this frame was drawn
    }
    stage.lod = this.watch.level;
    return true;
  }

  /** State for labs, tests and the debug panel. */
  stats() {
    const r = this.watch.percentiles(this.t, 10);
    return { active: !!this.stage, level: this.watch.level, p50: r.p50, p95: r.p95, frames: r.count, drops: this.policy.totalDrops, clock: this.stage?.clock?.stats ?? null };
  }
}
