// FULL TIME's presenters (docs/programmes/full-time.md §2): the owner approves every presenter's face. Three candidate
// looks each were drawn for Kai Sprite and Rosa Rally (A, B, C; described in v2/canvas25d/cast/full-time.js and the
// bible); until the owner chooses, candidate A airs.
//
// This is the ONE place to switch: change a letter below and both renderers follow (the v2 cast,
// v2/canvas25d/cast/full-time.js, and the old renderer's sprite and close-up, anchors.js and scenes/portraits.js).
export const FULL_TIME_LOOK = Object.freeze({ kai: 'A', rosa: 'A' });

/** The candidate letters a presenter can be switched to. */
export const FULL_TIME_CANDIDATES = Object.freeze(['A', 'B', 'C']);
