// The channel's experts (owner 23:05: "Don't forget the EXPERTS"; server/experts.js). Eight analysts of the
// channel's own, all fictional, each joining from a studio of their desk (studio/experts.js) in the
// correspondents' shots: a medium close-up on the left third, and the two-way's right box. Like the
// correspondents they wear an earpiece and a lapel microphone (cast/correspondents.js), and each is built on
// the presenters' proven parts (hair drawers, beards, glasses, wardrobe) with a design of their own, distinct
// from every presenter and correspondent at 1x:
//   Omar Ledger      ECONOMICS    salt-and-pepper side parting, a trimmed grey beard, dark rectangular
//                                 glasses, a midnight suit and a burgundy tie (Paco's cut, darker, bearded)
//   Clara Meridian   DIPLOMACY    silver hair to the shoulder with a deep side part, pearl studs, a royal
//                                 blue blazer over a white blouse, a silver brooch
//   Dev Isobar       CLIMATE      a black textured crop, clean-shaven, deep brown skin, a forest-green
//                                 blazer over a cream knit (lit like Nova: the planes facing the key in tan)
//   Tomas Albedo     SPACE        a wild halo of white hair, a white moustache, round glasses, a brown
//                                 cardigan over a pale shirt: the professor at once
//   June Kernel      TECHNOLOGY   a magenta bob, light skin, a black roll-neck: the one bright note
//   Amara Pulse      HEALTH       a close natural crop, deep brown skin, gold hoops, a white jacket over
//                                 a navy top
//   Leo Sepia        CULTURE      ginger side-parted hair and a short ginger beard, a charcoal blazer
//                                 over a mustard knit
//   Ines Clause      LEGAL        long chestnut hair, tan skin, a charcoal tailored jacket over a white
//                                 blouse, a fine gold chain
// Colours are the channel palette only; the face stays the warmest, brightest thing in each frame.
import { P } from '../../../palette.js';
import { line } from '../pixbuf.js';
import { headHW } from '../head.js';
import { deriveLook, SKIN_LIGHT, SKIN_TAN } from './base.js';
import { paco, drawShortHair, drawMustache } from './paco.js';
import { lola, drawBob, drawBobBack, drawEarrings } from './lola.js';
import { penny } from './penny.js';
import { max, drawTextured, drawBeard } from './max.js';
import { ada, drawHairBack, drawStraight, drawSpecs, drawStud } from './ada.js';
import { drawWarmHead, drawHaloBack, drawCoils } from './nova.js';
import { drawEarpiece } from './correspondents.js';
import { dec } from './kit-a.js';

// deep brown skin, lit with Nova's care (drawWarmHead: the planes that face the key turn to tan)
const SKIN_DEEP = [P.tan, P.tanShade, P.brown, P.maroon];

// The over hooks: whatever sits on the face (beard, moustache, glasses, studs), then the earpiece.
function omarOver(buf, L, m, head, s, sk) {
  drawBeard(buf, L, m, head, s);
  drawSpecs(buf, L, m, head, s, sk);
  drawEarpiece(buf, L, m, head, s);
}
function claraOver(buf, L, m, head, s) {
  drawStud(buf, L, head, s);
  drawEarpiece(buf, L, m, head, s);
}
function earpieceOnly(buf, L, m, head, s) {
  drawEarpiece(buf, L, m, head, s);
}
function tomasOver(buf, L, m, head, s, sk) {
  drawMustache(buf, L, m, head, s, sk);
  drawSpecs(buf, L, m, head, s, sk);
  drawEarpiece(buf, L, m, head, s);
}
function juneHair(buf, L, m, head, s, sk) {
  drawBob(buf, L, m, head, s, sk.hairLag || 0);
}
function amaraOver(buf, L, m, head, s) {
  drawHoops(buf, L, head, s);
  drawEarpiece(buf, L, m, head, s);
}
function leoOver(buf, L, m, head, s) {
  drawBeard(buf, L, m, head, s);
  drawEarpiece(buf, L, m, head, s);
}
function inesOver(buf, L, m, head, s) {
  drawStud(buf, L, head, s);
  drawEarpiece(buf, L, m, head, s);
}

/**
 * Small gold hoops hanging from both lobes: a ring of L.hoops (lit on the key side, its shade below), 1 px in
 * the wide, a 3 x 4 ring with a dark centre from a medium shot. Hidden on the far ear when the head turns.
 */
