// Behaviour planner (owner: FACES stream): eyelines and listener reactions,
// decided at runtime from the live episode data. This generalises the detail
// the owner loved in the prototype: "the girl in blue looks at him when he has
// spoken (not all the time, only at the start) - that is doing it right".
//
//   planBehaviour(ctx) → events
//     { kind: 'look', slot, target: 'partner' | 'notes' | 'wall' | 'camera', char, at, dur }
//     { kind: 'gesture', slot, name: 'nod', char, at, speed }   (listener nods)
//   ctx = direction/context.js segmentContext(); `at` = seconds from speech start
//
// STUB (architect): the prototype's rule only. At the start of a new turn the
// listener glances at the speaker ~0.25 s after the first word and holds it
// 2.6-3.8 s (seeded), never past the speech; on a hand-over the speaker
// glances at the partner over the last words. The FACES stream extends it:
// motivated nods on stressed content words (never on grave lines), glances
// down at the notes between stories, at the wall when its content changes,
// solo presenters' note glances, never staring, never mechanical repetition.
import { rng } from './context.js';

export function planBehaviour(ctx) {
  const out = [];
  if (!ctx.duo) return out;
  const r = rng(ctx.seed ^ 0x5bd1e995);
  const speech = ctx.duration;
  if (ctx.turnStart) {
    for (const slot of ctx.listeners) {
      const at = 0.2 + r() * 0.15;
      const dur = Math.min(2.6 + r() * 1.2, Math.max(0.8, speech - at - 0.4));
      out.push({ kind: 'look', slot, target: 'partner', char: 0, at, dur });
    }
  }
  if (ctx.handover && speech > 3) {
    const at = Math.max(0, speech - 1.1 - r() * 0.3);
    out.push({ kind: 'look', slot: ctx.speaker, target: 'partner', char: ctx.seg.text.length, at, dur: speech - at + 0.4 });
  }
  return out;
}
