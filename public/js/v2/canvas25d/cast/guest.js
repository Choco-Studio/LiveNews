// Re-staged guests (IN THEIR WORDS, owner 12 Oct; server/guests/restage.js): a public figure a story quotes
// appears in a press room and says their own sourced words, a RECREATION labelled as one. The server books them with
// a LookSpec v1 (docs/roadmap/WAVE3.md §3.6, seeded from the person's id); this file turns it into a v2 look on the
// channel's proven parts:
//   hair     the presenters' and experts' drawers by style (cast/paco.js, lola.js, sam.js, penny.js, max.js,
//            ada.js, nova.js, hair-experts.js, correspondents.js), plus a bald crown with clipped sides of its own
//   face     a generic adult face seeded from the id inside narrow ranges (no feature exaggerated: a recreation,
//            never a caricature), lids heavier with age, no resting smile
//   skin     the six LookSpec tones on the palette's warm ramps only (deep skin lit as Nova's: drawWarmHead)
//   beard    Max's trimmed beard (a close one for stubble), Paco's moustache; glasses by FACES (Ada's drawSpecs)
//   wear     the wardrobe's tailoring (cast/outfit.js): a suit with a plain tie or an open collar, a blazer over a
//            top, a tailored jacket over a blouse; sober colours (never the programme accents red, green, cyan)
// A guest is never a presenter's, a correspondent's or an expert's twin (owner 12 Oct: borrowed hair in the same colour
// read as twins): a guest whose hair drawer and colour family match one of the cast's (NAMED_DRAWER) and who shares one
// more cue with them (the skin's group, glasses, a beard or a moustache: likeness >= TWIN_AT; an anchor's hair and
// colour alone are enough) takes the style's next
// drawer, else the next colour (TWIN_STEPS), else the other frame, else no glasses. No earpiece and no lapel
// microphone (those mark the channel's own people).
// Materials are shared by colour (base.js matKeys: guest:<part>:<colour>), never registered per guest, so a 24/7 run
// with hundreds of guests keeps the material table bounded; looks are cached by id (the last CACHE_MAX).
//
//   buildGuestLook(booking)       the look of a booking { id, look: LookSpec, name?, role? } (deterministic)
//   guestLook(id, booking?)       the cached look for a guest id (rp_…); a missing booking gets a seeded generic look
//   isGuestId(id)                 a re-staged guest's id (rp_…)
//   guestSpec(id, spec)           the LookSpec as drawn (validated, the twin guard applied)
//   SKIN_RAMPS, HAIR_RAMPS        the palette ramps of the spec's skin and hair colours
import { P } from '../../../palette.js';
import { toneN } from '../pixbuf.js';
import { GROUPS } from '../character.js';
import { deriveLook, SKIN_LIGHT, SKIN_TAN } from './base.js';
import { LocalXY, localBox, HeadWidthLUT, selOutEdge, hairLight, rimMat } from './kit-a.js';
import { paco, drawShortHair, drawMustache } from './paco.js';
import { lola, drawBob, drawBobBack } from './lola.js';
import { penny, drawSleek, drawChignon } from './penny.js';
import { sam, drawCrop } from './sam.js';
import { max, drawTextured, drawBeard } from './max.js';
import { ada, drawStraight, drawHairBack, drawSpecs } from './ada.js';
import { nova, drawCoils, drawHaloBack, drawWarmHead } from './nova.js';
import { rhea, vic, mika, drawWaveCrop, drawFringeBob } from './correspondents.js';
import { EXPERTS } from './experts.js';
import { kai, rosa } from './full-time.js';
import { qm } from './pay-attention.js';
import { drawReceding, drawPixie, drawHighTop, drawMop, drawWaves, drawWavesBack, drawBraids, drawBraidsBack } from './hair-experts.js';
import { tier, hashInt } from './wardrobe-b.js';

/** A re-staged guest's id (server/guests/restage.js bookGuest: rp_<hash>). */
export const isGuestId = (id) => typeof id === 'string' && id.startsWith('rp_');

// ------------------------------------------------------------------------------------------------ the palette

