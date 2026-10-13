// PAY ATTENTION's host (docs/programmes/pay-attention.md §2): the quizmaster, a new character: quick, warm and exact,
// enjoys the game more than winning it, keeps the score and the facts straight; seated at the centre podium with the
// question cards. Fictional, and resembling no real person. The owner approves the face (and the name and the
// voice): three candidates, A provisional until the owner chooses (the switch is public/js/pay-attention-looks.js,
// one line for both renderers). On air under the neutral id `qm` (config/channel.json).
//
// Built like FULL TIME's presenters (proven parts, a design of their own): A on Lola's seated body, B on Paco's, C on
// Penny's, each with headwear or hair of their own (cast/hair-quiz.js) and, for B and C, a garment no one else on air
// wears (cast/wardrobe-quiz.js). The programme's purple and gold appear only as small accents (a bow tie, a pin, a
// stud): a purple garment would merge with the question board's purple tiles behind the host, a gold one would
// compete with the gold of the right answer (bible §6), and Nova and Ines already wear purple.
//
// To put another candidate on air: public/js/pay-attention-looks.js. The owner's sheets: public/lab/pay-attention-cast.html.
import { P } from '../../../palette.js';
import { material } from '../pixbuf.js';
import { deriveLook, SKIN_TAN } from './base.js';
import { lola } from './lola.js';
import { paco } from './paco.js';
import { penny } from './penny.js';
import { drawStud } from './ada.js';
import { drawPuffs, drawPompadour, drawHijab } from './hair-quiz.js';
import './wardrobe-quiz.js';
import { HOST_LOOK } from '../../../pay-attention-looks.js';

const BLACK_HAIR = [P.slate, P.ink, P.black, P.black];
// blue-black with a steel gloss: the pompadour's sheen strokes are the one light tone in the hair, so the roll reads as
// glossy and its dark mass stays apart from Dev's high-top and Max's quiff at 1x (pay-attention-cast.test.js)
const GLOSS_HAIR = [P.steel, P.ink, P.black, P.black];

// ---------------------------------------------------------------------------
// Host A: the puffs

function drawPuffsAndStud(buf, L, m, head, s, sk) {
  drawPuffs(buf, L, m, head, s, sk);
  drawStud(buf, L, head, s);
}

/**
 * HOST A, "the puffs": hair parted in the centre and drawn back into two high afro puffs, warm medium-brown skin, a
 * small gold stud, a coral-red blazer over a black scoop top. At 1x: two dark clouds on top of the head, a red jacket
 * with a black V. Lively: the most expressive head and the readiest smile of the three.
 */
const HOST_A = deriveLook(lola, {
  id: 'qm-a',
  name: 'Quinn Query',
  head: { top: -9.9, craniumY: -2.6, R: 7.1, cheekY: 1.7, cheekHW: 6.85, chinY: 9.0, chinHW: 2.6, jawPow: 2.1 },
  headAt: [0, -13.0],
  neck: { hw: 2.5 },
  eyes: { y: -0.6, x: 2.85, w: 2.75, h: 1.5, iris: [P.maroon, P.black], lash: P.black, lashes: true },
  brows: { y: -2.35, len: 3.2, thick: 0.52, color: P.black, arch: 0.45 },
  nose: { y0: -0.2, y1: 3.35, w: 1.45, big: false },
  mouth: { y: 5.8, w: 3.7, lip: P.maroon, lipHi: P.tanShade, upper: P.brown, inner: P.black, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.8, w: 1.0 },
  skin: [P.tan, P.skinShade, P.tanShade, P.brown],
  skinLine: P.maroon,
  hair: { style: 'puffs', ramp: BLACK_HAIR, line: P.black, edge: P.ink, rimTop: false },
  puffs: { x: 5.8, y: -10.7, r: 3.5, right: 0.95, tilt: 0.25 },
  necklace: null,
  earrings: P.yellow,
  outfit: 'blazer',
  neckline: 'scoop',
  jacket: { ramp: [P.pink, P.red, P.darkRed, P.maroon], line: P.black },
  shirt: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  cuff: P.ink,
  props: ['papers'],
  persona: { sway: 0.72, headMotion: 1.08, blinkMin: 2.2, blinkMax: 5.0, energy: 0.95, smile: 0.3 },
  mats: {
    hairD: { ramp: BLACK_HAIR, decal: true },
    scalp: { ramp: [P.skinShade, P.tanShade], decal: true },
  },
  parts: { hairBack: null, hair: drawPuffsAndStud, over: null, coversEars: false },
});

