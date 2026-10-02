// Lab driver for the canvas25d foundation lab (owner: INTEGRATION stream):
// picks a demo and renders exact instants for deterministic contact sheets.
//   window.__lab.render(t)                 draw the instant t (seconds)
//   window.__lab.set({ demo, presenter, gesture, k, s, seat, emotion })
//                                          static demo: seat +1 (left, A) | -1 (right, B),
//                                          default -1 for lola, +1 otherwise; emotion = a
//                                          cues.js EMOTIONS name held from t = 0
//   window.__lab.bench(frames)             average ms per frame for the current demo
import { C } from './pixbuf.js';
import { frame, drawActors, actor } from './scene.js';
import { DEMOS as SHOTS, RIG_TIMES, PROFILE } from './demos.js';
import { GESTURES } from './gestures/index.js';
import { PRESENTER_IDS } from './cast/index.js';

const state = { demo: 'rig', presenter: 'paco', gesture: 'sequence', s: 2.7, k: 4.0, seat: null, emotion: null };

function demoStatic(t) {
  frame.clear(C.ink);
  const side = state.seat === 1 || state.seat === -1 ? state.seat : state.presenter === 'lola' ? -1 : 1;
  const a = actor(state.presenter, { side, emotions: state.emotion ? [{ t0: 0, name: state.emotion }] : [] });
  drawActors(t, [{ actor: a, x: 192, y: 116, s: state.s }]);
}

const DEMOS = { ...SHOTS, static: demoStatic };

export function createLab(canvas) {
  const ctx = canvas.getContext('2d');
  const lab = {
    render(t = 0) {
      (DEMOS[state.demo] || demoStatic)(t, state);
      frame.present(ctx);
    },
    set(opts = {}) {
      Object.assign(state, opts);
      return { ...state };
    },
    bench(n = 240, t0 = 0, dt = 1 / 60) {
      const fn = DEMOS[state.demo] || demoStatic;
      for (let i = 0; i < 20; i++) fn(t0 + i * dt, state); // warm-up (JIT, caches)
      const a = performance.now();
      for (let i = 0; i < n; i++) {
        fn(t0 + i * dt, state);
        frame.present(ctx);
      }
      return (performance.now() - a) / n;
    },
    /** Average ms per section (background, desk, actors) over n frames. */
    profile(n = 120, t0 = 0, dt = 1 / 60) {
      const fn = DEMOS[state.demo] || demoStatic;
      for (let i = 0; i < 10; i++) fn(t0 + i * dt, state);
      Object.assign(PROFILE, { on: true, bg: 0, desk: 0, actors: 0, n: 0 });
      for (let i = 0; i < n; i++) fn(t0 + i * dt, state);
      PROFILE.on = false;
      const k = 1 / Math.max(1, PROFILE.n);
      return { bg: PROFILE.bg * k, desk: PROFILE.desk * k, actors: PROFILE.actors * k };
    },
    rigTimes: RIG_TIMES,
    state,
  };
  return lab;
}

export const DEMO_NAMES = Object.keys(DEMOS);
export const GESTURE_NAMES = Object.keys(GESTURES);
export { PRESENTER_IDS };
