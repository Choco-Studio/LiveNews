// FULL TIME's presenters (docs/programmes/full-time.md §2): Kai Sprite, the reader (quick and warm, a reporter who
// became an anchor), and Rosa Rally, the analyst (a former international midfielder: calm, exact, dry). Both are
// fictional and resemble no real person. The owner approves every face: three candidates each, A airs until the
// owner chooses (the switch is public/js/full-time-looks.js, one line for both renderers).
//
// Built like the correspondents (proven parts, a design of their own): Kai on Max's seated body, Rosa on Lola's,
// each with hair drawers of their own (cast/hair-sport.js) and FULL TIME's zip tops (cast/wardrobe-sport.js). The
// programme's accent is orange (P.orange): the candidates carry it as a trim (a rib, a stripe, a headband), never as
// a whole orange garment that would melt into the pitchside set's orange boards (Kai B's knit is rust, a step darker).
//
// To put another candidate on air: public/js/full-time-looks.js (one letter per presenter; both renderers follow).
// The owner's comparison sheets: public/lab/full-time-cast.html (?sheet=candidates | pairs | onair | legacy).
import { P } from '../../../palette.js';
import { deriveLook, SKIN_TAN, SKIN_LIGHT } from './base.js';
import { max } from './max.js';
import { lola } from './lola.js';
import { drawWarmHead } from './nova.js';
import { drawSleeveStripes } from './wardrobe-sport.js';
import { drawShaved, drawFullBeard, drawPonytail, drawPonytailBack, drawTopKnot, drawCurtains, drawCornrows, drawCurlBand, drawCurlBack } from './hair-sport.js';
import { FULL_TIME_LOOK } from '../../../full-time-looks.js';

const WHITE_TEE = { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel };
const ZIP = { ramp: [P.silver, P.fog, P.steel, P.slate], line: P.ink, decal: true };
const ORANGE_RIB = { ramp: [P.yellow, P.orange, P.rust, P.brown], line: P.maroon, th: [0.9, -0.1, -0.6] };
const ORANGE_CUFF = { ramp: [P.orange, P.orange, P.rust, P.brown], line: P.maroon, th: [0.9, -0.1, -0.6] };
const ORANGE_STRIPE = { ramp: [P.orange, P.orange, P.rust, P.brown], decal: true };

// ---------------------------------------------------------------------------
// Kai Sprite

/**
 * KAI A, "the bomber" (the bible's look): a clean-shaven head and a full black beard trimmed square, warm olive
 * skin, a dark navy bomber with an orange ribbed collar, cuffs and waistband, zipped half open over a white crew tee.
 * At 1x: a smooth dome over a dark squared jaw, an orange band round the neck and a white V.
 */
const KAI_A = deriveLook(max, {
  id: 'kai-a',
  name: 'Kai Sprite',
  head: { top: -10.1, craniumY: -2.55, R: 7.15, cheekY: 1.5, cheekHW: 6.85, chinY: 9.2, chinHW: 3.5, jawPow: 2.7 },
  eyes: { y: -0.6, x: 2.85, w: 2.7, h: 1.6, iris: [P.brown, P.maroon], lash: P.black, lashes: false, bags: false },
  brows: { y: -2.65, len: 3.4, thick: 0.62, color: P.black, arch: 0.22 },
  nose: { y0: -0.3, y1: 3.5, w: 1.55, big: false },
  mouth: { y: 6.05, w: 3.8, lip: P.brown, lipHi: P.tan, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.85, w: 1.05 },
  skin: SKIN_TAN,
  skinLine: P.brown,
  hair: { style: 'shaved', ramp: [P.slate, P.ink, P.black, P.black], line: P.black, rimTop: false },
  headAt: [0, -13.3], // a longer neck than Max's: the rib collar shows below the beard
  beard: { ramp: [P.slate, P.ink, P.black, P.black], drop: 1.6, halfW: 4.1, vol: 0.5 },
  outfit: 'zipTop',
  zip: { collar: 'rib', open: 8.0, waist: true, lit: -0.45 }, // the nylon's sheen over the key-side chest
  // midnight navy nylon: an ink body that catches the key in navy (a navy body measured as a recoloured twin of
  // Lola's blazer, full-time-cast.test.js), so the orange rib and the white tee carry him at 1x
  jacket: { ramp: [P.navy, P.ink, P.ink, P.black], line: P.black },
  shirt: WHITE_TEE,
  cuff: P.orange,
  persona: { sway: 0.6, headMotion: 1.15, blinkMin: 2.1, blinkMax: 4.8, energy: 0.92, smile: 0.24 },
  mats: {
    trim: ORANGE_RIB,
    cuff: ORANGE_CUFF,
    zip: ZIP,
    beard: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  },
  parts: { hair: drawShaved, over: drawFullBeard },
});