// ---------------------------------------------------------------------------
// Host B: the bow tie

const BOW = { ramp: [P.magenta, P.purple, P.maroon, P.black], line: P.black, th: [0.8, -0.05, -0.5] };
// black satin lapels on the cream jacket. base.js registers every look's `lapel` under its own key with the jacket's
// ramp before the look's mats are read (a same-named mat cannot replace it), so the look names the satin's key
// (matKeys) and the satin is registered here first: the candidate and the look on air share it
const SATIN_KEY = 'pay-attention:satin-lapel';
material(SATIN_KEY, { ramp: [P.slate, P.ink, P.black, P.black], line: P.black, th: [0.8, -0.02, -0.5] });

/**
 * HOST B, "the bow tie": glossy black hair swept up into a pompadour from a side part, one silver streak swept up
 * with it, clean-shaven, olive skin, a cream dinner jacket with black satin lapels, a white shirt, a purple bow tie
 * and a purple pocket square. At 1x: a dark swept front with a silver line in it over the face, a pale jacket with a
 * black V, a white V inside it and a purple bar at the throat. The showman of the three, kept exact: a neat bow, a
 * crisp part.
 */
const HOST_B = deriveLook(paco, {
  id: 'qm-b',
  name: 'Theo Tally',
  head: { top: -10.2, craniumY: -2.45, R: 7.3, cheekY: 1.6, cheekHW: 6.95, chinY: 9.45, chinHW: 3.3, jawPow: 2.5 },
  headAt: [0, -13.4],
  neck: { hw: 3.0 },
  eyes: { y: -0.65, x: 2.9, w: 2.7, h: 1.5, iris: [P.tanShade, P.brown], lash: P.black, lashes: false, bags: false },
  brows: { y: -2.6, len: 3.4, thick: 0.6, color: P.black, arch: 0.3 },
  nose: { y0: -0.35, y1: 3.5, w: 1.5, big: false },
  mouth: { y: 6.1, w: 3.9, lip: P.brown, lipHi: P.tan, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.85, w: 1.05 },
  skin: SKIN_TAN,
  skinLine: P.brown,
  hair: { style: 'pompadour', ramp: GLOSS_HAIR, line: P.black, edge: P.ink, rimTop: false },
  pomp: { part: -3.0, h: 2.5, cx: 1.2, rx: 6.2, lean: 0.09, streak: [0.2, 2.6] },
  mustache: null,
  torso: { neckHW: 3.4, shoulderTop: 2.3, shoulderHW: 20.4, sideHW: 19.2, bottom: 46, vDepth: 22, shoulderJoint: [17.4, 6.7] },
  outfit: 'bowTieSuit',
  collar: 'band',
  tie: null,
  pocket: false,
  bow: { w: 3.1, h: 1.25, y: 1.0 },
  bowRamp: [P.magenta, P.purple, P.maroon], // the bow's colours where it is painted on the shirt (the wide)
  // cream, never white (ART_DIRECTION: white for collars and glints), shaded cool so the face stays the warmest
  jacket: { ramp: [P.cream, P.cream, P.fog, P.steel], line: P.steel },
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  cuff: P.white,
  props: ['papers'],
  matKeys: { lapel: SATIN_KEY },
  persona: { sway: 0.62, headMotion: 0.95, blinkMin: 2.3, blinkMax: 5.2, energy: 0.9, smile: 0.27 },
  mats: {
    hairD: { ramp: GLOSS_HAIR, decal: true },
    streak: { ramp: [P.white, P.silver, P.fog, P.steel], decal: true },
    bow: BOW,
    square: { ramp: [P.magenta, P.purple, P.maroon, P.black], decal: true },
  },
  parts: { hairBack: null, hair: drawPompadour, over: null, coversEars: false },
});

// ---------------------------------------------------------------------------
// Host C: the hijab

const SCARF = [P.cyan, P.blue, P.navy, P.ink];

/**
 * HOST C, "the hijab": an azure hijab framing the face, its drape round the neck and over the shoulders, light tan
 * skin, a black tailored jacket over a white blouse, a small gold pin at the temple and a gold bar on the lapel. At
 * 1x: a bright blue oval round the face over a dark jacket with a white V. The calmest of the three: an even head, a
 * level gaze, a warm, ready smile.
 */
