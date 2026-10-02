// "broadcast" music proposal for GLOBIT 24: classic news-package music in
// pixel form. One motif (sol-do-re-sol), five programme colours plus the
// network's own, bar-synced transitions, speech-aware ducking. See DESIGN.md
// (scratchpad/audio/music/broadcast) for the cue sheet and mix numbers.
export { BroadcastMusic, TRIM } from './conductor.js';
export { MOTIF, motifShapes } from './theory.js';
export { PROGRAMMES, CHANNEL_PKG, bedDef, storyColour, alignment } from './packages.js';
export { renderBroadcast, timeline, LINES, NEXT } from './render.js';
