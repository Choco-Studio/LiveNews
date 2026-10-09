// The channel's experts on a video call (server/experts.js; owner 8 Oct: "que parezca una llamada en directo al
// despacho o el hogar de la persona"). Six of the channel's own fictional contributors, seen as a webcam sees them:
// a medium close-up in their own room (studio/remote.js drawRoom), never at the desk, never on location. Each is
// built on a presenter's proven parts (hair drawers, wardrobe, face) with a design of their own, distinct from
// every presenter and correspondent at 1x. No earpiece and no lapel microphone (that is the correspondents' look):
// a guest at home is on their own laptop.
//   Iris Kernel    economist, London          sleek auburn hair, round tortoiseshell-dark glasses, navy blazer
//   Omar Gradient  foreign affairs, Brussels  short salt-and-pepper hair, thin rectangular glasses, tan skin,
//                                             a navy suit with an open collar
//   Tess Contour   climate, Oslo              a pale blonde bob, light skin, a cobalt turtleneck
//   Ravi Shader    technology, San Francisco  a short black crop, warm brown skin, a slate jacket over an open
//                                             white shirt
//   Noor Orbit     planetary science, Pasadena  straight black hair, deep brown skin, a maroon cardigan
//   Elena Dither   public health, Geneva      a silver bob, half-rim glasses, a charcoal tailored jacket
import { P } from '../../../palette.js';
import { deriveLook, SKIN_LIGHT, SKIN_TAN } from './base.js';
import { paco } from './paco.js';
import { penny, drawSleek, drawChignon } from './penny.js';
import { drawGlasses } from '../glasses.js';
import { GROUPS } from '../character.js';
import { sam } from './sam.js';
import { lola } from './lola.js';
import { ada } from './ada.js';

const SKIN_DEEP = [P.tan, P.tanShade, P.brown, P.maroon];
// Glasses (FACES' drawGlasses) clipped to the head and the hair, as Ada's are (cast/ada.js drawOver, not shared):
// lens pixels that land where nothing was drawn are taken back out, so the far lens never sticks out
const SAVE = new Uint8Array(160 * 48);
function glassesOver(buf, L, m, head, s, sk) {
  if (!L.glasses || s < 1.35) return;
  const H = L.head, E = L.eyes;
  const bx0 = Math.max(1, Math.floor(head.cx - (H.R + 2.5) * s)), by0 = Math.max(1, Math.floor(head.cy + (E.y - 2.6) * s));
  const bw = Math.min(160, Math.ceil((2 * H.R + 5) * s) + 1, buf.w - 1 - bx0), bh = Math.min(48, Math.ceil(5 * s) + 1, buf.h - 1 - by0);
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) SAVE[j * 160 + i] = buf.mat[(by0 + j) * buf.w + bx0 + i] ? 1 : 0;
  drawGlasses(buf, L, head, sk.face, s);
  const g0 = head.gb + GROUPS.glasses, g1 = head.gb + GROUPS.glassesEnd;
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const k = (by0 + j) * buf.w + bx0 + i;
      if (!SAVE[j * 160 + i] && buf.mat[k] && buf.grp[k] >= g0 && buf.grp[k] <= g1) buf.mat[k] = 0;
    }
  }
}

const WHITE_SHIRT = { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel };

export const iris = deriveLook(penny, {
  id: 'iris',
  name: 'Dr Iris Kernel',
  head: { top: -9.9, craniumY: -2.6, R: 7.0, cheekY: 1.6, cheekHW: 6.7, chinY: 8.9, chinHW: 2.55, jawPow: 2.2 },
  eyes: { y: -0.6, x: 2.8, w: 2.6, h: 1.35, iris: [P.green, P.darkGreen], lash: P.maroon, lashes: true },
  brows: { y: -2.6, len: 3.1, thick: 0.45, color: P.rust, arch: 0.35 },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'sleek', ramp: [P.orange, P.rust, P.maroon, P.maroon], line: P.maroon, edge: P.rust, rimTop: false },
  glasses: { style: 'round', ramp: [P.brown, P.maroon, P.maroon, P.black] },
  outfit: 'blazer',
  neckline: 'scoop',
  // bottle green: her own colour beside Omar's navy (the two economics and politics guests of WORLD NOW)
  jacket: { ramp: [P.green, P.darkGreen, P.ink, P.black], line: P.black },
  shirt: WHITE_SHIRT,
  pearls: null,
  pin: null,
  earrings: null,
  persona: { sway: 0.5, headMotion: 0.75, blinkMin: 2.6, blinkMax: 5.8, energy: 0.75, smile: 0.12 },
  mats: { hairD: { ramp: [P.orange, P.rust, P.maroon, P.maroon], decal: true } },
  parts: { hairBack: drawChignon, hair: (buf, L, m, head, s, sk) => drawSleek(buf, L, m, head, s, sk.hairLag || 0), over: glassesOver },
});

export const omar = deriveLook(paco, {
  id: 'omar',
  name: 'Omar Gradient',
  head: { top: -10.0, craniumY: -2.5, R: 7.3, cheekY: 1.7, cheekHW: 6.9, chinY: 9.2, chinHW: 2.9, jawPow: 2.3 },
  eyes: { y: -0.6, x: 2.85, w: 2.6, h: 1.4, iris: [P.brown, P.maroon], lash: P.maroon, lashes: false, bags: false },
  brows: { y: -2.5, len: 3.2, thick: 0.55, color: P.slate, arch: 0.22 },
  nose: { y0: -0.4, y1: 3.4, w: 1.5, big: false },
  skin: SKIN_TAN,
  skinLine: P.brown,
  hair: { style: 'paco', ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink },
  mustache: null,
  glasses: { style: 'rect', ramp: [P.steel, P.slate, P.ink, P.black] },
  outfit: 'suit',
  collar: 'open',
  tie: null,
  pocket: false,
  jacket: { ramp: [P.blue, P.navy, P.ink, P.black], line: P.black },
  shirt: WHITE_SHIRT,
  persona: { sway: 0.5, headMotion: 0.7, blinkMin: 2.8, blinkMax: 6.0, energy: 0.7, smile: 0.1 },
  mats: { hairD: { ramp: [P.fog, P.steel, P.slate, P.ink], decal: true } },
  parts: { over: glassesOver },
});