function drawHoops(buf, L, head, s) {
  if (!L.hoops || s < 1.2) return;
  const H = L.head, E = L.ears;
  const gold = dec(L.hoops[0]), shade = dec(L.hoops[1]);
  const turn = Math.sin(head.yaw);
  for (const side of [-1, 1]) {
    if (side * turn > 0.35) continue; // that ear has slipped behind the skull
    const hw = headHW(H, E.y + E.h * 0.5, 0);
    const [ex, ey] = head.toScreen(side * (hw + 0.2) - Math.max(0, side * turn) * 2.4, E.y + E.h * 0.5 + 0.6);
    const cx = Math.round(ex), cy = Math.round(ey);
    if (s < 2.2) {
      buf.plot(cx, cy + 1, gold, 1);
      continue;
    }
    const r = Math.max(2, Math.round(0.7 * s));
    // a ring hanging below the lobe: the upper-left of it catches the key
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(t) * (r - 0.5) * 0.8), y = Math.round(cy + r + Math.sin(t) * (r - 0.3));
      buf.plot(x, y, Math.cos(t) * 0.6 - Math.sin(t) < 0.2 ? gold : shade, 1);
    }
  }
}

export const omar = deriveLook(paco, {
  id: 'omar',
  name: 'Omar Ledger',
  head: { top: -10.0, craniumY: -2.5, R: 7.45, cheekY: 1.7, cheekHW: 7.05, chinY: 9.35, chinHW: 3.2, jawPow: 2.35 },
  eyes: { y: -0.65, x: 2.9, w: 2.65, h: 1.42, iris: [P.maroon, P.black], lash: P.maroon, lashes: false, bags: true },
  brows: { y: -2.45, len: 3.35, thick: 0.58, color: P.slate, arch: 0.22 },
  nose: { y0: -0.4, y1: 3.6, w: 1.65, big: true },
  mouth: { y: 6.1, w: 3.7, lip: P.brown, lipHi: P.tanShade, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_TAN,
  skinLine: P.brown,
  hair: { style: 'paco', ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink },
  mustache: null,
  beard: { ramp: [P.fog, P.steel, P.slate, P.ink], vol: 0.7 },
  glasses: { style: 'rect', ramp: [P.slate, P.ink, P.black, P.black] },
  outfit: 'correspondent',
  wear: 'suit',
  collar: 'tie',
  jacket: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  shirt: { ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel },
  tie: { ramp: [P.red, P.darkRed, P.maroon, P.black], line: P.black },
  pocket: true,
  cuff: P.silver,
  persona: { sway: 0.55, headMotion: 0.75, blinkMin: 2.6, blinkMax: 5.8, energy: 0.75, smile: 0.16 },
  mats: {
    hairD: { ramp: [P.fog, P.steel, P.slate, P.ink], decal: true },
    beard: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink },
    beardD: { ramp: [P.fog, P.steel, P.slate, P.ink], decal: true },
  },
  parts: { hair: drawShortHair, over: omarOver },
});

