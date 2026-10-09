// The correspondents (owner 4 Oct: WORLD NOW's links, "poner un reportero hablando sobre ello";
// server/correspondents.js). Three of the channel's own characters, seen in a medium close-up in front of
// pictures of the place (studio/remote.js), never at the desk. Each is built on a presenter's proven parts
// (hair drawers, wardrobe) with a design of their own, distinct from every presenter at 1x:
//   Rhea Raster  EUROPE & AFRICA  black hair pulled back sleek into a low chignon, warm brown skin, a black
//                                 jacket over a white top, small silver studs (nothing like Penny's honey
//                                 chignon and burgundy blazer)
//   Vic Vector   AMERICAS         a short black crop, deep brown skin, a steel-blue jacket with an open-collar
//                                 white shirt (cool cloth against warm skin: the face stays the warmest thing)
//   Mika Voxel   ASIA & MID-EAST  a sleek black bob, light warm skin, a pale grey blazer over a black top,
//                                 silver drops (Lola's bob in another colour, cut and setting)
// What makes them correspondents at a glance: an earpiece in the visible ear with its clear tube running
// down into the collar (the classic remote look) and a small lapel microphone on a clip.
import { P } from '../../../palette.js';
import { material, line } from '../pixbuf.js';
import { headHW } from '../head.js';
import { GROUPS } from '../character.js';
import { deriveLook, SKIN_LIGHT, SKIN_TAN } from './base.js';
import { OUTFITS, registerOutfit } from './outfit.js';
import { penny, drawSleek, drawChignon } from './penny.js';
import { sam, drawCrop } from './sam.js';
import { lola, drawBob, drawBobBack, drawEarrings } from './lola.js';
import { drawWarmHead } from './nova.js';

const BUD = material('remote:earpiece', { ramp: [P.slate, P.ink, P.black, P.black], line: P.black, decal: true });
const TUBE = material('remote:tube', { ramp: [P.silver, P.fog, P.steel, P.slate], decal: true });
const MIC = material('remote:mic', { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black, decal: true });
const EP = [0, 0];
const EQ = [0, 0];

/**
 * The earpiece in the camera-right ear and its tube: a dark bud in the ear, the clear tube looping behind the
 * lobe and down the side of the neck into the collar. Under hair that covers the ears (a bob) only the tube
 * shows, coming out below the hair's ends. Medium shots and closer (s ≥ 2): at a wide it would be a speck.
 */
export function drawEarpiece(buf, L, m, head, s) {
  if (s < 2) return;
  const H = L.head, E = L.ears;
  const turn = Math.sin(head.yaw);
  // the camera-right ear slips behind the skull when the head turns that way: then there is nothing to see
  if (turn > 0.35) return;
  const hw = headHW(H, E.y, 0);
  const ex = hw + 0.25 - Math.max(0, turn) * 2.4 + Math.min(0, turn) * 0.4;
  const g = head.gb + GROUPS.look + 12;
  buf.part(g, 13, false);
  const covered = !!L.parts.coversEars;
  const pt = (x, y, out) => head.toScreenInto(x, y, out);
  if (!covered) {
    // the bud in the bowl of the ear (2 px at a medium close-up)
    pt(ex - 0.15, E.y + 0.1, EP);
    const r = Math.max(1, Math.round(0.45 * s));
    for (let y = -r + 1; y < r; y++) for (let x = -r + 1; x < r; x++) if (x * x + y * y < r * r) buf.plot(Math.round(EP[0]) + x, Math.round(EP[1]) + y, BUD, x + y < 0 ? 1 : 2);
  }
  // the tube: behind the lobe, then down the side of the neck into the collar (light: a clear tube catches the
  // key light); it hangs a little off the neck, so its lower end follows the head
  const lobe = E.y + E.h * 0.55;
  const nx = L.neck.hw - 0.45; // just inside the neck's side (the tube runs down the neck, never in the air)
  const collar = -L.headAt[1] - 2.2; // the collar's top, head-local (the neck base is -headAt below the head)
  const pts = covered
    ? [[ex - 0.35, H.chinY - 1.1], [ex - 0.9, H.chinY + 0.9], [nx, H.chinY + 2.2], [nx - 0.15, collar]]
    : [[ex - 0.1, E.y + 0.4], [ex + 0.5, lobe], [ex - 0.1, lobe + 1.7], [nx + 0.2, H.chinY + 1.4], [nx - 0.15, collar]];
  for (let i = 0; i + 1 < pts.length; i++) {
    pt(pts[i][0], pts[i][1], EP);
    pt(pts[i + 1][0], pts[i + 1][1], EQ);
    line(Math.round(EP[0]), Math.round(EP[1]), Math.round(EQ[0]), Math.round(EQ[1]), (x, y) => buf.plot(x, y, TUBE, 1));
  }
}