// the six LookSpec skins on the warm ramps [highlight, base, shade, deep] (no new colours)
export const SKIN_RAMPS = {
  porcelain: [P.cream, P.cream, P.skin, P.skinShade],
  light: SKIN_LIGHT,
  medium: [P.skin, P.tan, P.skinShade, P.tanShade],
  tan: SKIN_TAN,
  brown: [P.tan, P.skinShade, P.tanShade, P.brown],
  deep: [P.tan, P.tanShade, P.brown, P.maroon],
};
const DEEP = new Set(['brown', 'deep']);
// hair: the ramp, its outline, the softer local line where it meets the skin (sel-out), whether the silver hair
// light caps the top (pale hair) or stays on the upper right (dark hair outlined in silver read as a helmet)
export const HAIR_RAMPS = {
  black: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black, edge: P.ink, rimTop: false },
  'dark-brown': { ramp: [P.brown, P.maroon, P.black, P.black], line: P.black, edge: P.maroon, rimTop: false },
  brown: { ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black, edge: P.maroon, rimTop: false },
  auburn: { ramp: [P.rust, P.brown, P.maroon, P.black], line: P.black, edge: P.maroon, rimTop: false },
  blonde: { ramp: [P.cream, P.tan, P.tanShade, P.brown], line: P.brown, edge: P.tanShade, rimTop: false },
  grey: { ramp: [P.silver, P.fog, P.steel, P.slate], line: P.slate, edge: P.steel, rimTop: true },
  white: { ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel, edge: P.fog, rimTop: true },
  'salt-pepper': { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink, edge: P.slate, rimTop: true },
};
const BROWS = { black: P.black, 'dark-brown': P.maroon, brown: P.brown, auburn: P.brown, blonde: P.tanShade, grey: P.steel, white: P.fog, 'salt-pepper': P.slate };
// suits (LookSpec wear.main): deep, quiet cloth, a step darker than the face
const SUITS = {
  navy: { ramp: [P.steel, P.navy, P.ink, P.black], line: P.black },
  charcoal: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  slate: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.black },
  brown: { ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black },
  plum: { ramp: [P.magenta, P.purple, P.ink, P.black], line: P.black },
};
const SHIRTS = {
  white: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel, cuff: P.white },
  pale: { ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel, cuff: P.silver },
  cream: { ramp: [P.white, P.cream, P.fog, P.steel], line: P.steel, cuff: P.cream },
  ink: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black, cuff: P.ink },
};
// plain ties: never red (WORLD NOW's accent and Paco's tie), green (MONEY MINUTE) or cyan (TECH BYTES)
const TIES = {
  navy: { ramp: [P.blue, P.navy, P.ink, P.black], line: P.black },
  burgundy: { ramp: [P.darkRed, P.maroon, P.black, P.black], line: P.black },
  silver: { ramp: [P.silver, P.fog, P.steel, P.slate], line: P.slate },
  gold: { ramp: [P.cream, P.tan, P.tanShade, P.brown], line: P.brown },
  purple: { ramp: [P.magenta, P.purple, P.maroon, P.black], line: P.black },
};
const FRAMES = { rect: [[P.slate, P.ink, P.black, P.black], [P.steel, P.slate, P.ink, P.black]], round: [[P.tanShade, P.brown, P.maroon, P.black], [P.fog, P.steel, P.slate, P.ink]] };

// ------------------------------------------------------------------------------------------------ the spec

const pick = (v, list, d) => (list.includes(v) ? v : d);
const STYLES = ['bald', 'crop', 'short-side', 'short-textured', 'quiff', 'curly-short', 'coily-short', 'bob', 'long-straight', 'long-wavy', 'bun', 'ponytail', 'braids'];