const HOST_C = deriveLook(penny, {
  id: 'qm-c',
  name: 'Layla Level',
  head: { top: -9.85, craniumY: -2.65, R: 6.95, cheekY: 1.5, cheekHW: 6.7, chinY: 8.95, chinHW: 2.35, jawPow: 2.0 },
  headAt: [0, -13.0],
  neck: { hw: 2.45 },
  eyes: { y: -0.6, x: 2.8, w: 2.7, h: 1.45, iris: [P.tanShade, P.brown], lash: P.black, lashes: true },
  brows: { y: -2.25, len: 3.15, thick: 0.5, color: P.maroon, arch: 0.5 },
  nose: { y0: -0.2, y1: 3.25, w: 1.3, big: false },
  mouth: { y: 5.75, w: 3.5, lip: P.brown, lipHi: P.skinShade, upper: P.tan, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: [P.cream, P.skin, P.tan, P.tanShade],
  skinLine: P.brown,
  hair: { style: 'hijab', ramp: SCARF, line: P.ink, rimTop: false },
  pearls: null,
  outfit: 'hijabJacket',
  under: 'tailored',
  neckline: 'v',
  lapel: { notchY: 6.4, w: 4.0, collarW: 3.1 },
  jacket: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  pin: { at: [5.8, 11.6], ramp: [P.yellow, P.orange, P.rust] },
  buttons: 1,
  cuff: P.white,
  props: ['papers'],
  persona: { sway: 0.55, headMotion: 0.85, blinkMin: 2.4, blinkMax: 5.4, energy: 0.85, smile: 0.26 },
  mats: {
    scarf: { ramp: SCARF, line: P.ink, th: [0.78, 0.12, -0.42] },
    scarfE: { ramp: SCARF, line: P.navy, th: [0.78, 0.12, -0.42] },
    scarfD: { ramp: SCARF, decal: true },
  },
  parts: { hairBack: null, hair: drawHijab, over: null, coversEars: true },
});

// ---------------------------------------------------------------------------
// The candidates, the names, the gestures and the look on air

export const HOST_CANDIDATES = { A: HOST_A, B: HOST_B, C: HOST_C };

/** One line per candidate for the owner's sheet (docs/programmes/pay-attention.md §2). */
export const CANDIDATE_NOTES = {
  A: 'the puffs: hair parted in the centre and drawn back into two high afro puffs, warm medium-brown skin, a gold stud, a coral-red blazer over a black scoop top',
  B: 'the bow tie: a glossy black pompadour swept up from a side part with one silver streak, clean-shaven, olive skin, a cream dinner jacket with black satin lapels, white shirt, purple bow tie and pocket square',
  C: 'the hijab: an azure hijab framing the face and draped over the shoulders, light tan skin, a black tailored jacket over a white blouse, a gold pin',
};

/**
 * The name options, one per look (each fits that look), in the channel's style (a name and a word of the trade:
 * Pixel, Byte, Sterling, Rally...). The owner picks; the option-A name is in config/channel.json, marked provisional.
 */
export const HOST_NAMES = {
  A: { name: 'Quinn Query', gender: 'female', personality: 'asks every question as if it were the best one yet, quick and warm, and takes the answer exactly as it aired: a query has one right answer' },
  B: { name: 'Theo Tally', gender: 'male', personality: 'the showman who keeps the tally: brisk, warm and fair, enjoys a close game more than any winner, and never lets a point or a fact slip' },
  C: { name: 'Layla Level', gender: 'female', personality: 'calm, quick and exact, keeps the game level: a warm word for a good guess, the answer and its source straight after' },
};

/**
 * The quizmaster's gestures for the director (pay-attention.md §9 step 4): the channel's own seated gestures
 * (gestures/library.js), chosen for a host at a centre podium. point_partner turns to a player (side by seat),
 * point_screen opens toward the board behind, count keeps the score, lean_in sets up a question, papers squares the
 * question cards between rounds. Never a laugh (the owner's rule; no studio audience) and nothing that takes a side
 * or mocks a guess: no thumbs_up, shake_head, shrug, facepalm, wow or fist_pump.
 */
export const HOST_GESTURES = Object.freeze({
  allow: ['nod', 'point_partner', 'look_partner', 'point_screen', 'raise_hand', 'count', 'lean_in', 'steeple', 'papers'],
  listener: ['nod', 'look_partner'],
  deny: ['laugh', 'wow', 'fist_pump', 'facepalm', 'thumbs_up', 'shake_head', 'shrug', 'point_camera', 'chin', 'glasses', 'wave'],
});

/** A candidate as the host's look on air: the same design under the host's own id (and material keys). */
function onAir(L, id) {
  return deriveLook(L, { id });
}
export const qm = onAir(HOST_CANDIDATES[HOST_LOOK] || HOST_A, 'qm');