export const clara = deriveLook(lola, {
  id: 'clara',
  name: 'Clara Meridian',
  head: { top: -9.9, craniumY: -2.6, R: 7.05, cheekY: 1.6, cheekHW: 6.7, chinY: 8.95, chinHW: 2.35, jawPow: 2.0 },
  eyes: { y: -0.6, x: 2.8, w: 2.6, h: 1.36, iris: [P.navy, P.ink], lash: P.black, lashes: true, bags: true },
  brows: { y: -2.25, len: 3.15, thick: 0.42, color: P.steel, arch: 0.45 },
  nose: { y0: -0.25, y1: 3.3, w: 1.25, big: false },
  mouth: { y: 5.75, w: 3.4, lip: P.darkRed, lipHi: P.skinShade, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'straight', ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel },
  glasses: null,
  earrings: P.white,
  necklace: null,
  outfit: 'correspondent',
  wear: 'blazer',
  jacket: { ramp: [P.blue, P.navy, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  pin: { at: [5.4, 10.2], ramp: [P.white, P.silver, P.steel] },
  cuff: P.white,
  persona: { sway: 0.55, headMotion: 0.75, blinkMin: 2.6, blinkMax: 5.8, energy: 0.7, smile: 0.14 },
  mats: { strands: { ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel, th: [0.62, 0.08, -0.42] } },
  parts: { hairBack: drawHairBack, hair: drawStraight, over: claraOver, coversEars: false },
});

export const dev = deriveLook(max, {
  id: 'dev',
  name: 'Dev Isobar',
  head: { top: -10.2, craniumY: -2.6, R: 7.05, cheekY: 1.6, cheekHW: 6.75, chinY: 9.25, chinHW: 2.9, jawPow: 2.4 },
  eyes: { y: -0.55, x: 2.85, w: 2.65, h: 1.5, iris: [P.maroon, P.black], lash: P.black, lashes: false, bags: false },
  brows: { y: -2.5, len: 3.3, thick: 0.55, color: P.black, arch: 0.3 },
  nose: { y0: -0.3, y1: 3.4, w: 1.6, big: false },
  mouth: { y: 5.9, w: 3.6, lip: P.maroon, lipHi: P.tan, upper: P.tanShade, inner: P.black, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_DEEP,
  skinLift: 0.4,
  skinLine: P.maroon,
  hair: { style: 'textured', ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  beard: null,
  outfit: 'correspondent',
  wear: 'knitBlazer',
  jacket: { ramp: [P.steel, P.darkGreen, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.white, P.cream, P.fog, P.steel], line: P.steel },
  cuff: P.cream,
  persona: { sway: 0.65, headMotion: 1.0, blinkMin: 2.3, blinkMax: 5.0, energy: 0.9, smile: 0.2 },
  mats: {
    lapel: { ramp: [P.steel, P.darkGreen, P.ink, P.black], line: P.ink, rim: P.silver },
    rib: { ramp: [P.white, P.cream, P.fog, P.steel], line: P.steel },
    tex: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black, th: [0.62, 0.08, -0.42] },
    texEdge: { ramp: [P.slate, P.ink, P.black, P.black], line: P.maroon, th: [0.62, 0.08, -0.42] },
    texD: { ramp: [P.slate, P.ink, P.black, P.black], decal: true },
  },
  parts: { head: drawWarmHead, hair: drawTextured, over: earpieceOnly },
});

export const tomas = deriveLook(paco, {
  id: 'tomas',
  name: 'Dr Tomas Albedo',
  head: { top: -10.1, craniumY: -2.6, R: 7.5, cheekY: 1.7, cheekHW: 7.0, chinY: 9.2, chinHW: 2.9, jawPow: 2.1 },
  eyes: { y: -0.55, x: 2.9, w: 2.6, h: 1.38, iris: [P.steel, P.ink], lash: P.maroon, lashes: false, bags: true },
  brows: { y: -2.45, len: 3.4, thick: 0.62, color: P.silver, arch: 0.4 },
  nose: { y0: -0.4, y1: 3.6, w: 1.6, big: true },
  mouth: { y: 6.15, w: 3.6, lip: P.brown, lipHi: P.skinShade, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'coily', ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel },
  // a wild halo, fuller at the sides than on top, with a high forehead
  halo: { cy: -2.6, rx: 11.8, up: 9.0, down: 8.0, taper: 0.35, brow: 5.6 },
  mustache: { ramp: [P.white, P.silver, P.fog, P.steel], y: 4.4, w: 5.0, h: 1.25 },
  glasses: { style: 'round', ramp: [P.tanShade, P.brown, P.maroon, P.black] },
  outfit: 'correspondent',
  wear: 'cardigan',
  jacket: { ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black },
  shirt: { ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel },
  cuff: P.silver,
  tie: null,
  pocket: false,
  persona: { sway: 0.6, headMotion: 0.95, blinkMin: 2.4, blinkMax: 5.4, energy: 0.85, smile: 0.24 },
  mats: {
    band: { ramp: [P.brown, P.maroon, P.black, P.black], line: P.black, rim: P.silver },
    coil: { ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel, th: [0.62, 0.08, -0.42] },
  },
  parts: { hairBack: drawHaloBack, hair: drawCoils, over: tomasOver, coversEars: true },
});

export const june = deriveLook(ada, {
  id: 'june',
  name: 'June Kernel',
  head: { top: -9.8, craniumY: -2.6, R: 6.95, cheekY: 1.5, cheekHW: 6.65, chinY: 8.7, chinHW: 2.2, jawPow: 1.95 },
  eyes: { y: -0.5, x: 2.8, w: 2.75, h: 1.25, iris: [P.maroon, P.black], lash: P.black, lashes: true },
  brows: { y: -2.1, len: 3.0, thick: 0.45, color: P.black, arch: 0.3 },
  nose: { y0: -0.2, y1: 3.15, w: 1.2, big: false },
  mouth: { y: 5.6, w: 3.3, lip: P.darkRed, lipHi: P.skinShade, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'bob', ramp: [P.pink, P.magenta, P.purple, P.maroon], line: P.maroon, edge: P.purple, rimTop: false },
  glasses: null,
  earrings: null,
  outfit: 'correspondent',
  wear: 'turtleneck',
  jacket: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  shirt: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  cuff: P.ink,
  persona: { sway: 0.7, headMotion: 1.05, blinkMin: 2.2, blinkMax: 5.0, energy: 0.95, smile: 0.18 },
  mats: {
    hairD: { ramp: [P.pink, P.magenta, P.purple, P.maroon], decal: true },
    collar: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black, rim: P.silver },
    collarFlat: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  },
  parts: { hairBack: drawBobBack, hair: juneHair, over: earpieceOnly, coversEars: true },
});

export const amara = deriveLook(lola, {
  id: 'amara',
  name: 'Dr Amara Pulse',
  head: { top: -9.9, craniumY: -2.6, R: 7.1, cheekY: 1.8, cheekHW: 6.85, chinY: 8.9, chinHW: 2.5, jawPow: 2.05 },
  eyes: { y: -0.5, x: 2.85, w: 2.8, h: 1.45, iris: [P.brown, P.maroon], lash: P.black, lashes: true },
  brows: { y: -2.25, len: 3.2, thick: 0.45, color: P.black, arch: 0.45 },
  nose: { y0: -0.2, y1: 3.4, w: 1.6, big: false },
  mouth: { y: 5.9, w: 3.65, lip: P.maroon, lipHi: P.tan, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_DEEP,
  skinLift: 0.4,
  skinLine: P.maroon,
  hair: { style: 'coily', ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  // a close natural crop: a shell just off the skull, ending above the ears
  halo: { cy: -3.3, rx: 8.4, up: 8.3, down: 2.9, taper: 0.6, brow: 3.3 },
  earrings: null,
  hoops: [P.yellow, P.orange],
  necklace: null,
  outfit: 'correspondent',
  wear: 'blazer',
  jacket: { ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel },
  shirt: { ramp: [P.blue, P.navy, P.ink, P.black], line: P.black },
  cuff: P.white,
  persona: { sway: 0.7, headMotion: 0.9, blinkMin: 2.4, blinkMax: 5.4, energy: 0.85, smile: 0.24 },
  mats: { coil: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black, th: [0.62, 0.08, -0.42] } },
  parts: { head: drawWarmHead, hairBack: null, hair: drawCoils, over: amaraOver, coversEars: false },
});

export const leo = deriveLook(max, {
  id: 'leo',
  name: 'Leo Sepia',
  head: { top: -10.1, craniumY: -2.6, R: 7.15, cheekY: 1.5, cheekHW: 6.8, chinY: 9.3, chinHW: 3.1, jawPow: 2.5 },
  eyes: { y: -0.6, x: 2.85, w: 2.6, h: 1.45, iris: [P.darkGreen, P.black], lash: P.maroon, lashes: false, bags: false },
  brows: { y: -2.55, len: 3.3, thick: 0.52, color: P.rust, arch: 0.35 },
  nose: { y0: -0.35, y1: 3.5, w: 1.45, big: false },
  mouth: { y: 6.0, w: 3.6, lip: P.brown, lipHi: P.skinShade, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'paco', ramp: [P.orange, P.rust, P.brown, P.maroon], line: P.maroon },
  beard: { ramp: [P.orange, P.rust, P.brown, P.maroon], vol: 0.6 },
  outfit: 'correspondent',
  wear: 'knitBlazer',
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.cream, P.yellow, P.orange, P.rust], line: P.brown },
  cuff: P.slate,
  persona: { sway: 0.7, headMotion: 1.1, blinkMin: 2.2, blinkMax: 4.8, energy: 0.95, smile: 0.28 },
  mats: {
    hairD: { ramp: [P.orange, P.rust, P.brown, P.maroon], decal: true },
    beard: { ramp: [P.orange, P.rust, P.brown, P.maroon], line: P.maroon },
    beardD: { ramp: [P.orange, P.rust, P.brown, P.maroon], decal: true },
    lapel: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.ink, rim: P.silver },
    rib: { ramp: [P.cream, P.yellow, P.orange, P.rust], line: P.brown },
  },
  parts: { hair: drawShortHair, over: leoOver },
});

