// Per-programme dressing and light for the 2.5D studio (owner: STUDIO SET).
//
// One network studio, five personalities (docs/programmes/*.md "Set and light",
// digest in $SP/v2/PLAN.md §9; the bibles win). A style only changes what the
// bibles allow a programme to change: the light (pools, practicals, value
// range), the scenery tint, the accent line on the desk, the bezel and the
// wall's idle content. Architecture, the red desk plate and the camera
// grammar stay the network's.
//
//   styleFor(id)   frozen style for a programme id (unknown ids: the generic
//                  home look, keeping their own id); pure and cached
//   setStyle(id)   the same, and it becomes the default style for calls that
//                  pass none (the old drawBackground(frame, cam, t) form)
//   STYLE_IDS      the five programmes of config/channel.json
//
// Light is described in "ramp positions" on the neutral ramp
// black 0, ink 1, slate 2, steel 3, fog 4: the set bakes them into a texture
// and renders them with Bayer 4x4 between adjacent steps (set.js). Tints are
// palette swaps inside named pools (ink→maroon, slate→brown, ink→purple), so
// every pixel stays a palette colour; a tint budget is the share of set
// pixels drawn in the tint colours.
import { C } from '../pixbuf.js';

export const STYLE_IDS = ['world-now', 'tech-bytes', 'cosmos', 'money-minute', 'news-60'];

// Seat pools: one soft pool from above behind each head (ART_DIRECTION
// "head zones ... one soft light pool from above"). Back-wall world units:
// X ±104 projects onto the wide heads at x 118 / 266.
const duoPools = (amount, ry = 104, rx = 80) => [
  { X: -104, Y: -84, rx, ry, amount },
  { X: 104, Y: -84, rx, ry, amount },
];

const BASE = {
  theme: 'world',
  accentName: 'red',
  deskLineName: 'red',
  wallIdle: 'globe',
  solo: false,
  // back wall light (set.js bake)
  base: 1.0, // ramp position of the unlit wall (1 = ink)
  top: { y0: -150, y1: -118, to: 0 }, // above y0 the wall is `to`, easing in from y1 (black above y 10 in the wide)
  sides: { x0: 186, x1: 262 }, // |X| where the falloff to black starts / ends (screen x 60 / ~4 in the wide)
  pools: duoPools(1.05),
  glow: 0.35, // cool spill of the wall onto the wall around it (ramp steps at the bezel)
  tintPools: [],
  tints: null, // { slate: 'brown', ink: 'maroon' }: palette swap inside the tint pools (set.js tintPools)
  tintNames: [],
  tintMax: 0,
  seams: true, // matte panel seams outside the head zones
  flats: true, // black set flats at the sides (Z = SET.flatsZ)
  practical: 'cool', // 'cool' strip | 'warm' sconces | 'softbox' edge | 'off'
  bezel: { base: 'steel', top: 'silver', left: 'fog', soft: 'slate' },
  deskTop: 'slate',
  floor: 'black',
  wallMaxL: 45, // mean L* ceiling of the wall content (ART_DIRECTION values)
  wallField: ['navy', 'ink'], // idle field: top colour → bottom colour (Bayer)
  wallBand: [0.2, 0.6], // where the field's top colour falls to its bottom colour (share of the height): navy only up top
  pictureMat: 0, // world units of black mat around wall pictures (TECH BYTES: 2 px in the wide)
  values: { face: [55, 73], headZone: [18, 45], wall: 45 },
};

