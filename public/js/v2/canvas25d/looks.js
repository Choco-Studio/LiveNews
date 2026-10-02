// Presenter looks for the canvas25d rig: proportions, colour ramps and the
// small set of feature switches an artist picks per person. Units are "rig
// units" (centimetres; 1 u = 1 px in the wide shot). The body origin is the
// base of the neck, x to screen-right, y down, z toward the camera.
//
// Proportions are adult on purpose (owner's tone note: a news channel for
// grown-ups, no big-head mascots): head ≈ 20 u tall and 15 u wide on
// shoulders ≈ 42 u, eyes on the head's half-way line, hands ≈ 0.55 head,
// upper arm ≈ 1.15 head, desk at elbow height.
//
// Ramps are [highlight, base, shade, deep] from the channel palette
// (public/js/palette.js); no new colours are introduced.
import { P } from '../../palette.js';

const SKIN_LIGHT = [P.cream, P.skin, P.skinShade, P.brown];
const SKIN_TAN = [P.skin, P.tan, P.tanShade, P.brown];

export const LOOKS = {
  paco: {
    id: 'paco',
    name: 'Paco Pixel',
    // head profile (head-local units, y down from the head centre)
    head: { top: -10.2, craniumY: -2.4, R: 7.6, cheekY: 1.6, cheekHW: 7.15, chinY: 9.4, chinHW: 3.0, jawPow: 2.25 },
    headAt: [0, -13.4], // head centre relative to the neck base
    neck: { hw: 3.0 },
    eyes: { y: -0.7, x: 2.95, w: 2.75, h: 1.5, iris: [P.brown, P.maroon], lash: P.maroon, lashes: false, bags: true },
    brows: { y: -2.5, len: 3.3, thick: 0.5, color: P.steel, arch: 0.35 },
    nose: { y0: -0.4, y1: 3.5, w: 1.55, big: true },
    mouth: { y: 6.15, w: 3.8, lip: P.brown, lipHi: P.skinShade, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
    ears: { y: -0.1, h: 2.8, w: 1.0 },
    skin: SKIN_LIGHT,
    skinLine: P.brown,
    hair: { style: 'paco', ramp: [P.silver, P.fog, P.steel, P.slate], line: P.slate },
    mustache: { ramp: [P.silver, P.fog, P.steel, P.slate], y: 4.35, w: 4.7, h: 1.05 },
    // body
    torso: { neckHW: 3.5, shoulderTop: 2.2, shoulderHW: 21.0, sideHW: 20.0, bottom: 46, vDepth: 26, shoulderJoint: [18.0, 6.6] },
    outfit: 'suit',
    jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black }, // charcoal: lets the red tie and silver rim read
    shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
    tie: { ramp: [P.red, P.red, P.darkRed, P.maroon], line: P.maroon },
    pocket: true,
    arm: { upper: 23, fore: 21, rUpper: 3.6, rElbow: 3.05, rWrist: 2.4, hand: 11.2 },
    cuff: P.white,
    // personality for the idle layer: calm, economical
    persona: { sway: 0.6, headMotion: 0.7, blinkMin: 2.6, blinkMax: 5.8, energy: 0.7, smile: 0.18 },
  },
  lola: {
    id: 'lola',
    name: 'Lola Byte',
    head: { top: -10.0, craniumY: -2.6, R: 7.3, cheekY: 1.8, cheekHW: 6.95, chinY: 9.0, chinHW: 2.4, jawPow: 2.05 },
    headAt: [0, -13.0],
    neck: { hw: 2.55 },
    eyes: { y: -0.6, x: 2.85, w: 2.75, h: 1.45, iris: [P.green, P.darkGreen], lash: P.black, lashes: true },
    brows: { y: -2.15, len: 3.15, thick: 0.45, color: P.brown, arch: 0.55 },
    nose: { y0: -0.2, y1: 3.25, w: 1.25, big: false },
    mouth: { y: 5.8, w: 3.5, lip: P.darkRed, lipHi: P.skinShade, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
    ears: { y: -0.1, h: 2.8, w: 1.0 },
    skin: SKIN_TAN,
    skinLine: P.brown,
    hair: { style: 'bob', ramp: [P.rust, P.brown, P.maroon, P.black], line: P.black }, // auburn, not candy orange
    mustache: null,
    torso: { neckHW: 3.0, shoulderTop: 3.0, shoulderHW: 18.4, sideHW: 17.2, bottom: 46, vDepth: 16, shoulderJoint: [15.8, 7.0] },
    outfit: 'blazer',
    jacket: { ramp: [P.blue, P.navy, P.ink, P.black], line: P.black }, // deep blue: darker than her face
    shirt: { ramp: [P.white, P.cream, P.skin, P.tan], line: P.tanShade },
    necklace: [P.yellow, P.orange],
    earrings: P.yellow,
    arm: { upper: 21, fore: 19.5, rUpper: 3.0, rElbow: 2.6, rWrist: 2.05, hand: 10.2 },
    cuff: P.yellow,
    persona: { sway: 0.85, headMotion: 1.05, blinkMin: 2.2, blinkMax: 5.2, energy: 1.05, smile: 0.26 },
  },
};