// ---------------------------------------------------------------------------
// Rosa Rally

/**
 * ROSA A, "the ponytail" (the bible's look): near-black hair drawn back sleek to a high ponytail with a lighter brown
 * lift where the light catches it, light tan skin, straight strong brows, a charcoal zip track top with an orange
 * stripe down each sleeve over a white tee, small gold hoops. An athlete's bearing: square shoulders, a still head.
 */
const ROSA_A = deriveLook(lola, {
  id: 'rosa-a',
  name: 'Rosa Rally',
  head: { top: -9.9, craniumY: -2.6, R: 7.0, cheekY: 1.3, cheekHW: 6.65, chinY: 9.1, chinHW: 2.45, jawPow: 2.05 }, // high cheekbones, a long jaw
  headAt: [0, -13.0],
  neck: { hw: 2.55 },
  eyes: { y: -0.6, x: 2.8, w: 2.6, h: 1.32, iris: [P.brown, P.maroon], lash: P.black, lashes: true }, // level, unhurried
  brows: { y: -2.3, len: 3.3, thick: 0.52, color: P.black, arch: 0.28 },
  nose: { y0: -0.2, y1: 3.3, w: 1.3, big: false },
  mouth: { y: 5.8, w: 3.4, lip: P.brown, lipHi: P.tan, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.75, w: 0.95 },
  skin: [P.cream, P.skin, P.tan, P.tanShade],
  skinLine: P.brown,
  hair: { style: 'ponytail', ramp: [P.brown, P.maroon, P.black, P.black], line: P.black, edge: P.maroon, rimTop: false },
  necklace: null,
  earrings: null,
  hoops: [P.yellow, P.yellow, P.orange],
  torso: { neckHW: 3.0, shoulderTop: 2.9, shoulderHW: 18.9, sideHW: 17.4, bottom: 46, vDepth: 16, shoulderJoint: [16.2, 7.0] },
  outfit: 'zipTop',
  zip: { collar: 'stand', open: 7.0 },
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: WHITE_TEE,
  cuff: P.ink,
  persona: { sway: 0.55, headMotion: 0.8, blinkMin: 2.6, blinkMax: 5.6, energy: 0.78, smile: 0.08 }, // dry: the smile is rare
  mats: {
    hairD: { ramp: [P.brown, P.maroon, P.black, P.black], decal: true },
    hairLift: { ramp: [P.tanShade], decal: true },
    // the tail: the hair without the silver light (a rim down its edge read as a headphone band at 1x)
    tail: { ramp: [P.brown, P.maroon, P.black, P.black], line: P.black, th: [0.62, 0.08, -0.42] },
    collar: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
    cuff: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black, th: [0.9, -0.1, -0.6] },
    zip: ZIP,
    stripe: ORANGE_STRIPE,
  },
  parts: { hairBack: drawPonytailBack, hair: drawPonytail, over: null, sleeves: drawSleeveStripes, coversEars: false },
});

// ---------------------------------------------------------------------------
// The other candidates (for the owner's choice; never on air until chosen)

const BLACK_HAIR = [P.slate, P.ink, P.black, P.black];
const KAI_PERSONA = KAI_A.persona;
const ROSA_PERSONA = ROSA_A.persona;

/**
 * KAI B, "the top knot": black hair drawn back into a small knot on the crown, the sides faded short, clean-shaven,
 * brown skin, a rust quarter-zip knit (a funnel collar, zipped to mid-chest) over a white tee. At 1x: a knot on top
 * of a close dark cap, a warm rust top.
 */
