// Head and body gestures beyond the approved seven (owner: HANDS & GESTURES
// stream): laugh, shake_head (+ 'slow' for Ada), lean_in.
// laugh is the adult version tech-bytes.md asks for: a closed-mouth laugh
// with a small head toss and eyes that smile, no body bounce and no open-mouth
// shapes (the mouth stays with the speech layer). The approved `nod` lives
// in library.js with its 'crisp' (UNIT-8) and 'single' variants.

export const HEADS = {
  laugh: {
    dur: 1.6,
    desc: 'laugh',
    stroke: 0.14,
    apex: 0.4,
    hold: 1.0,
    focus: 'head',
    tracks: {
      pitch: [[0, 0], [0.14, -0.02], [0.4, -0.06], [0.62, 0.015], [0.86, -0.03], [1.1, 0.01], [1.6, 0, 's']],
      roll: [[0, 0], [0.4, 0.03], [1.0, 0.015], [1.6, 0]],
      smile: [[0, 0], [0.25, 0.55], [1.0, 0.5], [1.6, 0]],
      squint: [[0, 0], [0.3, 0.5], [1.0, 0.45], [1.6, 0]],
      brow: [[0, 0], [0.3, 0.25], [1.0, 0.2], [1.6, 0]],
      lookY: [[0, 0], [0.4, 0.15], [0.9, 0.05], [1.6, 0]],
      // one breath-like lift of the shoulders, not a bounce
      shN: [[0, 0], [0.4, -0.25], [0.75, -0.08], [1.0, -0.12], [1.6, 0]],
      shF: [[0, 0], [0.42, -0.25], [0.77, -0.08], [1.02, -0.12], [1.6, 0]],
    },
  },

  // the soft chuckle before a line (owner decision 7): smaller and shorter than the laugh, eyes and mouth smiling,
  // one small lift of the shoulders as the breath goes out; the chuckle itself is heard (tools/voice/engine.py)
  chuckle: {
    dur: 1.1,
    desc: 'a soft chuckle at the very start of a line (light banter only)',
    stroke: 0.08,
    apex: 0.24,
    hold: 0.7,
    focus: 'head',
    tracks: {
      pitch: [[0, 0], [0.12, -0.025], [0.3, 0.01], [0.48, -0.015], [1.1, 0, 's']],
      smile: [[0, 0], [0.18, 0.45], [0.75, 0.38], [1.1, 0]],
      squint: [[0, 0], [0.2, 0.35], [0.7, 0.3], [1.1, 0]],
      brow: [[0, 0], [0.2, 0.15], [0.8, 0.1], [1.1, 0]],
      shN: [[0, 0], [0.22, -0.14], [0.5, -0.04], [1.1, 0]],
      shF: [[0, 0], [0.24, -0.14], [0.52, -0.04], [1.1, 0]],
    },
  },

  shake_head: {
    dur: 1.25,
    desc: 'shake head, disbelief or no',
    stroke: 0.1,
    apex: 0.3,
    hold: 0.82,
    focus: 'head',
    tracks: {
      yaw: [[0, 0], [0.1, 0.015], [0.3, -0.11], [0.52, 0.11], [0.74, -0.075], [0.94, 0.04], [1.25, 0, 's']],
      // the eyes hold the lens while the head turns
      lookX: [[0, 0], [0.3, 0.12], [0.52, -0.1], [0.74, 0.07], [0.94, -0.03], [1.25, 0]],
      browIn: [[0, 0], [0.3, 0.3], [1.0, 0.25], [1.25, 0]],
      smile: [[0, 0], [0.4, -0.1], [1.0, -0.08], [1.25, 0]],
      pitch: [[0, 0], [0.3, 0.02], [1.25, 0]],
    },
    variants: {
      // Ada's sceptical shake (tech-bytes.md): slower, smaller, the lids a touch lower
      slow: {
        dur: 1.9,
        stroke: 0.16,
        apex: 0.5,
        hold: 1.35,
        tracks: {
          yaw: [[0, 0], [0.16, 0.01], [0.5, -0.085], [0.95, 0.08], [1.35, -0.04], [1.9, 0, 's']],
          lookX: [[0, 0], [0.5, 0.09], [0.95, -0.08], [1.35, 0.03], [1.9, 0]],
          browIn: [[0, 0], [0.5, 0.25], [1.5, 0.2], [1.9, 0]],
          lid: [[0, 0], [0.5, 0.15], [1.5, 0.12], [1.9, 0]],
          smile: [[0, 0], [0.6, -0.06], [1.5, -0.05], [1.9, 0]],
        },
      },
    },
  },

  lean_in: {
    dur: 2.0,
    desc: 'lean towards the camera for emphasis',
    stroke: 0.24,
    apex: 0.62,
    hold: 1.4,
    focus: 'head',
    tracks: {
      // the shoulders come forward and down a little (by), the head dips and the eyes stay on the lens
      by: [[0, 0], [0.2, -0.15], [0.62, 1.2], [0.75, 1.1, 's'], [1.4, 1.1, 's'], [2.0, 0, 's']],
      hy: [[0, 0], [0.62, 0.5], [1.4, 0.45], [2.0, 0]],
      pitch: [[0, 0], [0.2, -0.015], [0.58, 0.07], [0.75, 0.05, 's'], [1.4, 0.045], [2.0, 0]],
      lookY: [[0, 0], [0.58, -0.35], [1.4, -0.3], [2.0, 0]],
      shN: [[0, 0], [0.62, 0.35], [1.4, 0.3], [2.0, 0]],
      shF: [[0, 0], [0.62, 0.35], [1.4, 0.3], [2.0, 0]],
      brow: [[0, 0], [0.6, 0.3], [1.4, 0.25], [2.0, 0]],
      // the forearms slide forward on the desk (and stay on it while the body drops)
      wrist: [[0, 'R'], [0.62, [-5.0, 18.2, 16.5]], [0.75, [-5.0, 18.3, 16.4], 's'], [1.4, [-5.0, 18.3, 16.4], 's'], [2.0, 'R', 's']],
      wristF: [[0, 'R'], [0.62, [5.0, 18.2, 16.5]], [0.75, [5.0, 18.3, 16.4], 's'], [1.4, [5.0, 18.3, 16.4], 's'], [2.0, 'R', 's']],
    },
  },
};