/** A seeded generator from a string (FNV-1a into mulberry32): the same person, the same draws. */
function seeded(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const from = (r, list) => list[Math.floor(r() * list.length) % list.length];
const span = (r, a, b) => a + (b - a) * r();

/** A spec with every field known (unknown values take a default), or a seeded generic one when there is none. */
function validSpec(id, spec) {
  const r = seeded(`spec|${id}`);
  const s = spec && typeof spec === 'object' ? spec : {};
  const presentation = pick(s.presentation, ['man', 'woman', 'neutral'], from(r, ['man', 'woman']));
  const age = pick(s.age, ['adult', 'middle', 'senior'], 'middle');
  const style = pick(s.hair?.style, STYLES, presentation === 'woman' ? 'bob' : 'short-side');
  const colour = style === 'bald' ? 'none' : pick(s.hair?.colour, Object.keys(HAIR_RAMPS), age === 'senior' ? 'grey' : 'dark-brown');
  return {
    v: 1,
    presentation,
    age,
    build: pick(s.build, ['slight', 'average', 'broad'], 'average'),
    skin: pick(s.skin, Object.keys(SKIN_RAMPS), 'light'),
    hair: { style, colour, parting: pick(s.hair?.parting, ['left', 'right', 'none'], 'left'), receding: Math.max(0, Math.min(1, Number(s.hair?.receding) || 0)) },
    facialHair: { style: presentation === 'man' ? pick(s.facialHair?.style, ['none', 'stubble', 'short-beard', 'moustache'], 'none') : 'none' },
    glasses: pick(s.glasses, ['none', 'rect', 'round'], 'none'),
    wear: {
      outfit: pick(s.wear?.outfit, ['suit', 'blazer'], 'suit'),
      main: pick(s.wear?.main, Object.keys(SUITS), 'navy'),
      tie: presentation === 'man' ? pick(s.wear?.tie, ['plain', 'none'], 'plain') : 'none',
    },
  };
}

// ------------------------------------------------------------------------------------------------ hair drawers

// the drawers a guest's hair may wear: `key` names the drawer (the twin guard compares keys), `ok(colour)` the
// colours it was painted for (drawReceding's salt dashes are silver, drawHighTop's faded sides maroon)
const BOB = { key: 'bob', hair: (b, L, m, h, s, sk) => drawBob(b, L, m, h, s, sk.hairLag || 0), back: drawBobBack, covers: true };
const DRAWERS = {
  bald: { key: 'bald', hair: drawBald },
  shortHair: { key: 'shortHair', hair: drawShortHair },
  receding: { key: 'receding', hair: drawReceding, ok: (c) => c === 'grey' || c === 'white' || c === 'salt-pepper' },
  crop: { key: 'crop', hair: drawCrop },
  textured: { key: 'textured', hair: drawTextured },
  waveCrop: { key: 'waveCrop', hair: drawWaveCrop },
  highTop: { key: 'highTop', hair: drawHighTop, ok: (c) => c === 'black' || c === 'dark-brown' },
  coils: { key: 'coils', hair: drawCoils, back: drawHaloBack, halo: { cy: -3.4, rx: 8.7, up: 8.4, down: 3.4, taper: 0.35, brow: 3.7 } },
  mop: { key: 'mop', hair: drawMop },
  pixie: { key: 'pixie', hair: drawPixie },
  bob: BOB,
  fringeBob: { key: 'fringeBob', hair: drawFringeBob, back: drawBobBack, covers: true },
  straight: { key: 'straight', hair: drawStraight, back: drawHairBack },
  waves: { key: 'waves', hair: drawWaves, back: drawWavesBack, covers: true },
  sleek: { key: 'sleek', hair: (b, L, m, h, s) => drawSleek(b, L, m, h, s), back: drawChignon },
  // (light braids read as a ridged hood: the drawer's ridges were painted for dark hair; pale hair is pulled back)
  braids: { key: 'braids', hair: drawBraids, back: drawBraidsBack, ok: (c) => !['blonde', 'auburn', 'white', 'grey'].includes(c) },
};
// each style's drawers, the first that fits wins
const BY_STYLE = {
  bald: ['bald'],
  crop: { man: ['crop', 'waveCrop'], woman: ['pixie', 'crop'], neutral: ['pixie', 'crop'] },
  'short-side': ['shortHair', 'receding', 'crop'],
  'short-textured': ['textured', 'crop'],
  quiff: ['textured', 'shortHair', 'crop'],
  'curly-short': ['mop', 'coils', 'crop'],
  'coily-short': ['waveCrop', 'coils', 'highTop', 'crop'],
  bob: ['bob', 'fringeBob'],
  'long-straight': ['straight', 'waves'],
  'long-wavy': ['waves', 'straight'],
  bun: ['sleek'],
  ponytail: ['sleek'],
  braids: ['braids', 'sleek'],
};
// a receding hairline (senior men) moves short hair to the receding drawer when its colours allow
const RECEDE_AT = 0.3;

// The channel's own people: the drawer each one's hair is (the twin guard). FULL TIME's presenters by what the eye
// reads of the look on air (full-time-looks.js): a pulled-back cut reads as the guests' sleek drawer (Rosa A's
// ponytail, B's cornrows), a shaved head as a relative of their bald crown (Kai A), the rest by their own silhouette.
const FT_DRAWER = { shaved: 'shaved', topknot: 'sleek', curtains: 'curtains', ponytail: 'sleek', cornrows: 'sleek', curls: 'mop' };
// PAY ATTENTION's host (pay-attention-looks.js) by what the eye reads of the look on air: the pompadour a short cut with
// lift (the guests' textured drawer); no guest drawer draws two puffs or a hijab, so those keep keys of their own
const QM_DRAWER = { puffs: 'puffs', pompadour: 'textured', hijab: 'hijab' };
const NAMED_DRAWER = { paco: 'shortHair', lola: 'bob', sam: 'crop', penny: 'sleek', max: 'textured', ada: 'straight', nova: 'coils', kai: FT_DRAWER[kai.hair.style] || 'crop', rosa: FT_DRAWER[rosa.hair.style] || 'sleek', qm: QM_DRAWER[qm.hair.style] || 'sleek', rhea: 'sleek', vic: 'waveCrop', mika: 'fringeBob', omar: 'receding', clara: 'pixie', dev: 'highTop', tomas: 'ring', june: 'undercut', amara: 'braids', leo: 'mop', ines: 'waves' };
const NAMED_LOOKS = { paco, lola, sam, penny, max, ada, nova, kai, rosa, qm, rhea, vic, mika, ...EXPERTS };
export const NAMED_IDS = Object.keys(NAMED_DRAWER);

/** A hair ramp's colour family: what the eye reads at 1x (dark, brown, red, light, grey). */
export function hairFamily(ramp) {
  if (ramp[0] === P.rust || ramp[0] === P.orange) return 'red';
  if ([P.fog, P.steel, P.silver, P.white].includes(ramp[1])) return 'grey';
  if (ramp[1] === P.tan || ramp[1] === P.cream) return 'light';
  if (ramp[1] === P.brown || ramp[1] === P.tanShade) return 'brown';
  if ([P.ink, P.slate, P.black, P.maroon].includes(ramp[1])) return 'dark';
  return 'other';
}
/** A skin ramp's group: pale, mid or deep (by its base tone). */
export function skinGroup(ramp) {
  if (ramp[1] === P.skin || ramp[1] === P.cream) return 'pale';
  if (ramp[1] === P.tan) return 'mid';
  return 'deep';
}
// drawers that read alike at 1x (a bald crown and the professor's ring or a shaved head, a bob and a fringed bob, ...)
const RELATED = { bald: ['ring', 'shaved'], ring: 'bald', shaved: 'bald', bob: 'fringeBob', fringeBob: 'bob', crop: 'waveCrop', waveCrop: 'crop', straight: 'waves', waves: 'straight', coils: 'highTop', highTop: 'coils' };
const related = (a, b) => {
  const r = RELATED[a];
  return r === b || (Array.isArray(r) && r.includes(b));
};
// at this likeness or more a guest is a twin: the same drawer in the same colour family (4) and one more cue shared
// (the skin's group, glasses, a beard or a moustache); for the anchors the same hair in the same colour is enough
// (the channel's faces viewers know best). A guest whose hair has another silhouette is never anyone's twin.
export const TWIN_AT = 4.5;
// (Kai is not one: his face at 1x is the dome and the beard together, so a bald guest without a beard is nobody's twin)
const ANCHORS = new Set(['paco', 'lola', 'sam', 'penny', 'max', 'ada', 'nova', 'rosa']);
let NAMED_FEATURES = null;
/** What the eye reads of each face of the channel at 1x: { id, drawer, family, skin, glasses, facial } (built once). */
export function namedFeatures() {
  if (!NAMED_FEATURES) {
    NAMED_FEATURES = [];
    for (const [id, drawer] of Object.entries(NAMED_DRAWER)) {
      const L = NAMED_LOOKS[id];
      if (!L?.hair?.ramp || !L.skin) continue;
      NAMED_FEATURES.push({ id, drawer, family: hairFamily(L.hair.ramp), skin: skinGroup(L.skin), glasses: L.glasses?.style || 'none', facial: L.beard ? 'beard' : L.mustache ? 'moustache' : 'none' });
    }
  }
  return NAMED_FEATURES;
}
/** How alike two faces read (TWIN_AT and over: a twin). */
export function likeness(a, b) {
  let k = a.drawer === b.drawer ? 2 : related(a.drawer, b.drawer) ? 1 : 0;
  if (a.family === b.family) k += 2;
  if (a.skin === b.skin) k += 1;
  if (a.glasses !== 'none' && b.glasses !== 'none') k += a.glasses === b.glasses ? 1.5 : 1;
  if (a.facial !== 'none' && a.facial === b.facial) k += 1;
  return k;
}
/** The named face a guest's features would twin (a hair of the same silhouette, and enough else alike), or null. */
export function twinOf(f) {
  for (const n of namedFeatures()) {
    if (f.drawer !== n.drawer && !related(f.drawer, n.drawer)) continue;
    if (likeness(f, n) >= TWIN_AT || (ANCHORS.has(n.id) && f.family === n.family)) return n.id;
  }
  return null;
}
// the colour a hair steps to when its drawers would make a twin (a neighbour, darker or lighter)
const TWIN_STEPS = { black: 'brown', 'dark-brown': 'brown', brown: 'dark-brown', auburn: 'brown', blonde: 'brown', grey: 'white', white: 'salt-pepper', 'salt-pepper': 'white' };
const facialOf = (spec) => (spec.facialHair.style === 'moustache' ? 'moustache' : spec.facialHair.style === 'none' ? 'none' : 'beard');
// a bald crown's clipped sides: grey on a senior, else dark brown
const bandColour = (spec) => (spec.age === 'senior' ? 'grey' : 'dark-brown');

/**
 * The drawer, colour and glasses a spec is drawn with: the spec's own when they make no twin; else, in order, the
 * style's next drawer, the next colour, the other frame, and last no glasses. -> { drawer, colour, glasses, twin }
 */
function hairOf(spec) {
  const skin = skinGroup(SKIN_RAMPS[spec.skin]);
  const facial = facialOf(spec);
  const list = BY_STYLE[spec.hair.style];
  let keys = Array.isArray(list) ? list.slice() : list[spec.presentation] || list.man;
  if (spec.hair.receding >= RECEDE_AT && ['short-side', 'crop', 'short-textured'].includes(spec.hair.style)) keys = ['receding', ...keys.filter((k) => k !== 'receding')];
  const colours = [spec.hair.colour];
  while (colours.length < 3 && colours.at(-1) !== 'none') colours.push(TWIN_STEPS[colours.at(-1)]);
  // a bald crown has no colour to step but its clipped sides: they go grey (Kai's shaved head and black beard)
  if (colours[0] === 'none') colours.push(spec.age === 'senior' ? 'white' : 'salt-pepper');
  const g = spec.glasses;
  const frames = g === 'none' ? ['none'] : [g, g === 'rect' ? 'round' : 'rect', 'none'];
  let first = null;
  for (const gl of frames) {
    for (const colour of colours) {
      const fam = hairFamily(HAIR_RAMPS[colour === 'none' ? bandColour(spec) : colour].ramp);
      for (const k of keys) {
        const d = DRAWERS[k];
        if (d.ok && !d.ok(colour)) continue;
        first ||= { drawer: d, colour, glasses: gl };
        if (!twinOf({ drawer: d.key, family: fam, skin, glasses: gl, facial })) return { drawer: d, colour, glasses: gl, twin: null };
      }
    }
  }
  // (never reached with the tables above: with no glasses some colour of the style's drawers is always free)
  return { ...(first || { drawer: DRAWERS.crop, colour: spec.hair.colour, glasses: 'none' }), twin: 'unresolved' };
}

/** The spec as it is drawn: validated, the twin guard applied (the hair's colour or the glasses may step aside). */
export function guestSpec(id, spec) {
  const v = validSpec(id, spec);
  const h = hairOf(v);
  return { ...v, hair: { ...v.hair, colour: h.colour, drawer: h.drawer.key }, glasses: h.glasses, twin: h.twin };
}

/** The features of a drawn spec (the twin guard's terms): { drawer, family, skin, glasses, facial }. */
export function guestFeatures(drawn) {
  const colour = drawn.hair.colour === 'none' ? bandColour(drawn) : drawn.hair.colour;
  return { drawer: drawn.hair.drawer, family: hairFamily(HAIR_RAMPS[colour].ramp), skin: skinGroup(SKIN_RAMPS[drawn.skin]), glasses: drawn.glasses, facial: facialOf(drawn) };
}

// ------------------------------------------------------------------------------------------------ the bald crown

const LXY = new LocalXY();
const HWL = new HeadWidthLUT();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A bald crown with the sides clipped close: nothing on top (head.js's own skin and light read as the scalp), a
 * short band of hair from the temple round above the ear and down to a short sideburn, receding a little higher at
 * the back of the temple. Lit like the sides of the presenters' crops: the lit side a step lighter, short comb lines
 * at close-ups, the hairline a sel-out line; the wide keeps two tones.
 */
function drawBald(buf, L, m, head, s) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const earTop = E.y - E.h * 0.5;
  const top = H.craniumY - 0.9; // the band's top at the temple
  const [x0, y0, x1, y1] = localBox(head, -H.R - 0.8, top - 1, H.R + 0.8, E.y + 0.8);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const mt = m.hx;
  const px1 = 1 / s;
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    const ax = Math.abs(x);
    const hw = HW.at(y);
    if (ax > hw + 0.35 || y > E.y + 0.2) return -1;
    // the band hugs the skull's side: ~1.1 u deep at the temple, ~1.5 u above the ear
    const depth = 1.05 + 0.5 * clamp01((y - top) / (earTop - top));
    // its top edge rises toward the back (the visible part is the side): a soft curve, broken at close-ups
    let edge = top + (hw - ax) * 0.35;
    if (tr === 2 && hashInt(Math.floor(y * s + 256), 41) < 0.35) edge += px1;
    if (y < edge || ax < hw - depth) return -1;
    // the ear interrupts it: in front of the ear a short sideburn, behind it nothing shows from the front
    if (y > earTop + 0.2 && ax > hw - 0.25) return -1;
    if (y > earTop && ax < hw - 1.0) return -1;
    if (tr === 0) return x > 0 ? 2 : 1;
    let t = toneN(mt, (x / (H.R + 0.5)) * 0.95, ((y - H.craniumY) / (H.R + 0.5)) * 0.95);
    t = x > 0 ? Math.max(t, 2) : Math.min(Math.max(t, 1), 1);
    if (tr === 2 && ((y * 2.1 + x * 0.4) % 1.5 + 1.5) % 1.5 < 0.4) t = Math.min(3, t + 1); // short comb lines
    if (y < edge + px1 * 1.1) t = Math.max(t, 2); // thin where it starts
    return t;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, mt, m.hxE);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.5, H.R + 1, top - 1, earTop, Math.max(2, Math.round(s)));
}

