// Gesture planner (owner: HANDS & GESTURES stream): which gestures each
// presenter performs during a segment, decided at runtime from the live
// episode data (cues written by the AI writer, segment type, emotion,
// programme style). Pure and seeded: same episode → same plan.
//
//   planGestures(ctx) → [{ kind: 'gesture', slot, name, char, at, speed? }]
//   ctx = direction/context.js segmentContext(); `at` = seconds from speech start
//
// STUB (architect): maps the writer's action cues onto the gestures the v2
// library has, and gives cue-less segments one default gesture like the old
// director did. The HANDS stream replaces it with the full rules: programme
// allow-lists (docs/programmes/*.md), start 0.2-0.3 s before the stressed
// word, at most one arm gesture per sentence, none in the first 0.5 s of a
// shot, light gestures never on grave stories.
import { GESTURES } from '../gestures/index.js';

/** @returns planned gesture and emotion events for every slot */
export function planGestures(ctx) {
  const seg = ctx.seg;
  const out = [];
  const cues = seg.cues?.length ? seg.cues : defaultCues(ctx);
  for (const cue of cues) {
    const slot = cue.slot && ctx.cast[cue.slot] ? cue.slot : ctx.speaker;
    const at = Math.max(0, ctx.timeAt(cue.char) - 0.25);
    if (cue.emotion) out.push({ kind: 'emotion', slot, name: cue.emotion, char: cue.char, at });
    else if (cue.action && GESTURES[cue.action]) out.push({ kind: 'gesture', slot, name: cue.action, char: cue.char, at });
  }
  return out;
}

function defaultCues(ctx) {
  const { seg } = ctx;
  if (seg.type === 'intro' || seg.type === 'outro') return [{ char: 0, action: ctx.grave ? 'nod' : 'wave' }];
  if (seg.type === 'chat') return [{ char: 0, action: ctx.duo ? 'look_partner' : 'nod' }];
  if (seg.type === 'story') return [{ char: 0, action: seg.hasImage ? 'point_screen' : ctx.grave ? 'nod' : 'raise_hand' }];
  return [];
}