export const tess = deriveLook(lola, {
  id: 'tess',
  name: 'Prof Tess Contour',
  head: { top: -9.8, craniumY: -2.5, R: 7.0, cheekY: 1.7, cheekHW: 6.7, chinY: 8.8, chinHW: 2.4, jawPow: 2.1 },
  eyes: { y: -0.5, x: 2.8, w: 2.6, h: 1.3, iris: [P.blue, P.navy], lash: P.brown, lashes: true },
  brows: { y: -2.2, len: 3.0, thick: 0.4, color: P.tan, arch: 0.35 },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'bob', ramp: [P.cream, P.cream, P.tan, P.tanShade], line: P.tanShade, edge: P.tan, rimTop: false },
  outfit: 'turtleneck',
  jacket: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink },
  shirt: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink },
  necklace: null,
  earrings: null,
  persona: { sway: 0.55, headMotion: 0.8, blinkMin: 2.4, blinkMax: 5.4, energy: 0.8, smile: 0.14 },
  mats: { hairD: { ramp: [P.cream, P.cream, P.tan, P.tanShade], decal: true }, collar: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink } },
});

export const ravi = deriveLook(sam, {
  id: 'ravi',
  name: 'Dr Ravi Shader',
  head: { top: -10.2, craniumY: -2.8, R: 7.1, cheekY: 1.8, cheekHW: 6.8, chinY: 9.2, chinHW: 2.85, jawPow: 2.3 },
  eyes: { y: -0.55, x: 2.85, w: 2.6, h: 1.4, iris: [P.maroon, P.black], lash: P.black, lashes: false, bags: false },
  brows: { y: -2.4, len: 3.3, thick: 0.6, color: P.black, arch: 0.25 },
  skin: SKIN_TAN,
  skinLine: P.maroon,
  hair: { style: 'crop', ramp: [P.slate, P.ink, P.black, P.black], line: P.black, edge: P.ink, rimTop: false },
  outfit: 'blazer',
  collar: 'open',
  tie: null,
  pocket: false,
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: WHITE_SHIRT,
  persona: { sway: 0.7, headMotion: 0.9, blinkMin: 2.3, blinkMax: 5.2, energy: 0.95, smile: 0.16 },
  mats: { hairD: { ramp: [P.slate, P.ink, P.black, P.black], decal: true } },
});

export const noor = deriveLook(ada, {
  id: 'noor',
  name: 'Dr Noor Orbit',
  head: { top: -9.9, craniumY: -2.7, R: 7.0, cheekY: 1.7, cheekHW: 6.75, chinY: 8.9, chinHW: 2.5, jawPow: 2.2 },
  eyes: { y: -0.6, x: 2.8, w: 2.7, h: 1.4, iris: [P.maroon, P.black], lash: P.black, lashes: true },
  brows: { y: -2.5, len: 3.2, thick: 0.5, color: P.black, arch: 0.38 },
  skin: SKIN_DEEP,
  skinLine: P.maroon,
  // the deep ramp lit as Vic's (critique r28: without the lift the face read as one brown)
  skinLift: 0.4,
  glasses: null,
  outfit: 'cardigan',
  jacket: { ramp: [P.red, P.darkRed, P.maroon, P.black], line: P.black },
  shirt: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  earrings: P.yellow,
  persona: { sway: 0.6, headMotion: 0.85, blinkMin: 2.4, blinkMax: 5.6, energy: 0.85, smile: 0.18 },
  // Ada's hair strands, without her green knit's collar materials
  mats: { strands: ada.mats.strands },
});

export const elena = deriveLook(lola, {
  id: 'elena',
  name: 'Dr Elena Dither',
  head: { top: -9.8, craniumY: -2.5, R: 7.05, cheekY: 1.7, cheekHW: 6.75, chinY: 8.9, chinHW: 2.6, jawPow: 2.25 },
  eyes: { y: -0.55, x: 2.8, w: 2.55, h: 1.3, iris: [P.brown, P.maroon], lash: P.brown, lashes: true, bags: true },
  brows: { y: -2.3, len: 3.0, thick: 0.42, color: P.steel, arch: 0.3 },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'bob', ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel, edge: P.fog, rimTop: false },
  glasses: { style: 'half', ramp: [P.steel, P.slate, P.ink, P.black] },
  outfit: 'tailored',
  neckline: 'v',
  jacket: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  shirt: { ramp: [P.pink, P.pink, P.skinShade, P.brown], line: P.brown },
  necklace: null,
  earrings: P.silver,
  persona: { sway: 0.5, headMotion: 0.7, blinkMin: 2.8, blinkMax: 6.2, energy: 0.7, smile: 0.12 },
  mats: { hairD: { ramp: [P.white, P.silver, P.fog, P.steel], decal: true } },
  parts: { over: glassesOver },
});

export const EXPERT_LOOKS = { iris, omar, tess, ravi, noor, elena };