// ------------------------------------------------------------------------------------------------ the look

// the bodies by presentation and build (the presenters' proven torsos, a shade narrower or broader)
const TORSO = {
  man: { neckHW: 3.5, shoulderTop: 2.2, shoulderHW: 21.0, sideHW: 20.0, bottom: 46, vDepth: 25, shoulderJoint: [18.0, 6.6] },
  woman: { neckHW: 3.0, shoulderTop: 3.0, shoulderHW: 18.4, sideHW: 17.2, bottom: 46, vDepth: 16, shoulderJoint: [15.8, 7.0] },
};
TORSO.neutral = { neckHW: 3.25, shoulderTop: 2.6, shoulderHW: 19.6, sideHW: 18.5, bottom: 46, vDepth: 20, shoulderJoint: [16.9, 6.8] };
const BUILD = { slight: 0.965, average: 1, broad: 1.045 };

function torsoOf(p, build) {
  const T = TORSO[p];
  const k = BUILD[build];
  return { ...T, neckHW: T.neckHW * (0.5 + k * 0.5), shoulderHW: T.shoulderHW * k, sideHW: T.sideHW * k, shoulderJoint: [T.shoulderJoint[0] * k, T.shoulderJoint[1]] };
}

const IRIS = {
  pale: [[P.steel, P.slate], [P.brown, P.maroon], [P.darkGreen, P.black], [P.navy, P.ink], [P.tanShade, P.brown]],
  mid: [[P.brown, P.maroon], [P.maroon, P.black], [P.tanShade, P.brown]],
  deep: [[P.maroon, P.black], [P.brown, P.maroon]],
};
const LIPS = {
  porcelain: { lip: P.skinShade, lipHi: P.skin, upper: P.skin },
  light: { lip: P.brown, lipHi: P.skinShade, upper: P.skinShade },
  medium: { lip: P.brown, lipHi: P.skinShade, upper: P.tanShade },
  tan: { lip: P.brown, lipHi: P.tanShade, upper: P.tanShade },
  brown: { lip: P.brown, lipHi: P.tan, upper: P.tanShade },
  deep: { lip: P.maroon, lipHi: P.tan, upper: P.tanShade },
};

