// PAY ATTENTION's host (docs/programmes/pay-attention.md §2): a new character, and the owner approves every face.
// Three candidate looks were drawn for the quizmaster (A, B, C; described in v2/canvas25d/cast/pay-attention.js and
// docs/roadmap/critique/pay-attention-cast.md); the owner chose candidate B (18 Oct: "Candidata B para presentar el concurso").
//
// This is the ONE place to switch: change the letter below and both renderers follow (the v2 cast,
// v2/canvas25d/cast/pay-attention.js, and the old renderer's sprite and close-up, anchors.js and scenes/portraits.js).
// The host's name and voice follow the look's candidate in config/channel.json and server/voice/casting.json (one
// entry each, `qm`), which change with it.
export const HOST_LOOK = 'B';

/** The candidate letters the host can be switched to. */
export const HOST_CANDIDATES = Object.freeze(['A', 'B', 'C']);
