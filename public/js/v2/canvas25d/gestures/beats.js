// Speech beats and small delivery variants (owner: HANDS & GESTURES stream).
//
// Owner 20:40: "they have few gestures and it ends up repetitive" → motivated
// gestures on most sentences of light and neutral stories, rotated, never the
// same twice in a row, still adult and restrained. Real newsreaders do this
// with BEATS: the forearm pivots up from the desk at the elbow, the hand rises
// a few centimetres and comes down on the stressed word (the ictus), rebounds a
// touch and settles back. They are delivery, not statements, so they are
// variants of existing cues.js ACTIONS (a new action name would leak into every
// writer's vocabulary, PLAN §3.3) and the planner marks them `beat: true`.
//
//   raise_hand:beat   the near hand lifts off the desk and beats once on the word
//   raise_hand:beat2  both hands, a framing beat ("the whole country")
//   raise_hand:offer  the near palm turns up and opens toward the lens ("but")
//   steeple:press     the hands meet low over the desk, fingertips press on the word
//   point_screen:open an open hand toward the wall instead of an index ("as you can see")
//   raise_hand:box    both hands come up to the chest, palms facing, and frame the point (reads in
//                     an MCU: the hands stay above the lower third)
//   raise_hand:lift   one hand rises off the desk to the chest and beats once there (an MCU sees it)
//   raise_hand:turn   the near hand turns from palm-down to palm-up low over the desk ("on the
//                     other hand"), moving a little outward on the word
//   raise_hand:settle the near hand lifts a little and settles flat on the desk on the word
//   raise_hand:tick   the near index lifts and taps the desk once (the smallest beat)
//   steeple:tap       a steeple at chest height, the fingertips part and meet twice
//   <variant>_far     the one-handed beats with the far hand (mirrored at registration, see
//                     gestures/index.js FAR_BEATS): the planner picks the hand per instance
//
// Timing fields follow the planner's contract (gestures/index.js): the stroke
// starts 0.2-0.3 s before the stressed word, the apex (the ictus) lands on it,
// the release back to rest takes ≥ 0.4 s. Hand keys trail the wrist by ~60 ms
// (follow-through), the rig adds 40 ms of finger lag on top.
import { FLAT, STEEPLE } from './shapes.js';

/** One-handed beats that also exist as `<variant>_far` (the far hand; gestures/index.js mirrors them). */
export const FAR_BEATS = { raise_hand: ['beat', 'offer', 'turn', 'settle', 'tick', 'lift'] };

// fingers loosely extended, the way a hand leaves the desk to make a point
const LOOSE = [0.24, 0.16, 0.2, 0.26, 0.32];
// the beat hand: fingers together and softly bent (a calm hand, not a fan)
const BEAT = [0.26, 0.2, 0.24, 0.3, 0.36];
// the offering palm: open, the fingers a touch bent, the little finger more (never a flat board)
// (the curl is applied to all three joints, so these small numbers already cascade: index nearly
// straight, little finger softly bent; more read as a claw in the close-ups)
const OFFER = [0.08, 0.03, 0.05, 0.08, 0.12];
const SOFT = [0.3, 0.3, 0.34, 0.4, 0.46];
// the framing hands of `box`: open, fingers together and nearly straight (the curl acts on all three
// joints, so 0.1 is already a soft bend; more read as a claw at the lapels in the close-ups)
const BOX = [0.06, 0.05, 0.06, 0.08, 0.11];
// the lifted palm: open, the little finger a touch softer
const LIFT = [0.06, 0.04, 0.05, 0.08, 0.12];