/** The over hook: the beard or moustache, then the glasses (no earpiece: a guest is not the channel's). */
function guestOver(buf, L, m, head, s, sk) {
  if (L.beard) drawBeard(buf, L, m, head, s);
  if (L.mustache) drawMustache(buf, L, m, head, s, sk);
  if (L.glasses) drawSpecs(buf, L, m, head, s, sk);
}

// the hair materials every drawer may ask for, by colour (base.js matKeys: shared, never per guest)
const HAIR_MATS = ['hair', 'hairBack', 'hairEdge', 'hairD', 'tex', 'texEdge', 'texD', 'strands', 'coil', 'hx', 'hxD', 'hxE', 'mustache', 'beard', 'beardD'];
function hairMats(h) {
  const { ramp, line, edge } = h;
  const th = [0.62, 0.08, -0.42];
  return {
    hairD: { ramp, decal: true },
    tex: { ramp, line, th },
    texEdge: { ramp, line: edge, th },
    texD: { ramp, decal: true },
    strands: { ramp, line, th },
    coil: { ramp, line, th },
    hx: { ramp, line, th },
    hxD: { ramp, decal: true },
    hxE: { ramp, line: edge, th },
    beard: { ramp, line: edge === P.ink ? P.ink : P.maroon },
    beardD: { ramp, decal: true },
  };
}