export const ines = deriveLook(penny, {
  id: 'ines',
  name: 'Ines Clause',
  head: { top: -9.85, craniumY: -2.6, R: 6.95, cheekY: 1.5, cheekHW: 6.6, chinY: 8.85, chinHW: 2.25, jawPow: 2.0 },
  eyes: { y: -0.6, x: 2.8, w: 2.7, h: 1.38, iris: [P.brown, P.maroon], lash: P.black, lashes: true },
  brows: { y: -2.25, len: 3.15, thick: 0.48, color: P.maroon, arch: 0.4 },
  nose: { y0: -0.25, y1: 3.3, w: 1.3, big: false },
  mouth: { y: 5.75, w: 3.4, lip: P.darkRed, lipHi: P.tan, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_TAN,
  skinLine: P.brown,
  hair: { style: 'straight', ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black },
  pearls: null,
  props: [],
  earrings: P.yellow,
  necklace: [P.yellow, P.orange],
  outfit: 'correspondent',
  wear: 'tailored',
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  pin: null,
  cuff: P.white,
  persona: { sway: 0.5, headMotion: 0.75, blinkMin: 2.6, blinkMax: 5.8, energy: 0.75, smile: 0.12 },
  mats: { strands: { ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black, th: [0.62, 0.08, -0.42] } },
  parts: { hairBack: drawHairBack, hair: drawStraight, over: inesOver },
});

export const EXPERTS = { omar, clara, dev, tomas, june, amara, leo, ines };