export const BEATS = {
  raise_hand: {
    beat: {
      dur: 1.34,
      stroke: 0.26,
      apex: 0.5,
      hold: 0.82,
      focus: 'near',
      tracks: {
        // a small press into the desk (anticipation), the rise to the prep point above the desk,
        // the downstroke into the ictus, a 0.5 u rebound, then back to the desk
        wrist: [[0, 'R'], [0.08, [-5.7, 19.62, 13.37]], [0.26, [-6.0, 10.8, 15.5]], [0.42, [-5.95, 11.8, 15.85]], [0.5, [-6.0, 12.7, 15.95]], [0.62, [-5.95, 12.1, 15.9], 's'], [0.82, [-6.0, 12.3, 15.85], 's'], [1.1, [-5.7, 17.4, 14.3]], [1.34, 'R', 's']],
        dir: [[0, 'R'], [0.16, [-0.78, 0.18, 0.6]], [0.3, [-0.5, -0.12, 0.86]], [0.46, [-0.48, 0.02, 0.88]], [0.54, [-0.5, 0.08, 0.86]], [0.66, [-0.49, 0.03, 0.87], 's'], [0.86, [-0.49, 0.03, 0.87], 's'], [1.14, [-0.75, 0.15, 0.62]], [1.34, 'R']],
        curl: [[0, 'R'], [0.3, LOOSE], [0.52, BEAT, 's'], [0.86, BEAT, 's'], [1.18, 'R']],
        facing: [[0, 'R'], [0.3, -0.35, 's'], [0.9, -0.35, 's'], [1.16, 'R']],
        spread: [[0, 'R'], [0.4, 0.06], [0.9, 0.06], [1.2, 'R']],
        pole: [[0, 'R'], [0.36, [0.7, 1, -0.5]], [0.9, [0.7, 1, -0.5]], [1.34, 'R']],
        shN: [[0, 0], [0.1, 0.12], [0.3, -0.25], [0.5, -0.12], [0.9, -0.15], [1.2, 0.03], [1.34, 0]],
        pitch: [[0, 0], [0.26, -0.012], [0.5, 0.03], [0.72, 0.005], [1.34, 0]],
        brow: [[0, 0], [0.36, 0.22], [0.6, 0.14], [1.2, 0]],
      },
    },
    beat2: {
      dur: 1.44,
      stroke: 0.26,
      apex: 0.52,
      hold: 0.86,
      focus: 'both',
      tracks: {
        wrist: [[0, 'R'], [0.1, [-5.8, 19.6, 13.4]], [0.26, [-6.4, 11.4, 15.4]], [0.42, [-6.45, 12.3, 15.75]], [0.52, [-6.5, 13.2, 15.85]], [0.64, [-6.45, 12.6, 15.8], 's'], [0.86, [-6.5, 12.8, 15.75], 's'], [1.16, [-6.0, 17.8, 14.2]], [1.44, 'R', 's']],
        wristF: [[0, 'R'], [0.12, [5.8, 19.6, 13.4]], [0.28, [6.4, 11.4, 15.4]], [0.44, [6.45, 12.3, 15.75]], [0.54, [6.5, 13.2, 15.85]], [0.66, [6.45, 12.6, 15.8], 's'], [0.88, [6.5, 12.8, 15.75], 's'], [1.18, [6.0, 17.8, 14.2]], [1.44, 'R', 's']],
        dir: [[0, 'R'], [0.18, [-0.75, 0.15, 0.62]], [0.32, [-0.42, -0.1, 0.9]], [0.5, [-0.4, 0.04, 0.92]], [0.58, [-0.42, 0.1, 0.9]], [0.7, [-0.41, 0.05, 0.91], 's'], [0.92, [-0.41, 0.05, 0.91], 's'], [1.22, [-0.75, 0.15, 0.62]], [1.44, 'R']],
        dirF: [[0, 'R'], [0.2, [0.75, 0.15, 0.62]], [0.34, [0.42, -0.1, 0.9]], [0.52, [0.4, 0.04, 0.92]], [0.6, [0.42, 0.1, 0.9]], [0.72, [0.41, 0.05, 0.91], 's'], [0.94, [0.41, 0.05, 0.91], 's'], [1.24, [0.75, 0.15, 0.62]], [1.44, 'R']],
        curl: [[0, 'R'], [0.32, LOOSE], [0.56, BEAT, 's'], [0.92, BEAT, 's'], [1.26, 'R']],
        curlF: [[0, 'R'], [0.34, LOOSE], [0.58, BEAT, 's'], [0.94, BEAT, 's'], [1.28, 'R']],
        facing: [[0, 'R'], [0.32, -0.15, 's'], [0.96, -0.15, 's'], [1.24, 'R']],
        facingF: [[0, 'R'], [0.34, -0.15, 's'], [0.98, -0.15, 's'], [1.26, 'R']],
        spread: [[0, 'R'], [0.44, 0.07], [0.96, 0.07], [1.28, 'R']],
        spreadF: [[0, 'R'], [0.46, 0.07], [0.98, 0.07], [1.3, 'R']],
        pole: [[0, 'R'], [0.4, [0.8, 1, -0.45]], [0.96, [0.8, 1, -0.45]], [1.44, 'R']],
        poleF: [[0, 'R'], [0.42, [-0.8, 1, -0.45]], [0.98, [-0.8, 1, -0.45]], [1.44, 'R']],
        shN: [[0, 0], [0.1, 0.12], [0.32, -0.3], [0.54, -0.15], [0.96, -0.18], [1.3, 0.03], [1.44, 0]],
        shF: [[0, 0], [0.12, 0.12], [0.34, -0.3], [0.56, -0.15], [0.98, -0.18], [1.32, 0.03], [1.44, 0]],
        pitch: [[0, 0], [0.28, -0.015], [0.54, 0.035], [0.78, 0.005], [1.44, 0]],
        brow: [[0, 0], [0.38, 0.28], [0.66, 0.18], [1.3, 0]],
      },
    },
    offer: {
      dur: 1.56,
      stroke: 0.26,
      apex: 0.54,
      hold: 1.02,
      focus: 'near',
      tracks: {
        // the hand leaves the desk, rises in front of the body and turns palm-up (supination from the
        // resting back-of-hand pose, never a flip through palm-out), fingers forward and a little in,
        // the thumb opening outward: "here is the thing"
        wrist: [[0, 'R'], [0.1, [-5.8, 19.55, 13.4]], [0.3, [-5.6, 14.4, 16.2]], [0.46, [-5.2, 12.2, 17.4]], [0.54, [-5.1, 11.8, 17.7]], [0.68, [-5.15, 12.1, 17.6], 's'], [1.02, [-5.2, 12.3, 17.5], 's'], [1.3, [-5.6, 17.4, 14.6]], [1.56, 'R', 's']],
        dir: [[0, 'R'], [0.2, [-0.7, 0.05, 0.7]], [0.42, [-0.55, -0.12, 0.83]], [0.58, [-0.5, -0.14, 0.86]], [0.72, [-0.51, -0.12, 0.85], 's'], [1.08, [-0.51, -0.12, 0.85], 's'], [1.36, [-0.75, 0.15, 0.62]], [1.56, 'R']],
        curl: [[0, 'R'], [0.3, LOOSE], [0.56, OFFER, 's'], [1.08, OFFER, 's'], [1.4, 'R']],
        // sup flips only while the back of the hand faces the lens (facing −1: both sides give the same
        // palm); the forearm supinates once the hand has cleared the desk, the palm turning up and a
        // little toward the lens (foreshortened, never shown flat)
        sup: [[0, 0], [0.04, 0, 's'], [0.14, 1, 's'], [1.4, 1, 's'], [1.5, 0, 's'], [1.56, 0]],
        facing: [[0, 'R'], [0.28, -1, 's'], [0.5, 0.18], [0.6, 0.28, 's'], [1.04, 0.26, 's'], [1.36, -1, 's'], [1.56, 'R']],
        spread: [[0, 'R'], [0.56, 0.14], [1.06, 0.12], [1.4, 'R']],
        pole: [[0, 'R'], [0.4, [0.7, 1, -0.6]], [1.06, [0.7, 1, -0.6]], [1.56, 'R']],
        shN: [[0, 0], [0.12, 0.1], [0.4, -0.3], [1.02, -0.22], [1.4, 0.03], [1.56, 0]],
        roll: [[0, 0], [0.54, 0.02], [1.02, 0.016], [1.56, 0]],
        pitch: [[0, 0], [0.3, -0.01], [0.56, 0.02], [1.56, 0]],
        brow: [[0, 0], [0.4, 0.3], [0.7, 0.24], [1.4, 0]],
        smile: [[0, 0], [0.5, 0.06], [1.1, 0.05], [1.56, 0]],
      },
    },
    box: {
      dur: 1.5,
      stroke: 0.24,
      apex: 0.56,
      hold: 0.94,
      focus: 'both',
      tracks: {
        // both open hands come up in front of the body (well clear of the jacket: forward, wrists outside
        // the lapel line), palms facing each other a little over a hand-width apart, fingers up and toward
        // the lens, thumbs on top: they hold the shape of "the whole thing" in the air and set it down a
        // touch on the word; never a grab at the lapels (the oblique camera sees depth as height, so the
        // wrists sit forward and only chest-high, which an MCU keeps above the lower third)
        wrist: [[0, 'R'], [0.1, [-5.9, 19.7, 13.4]], [0.3, [-6.4, 9.6, 16.6]], [0.46, [-6.2, 0.1, 18.6]], [0.56, [-6.25, 0.8, 18.7]], [0.68, [-6.22, 0.4, 18.66], 's'], [0.94, [-6.22, 0.55, 18.6], 's'], [1.24, [-6.2, 14.4, 15.6]], [1.5, 'R', 's']],
        wristF: [[0, 'R'], [0.12, [5.9, 19.7, 13.4]], [0.32, [6.4, 9.6, 16.6]], [0.48, [6.2, 0.1, 18.6]], [0.58, [6.25, 0.8, 18.7]], [0.7, [6.22, 0.4, 18.66], 's'], [0.96, [6.22, 0.55, 18.6], 's'], [1.26, [6.2, 14.4, 15.6]], [1.5, 'R', 's']],
        dir: [[0, 'R'], [0.18, [-0.66, -0.1, 0.74]], [0.38, [-0.02, -0.6, 0.8]], [0.54, [0.04, -0.66, 0.75]], [0.62, [0.04, -0.61, 0.79]], [0.74, [0.04, -0.64, 0.77], 's'], [1.0, [0.04, -0.64, 0.77], 's'], [1.3, [-0.72, 0.1, 0.66]], [1.5, 'R']],
        dirF: [[0, 'R'], [0.2, [0.66, -0.1, 0.74]], [0.4, [0.02, -0.6, 0.8]], [0.56, [-0.04, -0.66, 0.75]], [0.64, [-0.04, -0.61, 0.79]], [0.76, [-0.04, -0.64, 0.77], 's'], [1.02, [-0.04, -0.64, 0.77], 's'], [1.32, [0.72, 0.1, 0.66]], [1.5, 'R']],
        curl: [[0, 'R'], [0.3, LOOSE], [0.56, BOX, 's'], [1.0, BOX, 's'], [1.32, 'R']],
        curlF: [[0, 'R'], [0.32, LOOSE], [0.58, BOX, 's'], [1.02, BOX, 's'], [1.34, 'R']],
        facing: [[0, 'R'], [0.36, 0.05, 's'], [1.02, 0.05, 's'], [1.32, 'R']],
        facingF: [[0, 'R'], [0.38, 0.05, 's'], [1.04, 0.05, 's'], [1.34, 'R']],
        spread: [[0, 'R'], [0.5, 0.1], [1.0, 0.1], [1.32, 'R']],
        spreadF: [[0, 'R'], [0.52, 0.1], [1.02, 0.1], [1.34, 'R']],
        pole: [[0, 'R'], [0.4, [0.9, 1, -0.3]], [1.0, [0.9, 1, -0.3]], [1.5, 'R']],
        poleF: [[0, 'R'], [0.42, [-0.9, 1, -0.3]], [1.02, [-0.9, 1, -0.3]], [1.5, 'R']],
        shN: [[0, 0], [0.1, 0.1], [0.38, -0.3], [0.58, -0.2], [0.94, -0.22], [1.28, 0.03], [1.5, 0]],
        shF: [[0, 0], [0.12, 0.1], [0.4, -0.3], [0.6, -0.2], [0.96, -0.22], [1.3, 0.03], [1.5, 0]],
        pitch: [[0, 0], [0.3, -0.012], [0.58, 0.03], [0.82, 0.008], [1.5, 0]],
        brow: [[0, 0], [0.38, 0.24], [0.68, 0.16], [1.32, 0]],
      },
    },
    lift: {
      dur: 1.5,
      stroke: 0.26,
      apex: 0.58,
      hold: 0.96,
      focus: 'near',
      tracks: {
        // a small palm-up lift: the hand leaves the desk, comes up in front of the chest (forward of the
        // jacket, outside the lapel), the forearm turning the palm up (supination while the back of the
        // hand faces the lens: no flip through palm-out), fingers extended toward the lens and a little
        // in, and it lifts once more on the word: "and this is the point" (no press first, an eased start)
        wrist: [[0, 'R'], [0.3, [-4.4, 10.6, 15.6]], [0.48, [-3.2, 1.4, 15.4]], [0.58, [-3.1, 0.4, 15.6]], [0.7, [-3.12, 0.9, 15.55], 's'], [0.96, [-3.12, 0.8, 15.5], 's'], [1.24, [-5.6, 12.8, 15.4]], [1.5, 'R', 's']],
        dir: [[0, 'R'], [0.2, [-0.7, -0.05, 0.7]], [0.4, [-0.7, -0.2, 0.68]], [0.56, [-0.72, -0.28, 0.64]], [0.64, [-0.72, -0.24, 0.65]], [0.76, [-0.72, -0.26, 0.64], 's'], [1.0, [-0.72, -0.26, 0.64], 's'], [1.3, [-0.74, 0.12, 0.64]], [1.5, 'R']],
        curl: [[0, 'R'], [0.32, LOOSE], [0.6, LIFT, 's'], [1.0, LIFT, 's'], [1.34, 'R']],
        sup: [[0, 0], [0.06, 0, 's'], [0.2, 1, 's'], [1.36, 1, 's'], [1.46, 0, 's'], [1.5, 0]],
        facing: [[0, 'R'], [0.3, -1, 's'], [0.5, 0.4], [0.6, 0.5, 's'], [1.0, 0.48, 's'], [1.3, -1, 's'], [1.5, 'R']],
        spread: [[0, 'R'], [0.56, 0.16], [1.0, 0.14], [1.34, 'R']],
        pole: [[0, 'R'], [0.42, [0.75, 1, -0.45]], [1.0, [0.75, 1, -0.45]], [1.5, 'R']],
        shN: [[0, 0], [0.38, -0.3], [0.58, -0.2], [0.96, -0.22], [1.3, 0.03], [1.5, 0]],
        pitch: [[0, 0], [0.32, -0.01], [0.6, 0.026], [0.86, 0.006], [1.5, 0]],
        roll: [[0, 0], [0.58, 0.016], [0.96, 0.012], [1.5, 0]],
        brow: [[0, 0], [0.4, 0.24], [0.7, 0.18], [1.36, 0]],
      },
    },
    turn: {
      dur: 1.44,
      stroke: 0.24,
      apex: 0.52,
      hold: 0.92,
      focus: 'near',
      tracks: {
        // palm-down off the desk, then the forearm turns the palm up as the hand moves out on the word
        // (supination while the back of the hand faces the lens: no flip through palm-out)
        wrist: [[0, 'R'], [0.1, [-5.75, 19.6, 13.4]], [0.3, [-5.3, 15.4, 15.4]], [0.44, [-3.9, 14.5, 16.0]], [0.52, [-3.4, 14.2, 16.2]], [0.64, [-3.55, 14.4, 16.15], 's'], [0.92, [-3.6, 14.5, 16.1], 's'], [1.2, [-5.2, 18.0, 14.4]], [1.44, 'R', 's']],
        dir: [[0, 'R'], [0.2, [-0.74, 0.08, 0.66]], [0.4, [-0.5, -0.06, 0.86]], [0.56, [-0.36, -0.1, 0.92]], [0.68, [-0.38, -0.08, 0.92], 's'], [0.96, [-0.38, -0.08, 0.92], 's'], [1.24, [-0.75, 0.15, 0.62]], [1.44, 'R']],
        curl: [[0, 'R'], [0.3, BEAT], [0.56, OFFER, 's'], [0.96, OFFER, 's'], [1.28, 'R']],
        sup: [[0, 0], [0.1, 0, 's'], [0.24, 1, 's'], [1.26, 1, 's'], [1.38, 0, 's'], [1.44, 0]],
        facing: [[0, 'R'], [0.3, -1, 's'], [0.48, -0.1], [0.58, 0.08, 's'], [0.96, 0.06, 's'], [1.24, -1, 's'], [1.44, 'R']],
        spread: [[0, 'R'], [0.56, 0.16], [0.96, 0.14], [1.28, 'R']],
        pole: [[0, 'R'], [0.38, [0.7, 1, -0.55]], [0.96, [0.7, 1, -0.55]], [1.44, 'R']],
        shN: [[0, 0], [0.12, 0.08], [0.4, -0.22], [0.92, -0.16], [1.28, 0.03], [1.44, 0]],
        roll: [[0, 0], [0.52, -0.018], [0.92, -0.014], [1.44, 0]],
        pitch: [[0, 0], [0.3, -0.008], [0.54, 0.018], [1.44, 0]],
        brow: [[0, 0], [0.4, 0.2], [0.7, 0.16], [1.3, 0]],
      },
    },
    settle: {
      dur: 1.3,
      stroke: 0.14,
      apex: 0.42,
      hold: 0.78,
      focus: 'near',
      tracks: {
        // the hand lifts a little off the desk and settles flat on it on the word, fingers spreading
        // as they meet the desk: "steady", "for now", "still"
        wrist: [[0, 'R'], [0.14, [-5.85, 18.1, 13.8]], [0.32, [-6.05, 18.7, 14.1]], [0.42, [-6.1, 19.3, 14.15]], [0.54, [-6.1, 19.22, 14.15], 's'], [0.78, [-6.1, 19.3, 14.15], 's'], [1.04, [-5.8, 19.1, 13.8]], [1.3, 'R', 's']],
        dir: [[0, 'R'], [0.2, [-0.78, 0.0, 0.62]], [0.44, [-0.74, 0.06, 0.67]], [0.56, [-0.74, 0.08, 0.66], 's'], [0.82, [-0.74, 0.08, 0.66], 's'], [1.1, [-0.78, 0.11, 0.6]], [1.3, 'R']],
        curl: [[0, 'R'], [0.2, LOOSE], [0.46, FLAT, 's'], [0.82, FLAT, 's'], [1.14, 'R']],
        spread: [[0, 'R'], [0.3, 0.1], [0.48, 0.3], [0.82, 0.26], [1.14, 'R']],
        pole: [[0, 'R'], [0.3, [0.6, 0.95, -0.6]], [0.82, [0.6, 0.95, -0.6]], [1.3, 'R']],
        shN: [[0, 0], [0.14, -0.14], [0.42, 0.06], [0.6, 0.02], [1.3, 0]],
        pitch: [[0, 0], [0.42, 0.022], [0.8, 0.01], [1.3, 0]],
      },
    },
    tick: {
      dur: 1.1,
      stroke: 0.14,
      apex: 0.42,
      hold: 0.62,
      focus: 'near',
      tracks: {
        // the hand stays on the desk; the index lifts and taps once on the word
        wrist: [[0, 'R'], [0.16, [-5.65, 18.85, 13.6]], [0.42, [-5.62, 19.3, 13.55]], [0.62, [-5.62, 19.3, 13.55], 's'], [1.1, 'R', 's']],
        curl: [[0, 'R'], [0.24, [0.3, 0.02, 0.4, 0.46, 0.52], 's'], [0.42, [0.3, 0.5, 0.44, 0.48, 0.54]], [0.54, [0.3, 0.4, 0.44, 0.48, 0.54], 's'], [0.66, [0.3, 0.42, 0.45, 0.49, 0.55], 's'], [1.1, 'R']],
        shN: [[0, 0], [0.18, -0.06], [0.42, 0.03], [1.1, 0]],
        pitch: [[0, 0], [0.42, 0.016], [0.7, 0.004], [1.1, 0]],
      },
    },
  },
  steeple: {
    // fingertips together in front of the chest (an MCU sees it), parting and meeting twice on the
    // word: a thinking beat for the analysts (Ada, Nova), never a prayer
    tap: {
      dur: 1.7,
      stroke: 0.22,
      apex: 0.56,
      hold: 1.12,
      focus: 'both',
      tracks: {
        wrist: [[0, 'R'], [0.12, [-6.2, 19.85, 13.6]], [0.34, [-9.6, 6.4, 15.6]], [0.46, [-10.7, 1.0, 16.1]], [0.56, [-10.75, 1.5, 16.2]], [0.7, [-10.72, 1.25, 16.18], 's'], [1.12, [-10.7, 1.4, 16.2], 's'], [1.44, [-7.4, 15.6, 14.6]], [1.7, 'R', 's']],
        wristF: [[0, 'R'], [0.14, [6.2, 19.85, 13.6]], [0.36, [9.6, 6.4, 15.6]], [0.48, [10.7, 1.0, 16.1]], [0.58, [10.75, 1.5, 16.2]], [0.72, [10.72, 1.25, 16.18], 's'], [1.14, [10.7, 1.4, 16.2], 's'], [1.46, [7.4, 15.6, 14.6]], [1.7, 'R', 's']],
        dir: [[0, 'R'], [0.18, [-0.7, 0.05, 0.7]], [0.42, [-0.4, -0.78, 0.48]], [0.6, [-0.38, -0.82, 0.42]], [0.74, [-0.38, -0.8, 0.44], 's'], [1.16, [-0.38, -0.8, 0.44], 's'], [1.5, [-0.75, 0.15, 0.62]], [1.7, 'R']],
        dirF: [[0, 'R'], [0.2, [0.7, 0.05, 0.7]], [0.44, [0.4, -0.78, 0.48]], [0.62, [0.38, -0.82, 0.42]], [0.76, [0.38, -0.8, 0.44], 's'], [1.18, [0.38, -0.8, 0.44], 's'], [1.52, [0.75, 0.15, 0.62]], [1.7, 'R']],
        curl: [[0, 'R'], [0.32, SOFT], [0.6, STEEPLE, 's'], [1.16, STEEPLE, 's'], [1.5, 'R']],
        curlF: [[0, 'R'], [0.34, SOFT], [0.62, STEEPLE, 's'], [1.18, STEEPLE, 's'], [1.52, 'R']],
        facing: [[0, 'R'], [0.4, -0.3, 's'], [1.18, -0.3, 's'], [1.5, 'R']],
        facingF: [[0, 'R'], [0.42, -0.3, 's'], [1.2, -0.3, 's'], [1.52, 'R']],
        // the fingertips part and meet twice, the second time smaller
        spread: [[0, 'R'], [0.56, 0.2, 's'], [0.68, 0.34], [0.8, 0.2, 's'], [0.9, 0.3], [1.0, 0.2, 's'], [1.5, 'R']],
        spreadF: [[0, 'R'], [0.58, 0.2, 's'], [0.7, 0.34], [0.82, 0.2, 's'], [0.92, 0.3], [1.02, 0.2, 's'], [1.52, 'R']],
        pole: [[0, 'R'], [0.42, [0.75, 1, -0.3]], [1.16, [0.75, 1, -0.3]], [1.7, 'R']],
        poleF: [[0, 'R'], [0.44, [-0.75, 1, -0.3]], [1.18, [-0.75, 1, -0.3]], [1.7, 'R']],
        shN: [[0, 0], [0.14, 0.1], [0.5, -0.28], [1.14, -0.22], [1.5, 0.03], [1.7, 0]],
        shF: [[0, 0], [0.16, 0.1], [0.52, -0.28], [1.16, -0.22], [1.52, 0.03], [1.7, 0]],
        pitch: [[0, 0], [0.56, 0.03], [1.1, 0.02], [1.7, 0]],
        browIn: [[0, 0], [0.56, 0.16], [1.1, 0.12], [1.7, 0]],
      },
    },
    press: {
      dur: 1.76,
      stroke: 0.26,
      apex: 0.56,
      hold: 1.16,
      focus: 'both',
      tracks: {
        // the hands come together low over the desk; on the word the fingertips press and the wrists dip
        wrist: [[0, 'R'], [0.24, [-8.6, 16.6, 16.0]], [0.46, [-10.9, 14.0, 17.2]], [0.56, [-11.1, 14.6, 17.3]], [0.7, [-11.05, 14.2, 17.25], 's'], [1.16, [-11.0, 14.3, 17.2], 's'], [1.48, [-7.0, 18.4, 14.6]], [1.76, 'R', 's']],
        wristF: [[0, 'R'], [0.26, [8.6, 16.6, 16.0]], [0.48, [10.9, 14.0, 17.2]], [0.58, [11.1, 14.6, 17.3]], [0.72, [11.05, 14.2, 17.25], 's'], [1.18, [11.0, 14.3, 17.2], 's'], [1.5, [7.0, 18.4, 14.6]], [1.76, 'R', 's']],
        dir: [[0, 'R'], [0.3, [-0.65, -0.2, 0.72]], [0.52, [-0.4, -0.52, 0.72]], [0.62, [-0.4, -0.46, 0.76]], [0.76, [-0.4, -0.5, 0.74], 's'], [1.22, [-0.4, -0.5, 0.74], 's'], [1.54, [-0.75, 0.15, 0.62]], [1.76, 'R']],
        dirF: [[0, 'R'], [0.32, [0.65, -0.2, 0.72]], [0.54, [0.4, -0.52, 0.72]], [0.64, [0.4, -0.46, 0.76]], [0.78, [0.4, -0.5, 0.74], 's'], [1.24, [0.4, -0.5, 0.74], 's'], [1.56, [0.75, 0.15, 0.62]], [1.76, 'R']],
        curl: [[0, 'R'], [0.34, SOFT], [0.6, STEEPLE, 's'], [1.2, STEEPLE, 's'], [1.56, 'R']],
        curlF: [[0, 'R'], [0.36, SOFT], [0.62, STEEPLE, 's'], [1.22, STEEPLE, 's'], [1.58, 'R']],
        facing: [[0, 'R'], [0.4, -0.35, 's'], [1.24, -0.35, 's'], [1.56, 'R']],
        facingF: [[0, 'R'], [0.42, -0.35, 's'], [1.26, -0.35, 's'], [1.58, 'R']],
        // fingertips: closed → a small press (they splay) → closed
        spread: [[0, 'R'], [0.48, 0.18], [0.58, 0.3], [0.72, 0.2, 's'], [1.2, 0.2], [1.56, 'R']],
        spreadF: [[0, 'R'], [0.5, 0.18], [0.6, 0.3], [0.74, 0.2, 's'], [1.22, 0.2], [1.58, 'R']],
        pole: [[0, 'R'], [0.46, [0.7, 1, -0.3]], [1.22, [0.7, 1, -0.3]], [1.76, 'R']],
        poleF: [[0, 'R'], [0.48, [-0.7, 1, -0.3]], [1.24, [-0.7, 1, -0.3]], [1.76, 'R']],
        shN: [[0, 0], [0.24, 0.1], [0.56, -0.22], [1.2, -0.18], [1.56, 0.03], [1.76, 0]],
        shF: [[0, 0], [0.26, 0.1], [0.58, -0.22], [1.22, -0.18], [1.58, 0.03], [1.76, 0]],
        pitch: [[0, 0], [0.56, 0.03], [1.2, 0.02], [1.76, 0]],
        browIn: [[0, 0], [0.56, 0.18], [1.2, 0.14], [1.76, 0]],
      },
    },
  },
  point_screen: {
    open: {
      dur: 1.9,
      stroke: 0.26,
      apex: 0.6,
      hold: 1.24,
      focus: 'near',
      tracks: {
        // an open palm offered toward the wall at chest height; eyes lead to the wall and come back
        wrist: [[0, 'R'], [0.18, [-7.6, 19.8, 11.96]], [0.48, [5.2, 7.4, 8.8]], [0.6, [6.6, 5.8, 8.2]], [0.76, [6.3, 6.2, 8.35], 's'], [1.24, [6.4, 6.2, 8.3], 's'], [1.62, [-5.4, 19.2, 12.4]], [1.9, 'R', 's']],
        dir: [[0, 'R'], [0.26, [-0.6, 0.4, 0.5]], [0.58, [0.78, -0.3, 0.42]], [0.7, [0.86, -0.22, 0.38]], [0.84, [0.84, -0.25, 0.4], 's'], [1.3, [0.84, -0.25, 0.4], 's'], [1.68, [-0.7, 0.25, 0.55]], [1.9, 'R']],
        curl: [[0, 'R'], [0.4, SOFT], [0.64, FLAT, 's'], [1.3, FLAT, 's'], [1.66, 'R']],
        facing: [[0, 'R'], [0.3, 0.9], [0.52, 0.5, 's'], [1.3, 0.5, 's'], [1.46, 0.9], [1.66, 'R']],
        sup: [[0, 0], [0.28, 0, 's'], [0.44, 1, 's'], [1.36, 1, 's'], [1.5, 0, 's'], [1.9, 0]],
        spread: [[0, 'R'], [0.62, 0.3], [1.28, 0.28], [1.66, 'R']],
        pole: [[0, 'R'], [0.5, [0.7, 1, -0.4]], [1.3, [0.7, 1, -0.4]], [1.9, 'R']],
        shN: [[0, 0], [0.2, 0.2], [0.58, -0.5], [1.26, -0.4], [1.66, 0.06], [1.9, 0]],
        lookX: [[0, 0], [0.16, 0.85], [0.5, 0.7], [0.9, 0.66], [1.0, 0.05], [1.24, 0], [1.9, 0]],
        lookY: [[0, 0], [0.2, -0.4], [0.9, -0.32], [1.02, 0], [1.9, 0]],
        yaw: [[0, 0], [0.18, -0.02], [0.5, 0.3], [0.62, 0.34], [0.78, 0.31, 's'], [0.94, 0.3], [1.18, 0.05], [1.3, 0.03, 's'], [1.9, 0]],
        lean: [[0, 0], [0.22, -0.01], [0.6, 0.022], [1.3, 0.02], [1.9, 0]],
        bx: [[0, 0], [0.6, 0.6], [1.3, 0.55], [1.9, 0]],
        brow: [[0, 0], [0.5, 0.28], [1.1, 0.22], [1.8, 0]],
      },
    },
  },
};