/**
 * The v2 look of a booking (deterministic for its id and spec; ~1 ms). booking = { id, look: LookSpec v1, name?,
 * role? }; a booking without a look gets a seeded generic one, still a guest's (never a presenter's).
 */
export function buildGuestLook(booking) {
  const id = String(booking?.id || 'rp_unknown');
  const spec = guestSpec(id, booking?.look);
  const r = seeded(`face|${id}`);
  const p = spec.presentation;
  const man = p === 'man', woman = p === 'woman';
  const senior = spec.age === 'senior', middle = spec.age === 'middle';
  const skinKey = spec.skin;
  const skin = SKIN_RAMPS[skinKey];
  const sg = skinGroup(skin);
  const deep = DEEP.has(skinKey);
  const drawer = DRAWERS[spec.hair.drawer];
  const colour = spec.hair.colour;
  const hk = colour === 'none' ? bandColour(spec) : colour;
  const hair = HAIR_RAMPS[hk];
  const suitKey = spec.wear.main;
  const suit = SUITS[suitKey];
  // the shirt and the tie: a plain tie never in the suit's own colour; a woman's top under a blazer may be dark
  const shirtKey = woman && spec.wear.outfit === 'blazer' ? from(r, ['white', 'cream', 'ink', 'white']) : from(r, ['white', 'white', 'pale', 'cream']);
  const shirt = SHIRTS[shirtKey];
  const tieKeys = Object.keys(TIES).filter((k) => !(k === 'navy' && suitKey === 'navy') && !(k === 'purple' && suitKey === 'plum') && !(k === 'gold' && suitKey === 'brown'));
  const tieKey = man && spec.wear.tie === 'plain' && spec.wear.outfit === 'suit' ? from(r, tieKeys) : null;
  const base = man ? paco : woman ? lola : sam;
  // ---- the face: narrow ranges round the presenters' adult proportions
  const R = man ? span(r, 7.05, 7.55) : woman ? span(r, 6.9, 7.25) : span(r, 6.95, 7.35);
  const head = {
    top: man ? span(r, -10.4, -10.0) : span(r, -10.0, -9.75),
    craniumY: span(r, -2.8, -2.45),
    R,
    cheekY: span(r, 1.45, 1.9),
    cheekHW: R - span(r, 0.3, 0.5),
    chinY: man ? span(r, 9.15, 9.45) : span(r, 8.7, 9.05),
    chinHW: man ? span(r, 2.75, 3.25) : span(r, 2.2, 2.6),
    jawPow: man ? span(r, 2.1, 2.55) : span(r, 1.9, 2.1),
  };
  const iris = from(r, IRIS[sg]);
  const eyes = { y: span(r, -0.7, -0.5), x: span(r, 2.75, 2.95), w: span(r, 2.55, 2.75), h: span(r, 1.32, 1.48), iris, lash: deep || woman ? P.black : P.maroon, lashes: woman, bags: senior || (middle && r() < 0.5) };
  const brows = { y: span(r, -2.55, -2.2), len: span(r, 3.05, 3.35), thick: man ? span(r, 0.48, 0.6) : span(r, 0.42, 0.5), color: deep ? P.black : colour === 'none' ? (senior ? P.steel : P.brown) : BROWS[colour], arch: span(r, 0.22, 0.45) };
  const nose = { y0: span(r, -0.4, -0.2), y1: span(r, 3.2, 3.55), w: deep ? span(r, 1.45, 1.65) : span(r, 1.2, 1.55), big: man && senior && r() < 0.5 };
  const mouth = { y: span(r, 5.7, 6.1), w: span(r, 3.35, 3.75), ...LIPS[skinKey], inner: deep ? P.black : P.maroon, teeth: P.silver, tongue: P.darkRed };
  if (woman && !deep && skinKey !== 'porcelain') mouth.lip = P.darkRed;
  // ---- facial hair, glasses
  const fh = spec.facialHair.style;
  const beard = fh === 'short-beard' ? { ramp: hair.ramp, vol: 0.6 } : fh === 'stubble' ? { ramp: hair.ramp, vol: 0.25 } : null;
  const mustache = fh === 'moustache' ? { ramp: hair.ramp, y: span(r, 4.3, 4.5), w: span(r, 4.5, 5.0), h: span(r, 1.0, 1.2) } : null;
  const glasses = spec.glasses === 'none' ? null : { style: spec.glasses, ramp: from(r, FRAMES[spec.glasses]) };
  // ---- the wear
  const outfit = man || p === 'neutral' ? 'suit' : spec.wear.outfit === 'suit' ? 'tailored' : 'blazer';
  const collar = outfit === 'suit' ? (tieKey ? 'tie' : 'open') : undefined;
  const parts = { hair: drawer.hair, hairBack: drawer.back || null, over: guestOver, coversEars: !!drawer.covers };
  if (deep) parts.head = drawWarmHead;
  const matKeys = {};
  for (const n of ['skin', 'hand', 'skinD', 'handD', 'handLine']) matKeys[n] = `guest:${n}:${skinKey}`;
  for (const n of HAIR_MATS) matKeys[n] = `guest:${n}:${hk}`;
  for (const n of ['jacket', 'lapel', 'sleeve', 'sleeveD', 'sleeveNoRim', 'trousers', 'trouserGap']) matKeys[n] = `guest:${n}:${suitKey}`;
  for (const n of ['shirt', 'cuff']) matKeys[n] = `guest:${n}:${shirtKey}`;
  if (tieKey) matKeys.tie = `guest:tie:${tieKey}`;
  const L = deriveLook(base, {
    id,
    name: booking?.name || booking?.strap?.name || booking?.role || 'Guest',
    guest: true,
    head,
    headAt: man ? [0, -13.4] : woman ? [0, -13.0] : [0, -13.2],
    neck: { hw: man ? span(r, 2.9, 3.1) : span(r, 2.4, 2.6) },
    eyes,
    brows,
    nose,
    mouth,
    ears: { y: -0.1, h: span(r, 2.7, 2.85), w: span(r, 0.95, 1.0) },
    skin,
    skinLine: deep ? P.maroon : P.brown,
    skinLift: deep ? 0.4 : undefined,
    hair: { style: drawer.key, ramp: hair.ramp, line: hair.line, edge: hair.edge, rimTop: hair.rimTop },
    halo: drawer.halo || null,
    // (braids' cuffs in the hair's own colours: no jewellery a guest's spec does not give)
    hoops: [hair.ramp[1], hair.ramp[2]],
    mustache,
    beard,
    glasses,
    earrings: null,
    necklace: null,
    pearls: null,
    pin: null,
    props: [],
    torso: torsoOf(p, spec.build),
    outfit,
    collar,
    neckline: outfit === 'tailored' ? 'blouse' : outfit === 'blazer' ? 'scoop' : undefined,
    lapel: undefined,
    jacket: { ramp: suit.ramp, line: suit.line },
    shirt: { ramp: shirt.ramp, line: shirt.line },
    tie: tieKey ? { ramp: TIES[tieKey].ramp, line: TIES[tieKey].line } : null,
    pocket: false,
    buttons: outfit === 'suit' ? 2 : 1,
    cuff: shirt.cuff,
    // composed and still: a calm head, a slow blink, no resting smile (a recreation is never played for warmth)
    persona: { sway: 0.45, headMotion: 0.55, blinkMin: span(r, 2.6, 3.2), blinkMax: span(r, 5.2, 6.2), energy: 0.55, smile: 0 },
    mats: hairMats(hair),
    matKeys,
    parts,
    spec,
  });
  return L;
}

// the last guests' looks (a bulletin books two at most; a lab shows a dozen): built once each, then dropped
const CACHE_MAX = 32;
const CACHE = new Map();

/** The look of guest `id` (cached); `booking` is the episode's booking for that id (episode.guests[id]). */
export function guestLook(id, booking = null) {
  const key = String(id || 'rp_unknown');
  const spec = booking?.look ? JSON.stringify(booking.look) : '';
  const hit = CACHE.get(key);
  if (hit && hit.spec === spec) {
    CACHE.delete(key);
    CACHE.set(key, hit);
    return hit.look;
  }
  const look = buildGuestLook({ ...(booking || {}), id: key });
  CACHE.delete(key);
  CACHE.set(key, { spec, look });
  while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  return look;
}

/** How many guest looks the cache holds (tests). */
export const guestCacheSize = () => CACHE.size;