// The correspondents' wardrobe: their outfit (L.wear), then the lapel microphone clipped to the camera-left
// lapel, below the collar (body units: x left of the centre line, y down from the neck base).
function correspondentOutfit(o) {
  (OUTFITS[o.L.wear] || OUTFITS.blazer)(o);
  const s = o.s;
  if (s < 2) return;
  const [mx, my] = o.toS(-6.2, 9.4, 9);
  // in the jacket's own group: no inner line round it (the resolve's line between groups would eat a 3 px mic)
  o.buf.part(o.gb + GROUPS.jacket, 9, o.clip);
  // a small black capsule with a lit top, on a silver clip that catches the light even on a dark jacket
  const w = Math.max(2, Math.round(0.8 * s)), h = Math.max(3, Math.round(1.1 * s));
  const x0 = Math.round(mx - w / 2), y0 = Math.round(my - h / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.buf.plot(x0 + x, y0 + y, MIC, y === 0 && x === 0 ? 0 : y === 0 ? 1 : x === w - 1 || y === h - 1 ? 3 : 2);
  for (let x = -1; x <= w; x++) o.buf.plot(x0 + x, y0 + h, TUBE, x < 0 || x === w ? 2 : 0);
}
registerOutfit('correspondent', correspondentOutfit);

export const rhea = deriveLook(penny, {
  id: 'rhea',
  name: 'Rhea Raster',
  head: { top: -9.9, craniumY: -2.7, R: 6.95, cheekY: 1.6, cheekHW: 6.7, chinY: 8.95, chinHW: 2.5, jawPow: 2.1 },
  eyes: { y: -0.6, x: 2.8, w: 2.7, h: 1.42, iris: [P.brown, P.maroon], lash: P.black, lashes: true },
  brows: { y: -2.25, len: 3.15, thick: 0.5, color: P.black, arch: 0.42 },
  mouth: { y: 5.75, w: 3.45, lip: P.brown, lipHi: P.tan, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_TAN,
  // (critique r33: one flat tone and the far side in shade; the lit planes reach further round her face. Not
  // Nova's hand-placed planes: under her low fringe the forehead plane was clipped to a thin bar, a plaster)
  skinLift: 0.35,
  skinLine: P.maroon,
  hair: { style: 'chignon', ramp: [P.slate, P.ink, P.black, P.black], line: P.black, edge: P.ink, rimTop: false },
  pearls: null,
  props: [],
  outfit: 'correspondent',
  wear: 'tailored',
  neckline: 'scoop',
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  pin: null,
  earrings: P.silver,
  cuff: P.white,
  persona: { sway: 0.7, headMotion: 0.85, blinkMin: 2.4, blinkMax: 5.4, energy: 0.85, smile: 0.14 },
  mats: { hairD: { ramp: [P.slate, P.ink, P.black, P.black], decal: true } },
  parts: { hairBack: drawChignon, hair: drawRheaHair, over: drawEarpiece },
});
function drawRheaHair(buf, L, m, head, s, sk) {
  drawSleek(buf, L, m, head, s, sk.hairLag || 0);
}

export const vic = deriveLook(sam, {
  id: 'vic',
  name: 'Vic Vector',
  head: { top: -10.4, craniumY: -2.9, R: 7.1, cheekY: 1.9, cheekHW: 6.85, chinY: 9.3, chinHW: 3.05, jawPow: 2.3 },
  eyes: { y: -0.55, x: 2.85, w: 2.6, h: 1.42, iris: [P.maroon, P.black], lash: P.black, lashes: false, bags: false },
  brows: { y: -2.4, len: 3.3, thick: 0.55, color: P.black, arch: 0.3 },
  nose: { y0: -0.3, y1: 3.35, w: 1.6, big: false },
  mouth: { y: 5.8, w: 3.7, lip: P.maroon, lipHi: P.tanShade, upper: P.brown, inner: P.black, teeth: P.silver, tongue: P.darkRed },
  skin: [P.tan, P.tanShade, P.brown, P.maroon],
  // the deep ramp lit as Nova's (critique r28: without it his face was one brown with the far side in shade and
  // the nose's light as the only lit pixels, a pale dot)
  skinLift: 0.4,
  skinLine: P.maroon,
  hair: { style: 'crop', ramp: [P.slate, P.ink, P.black, P.black], line: P.black, edge: P.ink, rimTop: false },
  outfit: 'correspondent',
  wear: 'suit',
  collar: 'open',
  tie: null,
  pocket: false,
  jacket: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.black },
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  cuff: P.white,
  persona: { sway: 0.75, headMotion: 0.95, blinkMin: 2.4, blinkMax: 5.6, energy: 0.95, smile: 0.16 },
  mats: { hairD: { ramp: [P.slate, P.ink, P.black, P.black], decal: true } },
  parts: { head: drawWarmHead, hair: drawCrop, over: drawEarpiece },
});

export const mika = deriveLook(lola, {
  id: 'mika',
  name: 'Mika Voxel',
  head: { top: -9.8, craniumY: -2.5, R: 7.1, cheekY: 1.7, cheekHW: 6.75, chinY: 8.7, chinHW: 2.3, jawPow: 2.0 },
  eyes: { y: -0.5, x: 2.8, w: 2.7, h: 1.3, iris: [P.maroon, P.black], lash: P.black, lashes: true },
  brows: { y: -2.1, len: 3.0, thick: 0.45, color: P.black, arch: 0.4 },
  // (critique r33: as Lola's and Penny's, the colour on the lips, not on the line between them)
  mouth: { y: 5.6, w: 3.3, lip: P.brown, lipHi: P.skinShade, upper: P.darkRed, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'bob', ramp: [P.slate, P.ink, P.black, P.black], line: P.black, edge: P.ink, rimTop: false },
  outfit: 'correspondent',
  wear: 'blazer',
  necklace: null,
  jacket: { ramp: [P.silver, P.fog, P.steel, P.slate], line: P.slate },
  shirt: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  earrings: P.silver,
  cuff: P.silver,
  persona: { sway: 0.7, headMotion: 0.85, blinkMin: 2.3, blinkMax: 5.2, energy: 0.85, smile: 0.2 },
  mats: { hairD: { ramp: [P.slate, P.ink, P.black, P.black], decal: true } },
  parts: { hairBack: drawBobBack, hair: drawMikaHair, over: drawEarpiece, coversEars: true },
});
function drawMikaHair(buf, L, m, head, s, sk) {
  drawBob(buf, L, m, head, s, sk.hairLag || 0);
  if (L.earrings) drawEarrings(buf, L, head, s, sk.hairLag || 0);
}

export const CORRESPONDENTS = { rhea, vic, mika };
