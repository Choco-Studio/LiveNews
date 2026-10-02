// Shot planner (owner: CAMERA stream): the camera grammar of a segment,
// decided at runtime from the live episode data and the programme's style
// bible (docs/programmes/*.md). Pure and seeded.
//
//   planShots(ctx) → [{ kind: 'shot', shot, focus, char, at, move? }]
//     shot  'wide' | 'close' | 'full' | 'map' | 'fact' (+ new studio framings the
//           camera stream adds, e.g. 'two', 'ots'; new names also go in
//           graphics/index.js OVERLAYS or set scene.overlay)
//     move  null | { type: 'push' | 'pull', amount: 0.03, dur: 6, delay: 0.5 }
//   ctx = direction/context.js segmentContext(); `at` = seconds from speech start
//
// STUB (architect): the old director's beats (one per sentence: presenter,
// then map, picture, fact as the story allows), cut on sentence starts, no
// moves. The CAMERA stream replaces it with per-programme rules: cut on
// sentence ends from word times (map cuts on the place name), minimum and
// maximum shot lengths, the allowed push-ins/pull-outs, grave stories locked
// off, solo programmes without wide shots, the hand-over cut on B's first word.
export function planShots(ctx) {
  const { seg } = ctx;
  if (seg.type !== 'story') {
    const shot = ctx.duo ? 'wide' : 'close';
    return [{ kind: 'shot', shot, focus: ctx.speaker, char: 0, at: 0, move: null }];
  }
  const beats = [seg.shot === 'wide' && ctx.duo ? 'wide' : 'close'];
  if (seg.location) beats.push('map');
  if (ctx.hasImage) beats.push('full');
  if (seg.fact) beats.push('fact');
  if (seg.shot === 'full' && ctx.hasImage && beats[1] !== 'full') {
    beats.splice(beats.indexOf('full'), 1);
    beats.splice(1, 0, 'full');
  }
  const out = [];
  ctx.sentences.forEach((s, i) => {
    if (i >= beats.length) return;
    out.push({ kind: 'shot', shot: beats[i], focus: ctx.speaker, char: s.start, at: s.t0, move: null });
  });
  if (!out.length) out.push({ kind: 'shot', shot: beats[0], focus: ctx.speaker, char: 0, at: 0, move: null });
  return out;
}