const DEFS = {
  // The home look: no extra tint, practicals cool, navy wall with ink falloff,
  // the desk plate the only red block (world-now.md "Set and light").
  'world-now': {},
  // "Product studio after hours": a lighter neutral cove lit in pools, steel plinth
  // desk, one cyan line, slate bezel, no ambient effect, no flats (tech-bytes.md §3.4).
  'tech-bytes': {
    theme: 'tech',
    accentName: 'cyan',
    deskLineName: 'cyan',
    wallIdle: 'chip',
    base: 1.0,
    // slate head zones grading to ink by y ~30 (Y -91) and black above y 10 (Y -119)
    cove: { slate: 2.0, y0: -128, y1: -96 },
    top: { y0: -136, y1: -119, to: 0 },
    sides: { x0: 180, x1: 262 },
    // one soft pool from above behind each head: its steel heart sits above the hair (centre Y -106,
    // y ~13 in the wide, tall: light from above) and its Bayer edge clear of the head, so the cove's flat slate is all the
    // head ring sees (Max's darker skin keeps 25+ L* over it)
    // each a downlight's wash from the ceiling line: brightest at the top by its source, narrower there
    // and widening as it falls, fading toward its foot above the hair, a narrow Bayer edge on the lower
    // arc (no free-floating oval with a dithered ring)
    pools: [
      { X: -104, Y: -118, rx: 40, ry: 24, below: 2.55, flare: 0.3, edge: 0.24, fade: 0.55, amount: 0.95 },
      { X: 104, Y: -118, rx: 40, ry: 24, below: 2.55, flare: 0.3, edge: 0.24, fade: 0.55, amount: 0.95 },
    ],
    poolMax: 3.0, // a pool centre is at most steel
    glow: 0.15,
    seams: false,
    flats: false,
    practical: 'softbox',
    bezel: { base: 'slate', top: 'steel', left: 'steel', soft: 'slate' },
    deskTop: 'steel',
    wallField: ['ink', 'ink'],
    pictureMat: 2.8,
    values: { face: [55, 73], headZone: [28, 35], wall: 45, cyanMax: 0.01 },
  },
  // One step darker: black, ink and slate; purple tint ≤ 12 %; the magenta desk line the only accent (cosmos.md).
  cosmos: {
    theme: 'space',
    accentName: 'magenta',
    deskLineName: 'magenta',
    wallIdle: 'planet',
    // a flat black wall (no dithered "dark grey") and one ink pool from above behind each seat with a
    // Bayer edge: the darkest room, lit only where the presenters sit. No purple scenery tint (the
    // bible allows up to 12 %, it does not ask for it): every coloured light tried on the flanks or
    // the wall's foot read as a club or a sunset; the magenta desk line is the programme's colour
    base: 0.1,
    pools: duoPools(1.08, 96, 74),
    tintPools: [],
    tints: null,
    tintNames: ['purple', 'maroon'],
    tintMax: 0.12,
    glow: 0.2,
    // its own colour, in the one place ART_DIRECTION allows a set colour besides the accent line: the
    // symmetric pair of practicals, here two dim purple strips on the flats (a gel'd uplight seen
    // edge-on: an ink housing, a purple core, no glow, no wash on the wall)
    practical: 'purple',
    bezel: { base: 'slate', top: 'steel', left: 'steel', soft: 'ink' },
    wallField: ['black', 'black'],
    wallMaxL: 40,
    values: { headZone: [0, 35], wall: 40, faceOver: 20, tintMax: 0.12 },
  },
  // "After the close": the home value range, warm practical pools outside the head
  // zones, a steady darkGreen desk line, the wordmark wall (money-minute.md §3.4).
  'money-minute': {
    theme: 'money',
    accentName: 'green',
    deskLineName: 'darkGreen',
    wallIdle: 'wordmark',
    solo: true,
    base: 1.0,
    // the home seat light (WORLD NOW's pool, centred on the solo seat): a flat slate plateau around the
    // video wall, Penny and both lamps, with a narrow Bayer edge (one clean outline, not a lumpy cloud
    // where the lamps' light met its falloff)
    pools: [{ X: 0, Y: -64, rx: 178, ry: 110, edge: 0.14, amount: 1.05 }],
    // the warm room: a pair of hand-pixelled bronze up/down sconces centred on the panels either side
    // of the wall (set.js drawSconce). Their light on the panel is NEUTRAL (ART_DIRECTION: Bayer only
    // between adjacent ramp steps): a scallop up and one down from each shade's openings, slate lifted
    // to steel near the lamp, fanning out and fading with a rounded end. The warmth is the fixture's
    // own bronze, tan and cream (no warm dots or warm blocks on the wall)
    scallops: [-112, 112].map((X) => ({ X, Y: -55, gap: 6, up: 42, down: 28, w0: 4, spread: 0.42, edge: 0.32, round: 1.3, amount: 1.0 })),
    sconceY: -55,
    sconces: [-112, 112], // set.js drawWallDetails draws the fixtures here
    tintPools: [],
    tints: null,
    tintNames: ['maroon', 'brown', 'cream', 'tanShade', 'tan'],
    tintMax: 0.08,
    practical: 'warm',
    sides: { x0: 214, x1: 270 },
    // the solo seat is always in front of the wall, so the wall's field IS the head-zone ground: a
    // flat slate field (the home value range around Penny's head, as WORLD NOW's slate pools), with
    // the bible's 12 px Bayer falloff from ink under the top bezel
    wallField: ['slate', 'slate'],
    wallTop: 'ink',
    values: { face: [55, 73], headZone: [18, 45], wall: 45, saturatedMax: 0.1, tintMax: 0.08 },
  },
  // One step darker: black and ink with a Bayer falloff to slate behind the head; yellow only on
  // the dial ticks and a 1 px desk LED; cream tint ≤ 4 % (news-60.md "Set and light").
  'news-60': {
    theme: 'flash',
    accentName: 'yellow',
    deskLineName: 'yellow',
    wallIdle: 'dial',
    solo: true,
    // a flat black wall and one downlight from above on the seat: a flat ink scallop, narrower at
    // the top and widening to its foot, a narrow Bayer edge (no dithered ring around the wall), the
    // foot fading back to black (the presenter alone in the light)
    base: 0.1,
    pools: [
      { X: 0, Y: -84, rx: 112, ry: 98, below: 1.1, flare: 0.32, edge: 0.2, fade: 0.55, amount: 1.05 },
      // brighter near its source: an ink → slate lift at the top of the beam, above the wall
      { X: 0, Y: -124, rx: 64, ry: 26, edge: 0.6, amount: 0.62 },
    ],
    poolMax: 2.0, // never brighter than slate around the head
    tintPools: [],
    tints: null, // the cream tint (≤ 4 %) is left out: orange or cream next to yellow reads as candy
    tintNames: ['maroon', 'cream'],
    tintMax: 0.04,
    glow: 0.15,
    practical: 'off',
    bezel: { base: 'slate', top: 'steel', left: 'steel', soft: 'ink' },
    // a flat ink field: no value transition anywhere behind Sam's head, and the solo band at the
    // wall's foot is only a place where no content goes (same ink), never a darker slab
    wallField: ['ink', 'ink'],
    values: { face: [60, 100], ringMean: 35, ringMax: 45, wall: 45, yellowMax: 0.015, saturatedMax: 0.06, tintMax: 0.04 },
  },
};