const KAI_B = deriveLook(max, {
  id: 'kai-b',
  name: 'Kai Sprite',
  head: { top: -10.1, craniumY: -2.55, R: 7.1, cheekY: 1.6, cheekHW: 6.8, chinY: 9.25, chinHW: 3.1, jawPow: 2.5 },
  headAt: [0, -13.1],
  eyes: KAI_A.eyes,
  brows: KAI_A.brows,
  nose: { y0: -0.3, y1: 3.5, w: 1.65, big: false },
  mouth: { y: 6.0, w: 3.8, lip: P.maroon, lipHi: P.tanShade, upper: P.brown, inner: P.black, teeth: P.silver, tongue: P.darkRed },
  ears: KAI_A.ears,
  skin: [P.tan, P.skinShade, P.tanShade, P.brown],
  skinLine: P.maroon,
  hair: { style: 'topknot', ramp: BLACK_HAIR, line: P.black, edge: P.ink, rimTop: false },
  beard: null,
  outfit: 'zipTop',
  zip: { collar: 'stand', open: 6.5, knit: true },
  jacket: { ramp: [P.rust, P.rust, P.brown, P.maroon], line: P.black },
  shirt: WHITE_TEE,
  cuff: P.rust,
  persona: KAI_PERSONA,
  mats: {
    hairD: { ramp: BLACK_HAIR, decal: true },
    cuff: { ramp: [P.rust, P.rust, P.brown, P.maroon], line: P.maroon, th: [0.9, -0.1, -0.6] },
    zip: ZIP,
  },
  parts: { hair: drawTopKnot, over: null },
});

/**
 * KAI C, "the anchor": ear-length espresso hair from a middle part (curtains over the temples and the ears),
 * clean-shaven, light skin, a near-black suit with an open-collar white shirt and a white pocket square. At 1x: dark
 * hair framing the face, a black suit and a white V; the classic anchor of the three.
 */
const KAI_C = deriveLook(max, {
  id: 'kai-c',
  name: 'Kai Sprite',
  head: { top: -10.0, craniumY: -2.6, R: 7.0, cheekY: 1.5, cheekHW: 6.7, chinY: 9.3, chinHW: 3.2, jawPow: 2.6 },
  headAt: [0, -13.1],
  eyes: { ...KAI_A.eyes, iris: [P.tanShade, P.brown] },
  brows: { ...KAI_A.brows, color: P.maroon, thick: 0.55 },
  nose: { y0: -0.3, y1: 3.45, w: 1.45, big: false },
  mouth: { y: 6.0, w: 3.7, lip: P.skinShade, lipHi: P.skin, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: KAI_A.ears,
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'curtains', ramp: [P.brown, P.maroon, P.black, P.black], line: P.black, edge: P.maroon, rimTop: false },
  beard: null,
  outfit: 'suit',
  collar: 'open',
  tie: null,
  pocket: true,
  jacket: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  cuff: P.white,
  persona: KAI_PERSONA,
  mats: { hairD: { ramp: [P.brown, P.maroon, P.black, P.black], decal: true } },
  parts: { hair: drawCurtains, over: null, coversEars: true },
});

/**
 * ROSA B, "the cornrows": cornrows straight back over the dome (gathered at the nape), deep brown skin, a cream
 * roll-neck knit, small gold studs. At 1x: a close, finely lined dark cap, a warm face over a pale knit.
 */
const ROSA_B = deriveLook(lola, {
  id: 'rosa-b',
  name: 'Rosa Rally',
  head: { ...ROSA_A.head, cheekHW: 6.7, chinHW: 2.55 },
  headAt: ROSA_A.headAt,
  neck: ROSA_A.neck,
  eyes: { ...ROSA_A.eyes, iris: [P.maroon, P.black] },
  brows: ROSA_A.brows,
  nose: { y0: -0.2, y1: 3.35, w: 1.5, big: false },
  mouth: { y: 5.8, w: 3.5, lip: P.maroon, lipHi: P.tanShade, upper: P.brown, inner: P.black, teeth: P.silver, tongue: P.darkRed },
  ears: ROSA_A.ears,
  skin: [P.tan, P.tanShade, P.brown, P.maroon],
  skinLine: P.maroon,
  hair: { style: 'cornrows', ramp: BLACK_HAIR, line: P.black, edge: P.ink, rimTop: false },
  necklace: null,
  earrings: null,
  studs: [P.yellow, P.orange],
  torso: ROSA_A.torso,
  outfit: 'turtleneck',
  // cream, never white: a whole white garment would outshine the face (ART_DIRECTION: white for collars and glints)
  jacket: { ramp: [P.cream, P.cream, P.fog, P.steel], line: P.steel },
  shirt: { ramp: [P.cream, P.cream, P.fog, P.steel], line: P.steel },
  cuff: P.cream,
  persona: ROSA_PERSONA,
  mats: {
    hairD: { ramp: BLACK_HAIR, decal: true },
    scalp: { ramp: [P.tanShade, P.brown], decal: true },
    collar: { ramp: [P.cream, P.cream, P.fog, P.steel], line: P.steel, rim: P.silver },
    collarFlat: { ramp: [P.cream, P.cream, P.fog, P.steel], line: P.steel },
  },
  parts: { head: drawWarmHead, hairBack: null, hair: drawCornrows, over: null, coversEars: false },
});