const CACHE = new Map();

function build(id) {
  const def = DEFS[id] || {};
  const s = { ...BASE, ...def, id: id || 'generic', known: id in DEFS };
  s.accent = C[s.accentName];
  s.deskLine = C[s.deskLineName];
  s.bezel = { ...BASE.bezel, ...(def.bezel || {}) };
  s.values = Object.freeze({ ...s.values });
  for (const k of ['pools', 'tintPools', 'scallops', 'glows']) s[k] = Object.freeze((s[k] || []).map((p) => Object.freeze({ ...p })));
  // the bake key: styles with identical light share one baked texture
  s.bakeKey = DEFS[id] ? id : 'world-now';
  return Object.freeze(s);
}

/** The style of a programme (pure, cached). Unknown or missing ids get the home look. */
export function styleFor(id) {
  const key = typeof id === 'string' && id ? id : 'world-now';
  let s = CACHE.get(key);
  if (!s) {
    s = build(key);
    if (CACHE.size > 32) CACHE.clear(); // ids come from live episodes: keep the table bounded
    CACHE.set(key, s);
  }
  return s;
}

let current = styleFor('world-now');

/** Pick the style for a programme and make it the default for calls that pass none. */
export function setStyle(id) {
  current = styleFor(id);
  return current;
}

/** The current default style (the last setStyle, the home look before any). */
export const currentStyle = () => current;

/** A style object, programme id or nothing → a style. */
export function resolveStyle(s) {
  if (s && typeof s === 'object' && s.bakeKey) return s;
  if (typeof s === 'string') return styleFor(s);
  return current;
}