/**
 * ROSA C, "the curls": shoulder-length dark brown curls held off the face by a thin orange headband, olive skin, a
 * royal blue zip track top with a white stripe down each sleeve over a white tee. At 1x: a full rounded mass of curls
 * with a line of orange across it, a blue top.
 */
const ROSA_C = deriveLook(lola, {
  id: 'rosa-c',
  name: 'Rosa Rally',
  head: { ...ROSA_A.head, cheekHW: 6.7 },
  headAt: ROSA_A.headAt,
  neck: ROSA_A.neck,
  eyes: { ...ROSA_A.eyes, iris: [P.tanShade, P.brown] },
  brows: { ...ROSA_A.brows, color: P.maroon },
  nose: ROSA_A.nose,
  mouth: { ...ROSA_A.mouth, lip: P.tanShade, lipHi: P.skinShade },
  ears: ROSA_A.ears,
  skin: SKIN_TAN,
  skinLine: P.brown,
  hair: { style: 'curls', ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black, edge: P.maroon, rimTop: false },
  necklace: null,
  earrings: null,
  torso: ROSA_A.torso,
  outfit: 'zipTop',
  zip: { collar: 'stand', open: 7.0 },
  jacket: { ramp: [P.blue, P.navy, P.ink, P.black], line: P.black },
  shirt: WHITE_TEE,
  cuff: P.ink,
  persona: ROSA_PERSONA,
  mats: {
    hairD: { ramp: [P.tanShade, P.brown, P.maroon, P.black], decal: true },
    band: { ramp: [P.yellow, P.orange, P.rust, P.brown], decal: true },
    cuff: { ramp: [P.navy, P.ink, P.black, P.black], line: P.black, th: [0.9, -0.1, -0.6] },
    zip: ZIP,
    stripe: { ramp: [P.white, P.white, P.silver, P.fog], decal: true },
  },
  parts: { hairBack: drawCurlBack, hair: drawCurlBand, over: null, sleeves: drawSleeveStripes, coversEars: true },
});

// ---------------------------------------------------------------------------
// The candidates and the looks on air

export const KAI_CANDIDATES = { A: KAI_A, B: KAI_B, C: KAI_C };
export const ROSA_CANDIDATES = { A: ROSA_A, B: ROSA_B, C: ROSA_C };
/** One line per candidate for the owner's sheet (docs/programmes/full-time.md §2). */
export const CANDIDATE_NOTES = {
  kai: {
    A: 'the bomber: clean-shaven head, full black beard trimmed square, warm olive skin, dark navy bomber with an orange rib collar and cuffs over a white tee',
    B: 'the top knot: black hair drawn back into a small knot, faded sides, clean-shaven, brown skin, rust quarter-zip knit over a white tee',
    C: 'the anchor: ear-length espresso curtains from a middle part, clean-shaven, light skin, near-black suit, open white collar, white pocket square',
  },
  rosa: {
    A: 'the ponytail: near-black hair drawn back to a high ponytail with a brown lift, light tan skin, charcoal track top with an orange stripe down each sleeve, white tee, small gold hoops',
    B: 'the cornrows: cornrows straight back to the nape, deep brown skin, cream roll-neck knit, small gold studs',
    C: 'the curls: shoulder-length dark brown curls under a thin orange headband, olive skin, royal blue track top with a white stripe down each sleeve',
  },
};

/** A candidate as the presenter's look on air: the same design under the presenter's own id (and material keys). */
function onAir(L, id) {
  return deriveLook(L, { id });
}
export const kai = onAir(KAI_CANDIDATES[FULL_TIME_LOOK.kai] || KAI_A, 'kai');
export const rosa = onAir(ROSA_CANDIDATES[FULL_TIME_LOOK.rosa] || ROSA_A, 'rosa');
