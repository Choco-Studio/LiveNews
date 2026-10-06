// Shared base for presenter looks (owner: PRESENTERS A stream; PRESENTERS B
// imports it read-only).
//
// A look is plain data plus a few drawing hooks:
//   proportions   head, headAt, neck, eyes, brows, nose, mouth, ears, torso, arm (rig units)
//   colour        skin ramp + skinLine, hair, jacket, shirt, tie?, cuff, mustache? ...
//   wardrobe      outfit: a name registered in cast/outfit.js ('suit', 'blazer', ...)
//   persona       idle-layer personality (sway, headMotion, blink range, energy, resting smile)
//   parts         drawing hooks called by character.js at fixed points of the draw order:
//                   hairBack(buf, L, m, head, s, sk)  behind head and neck (group hairBack)
//                   hair(buf, L, m, head, s, sk)      over the head (group hair)
//                   over(buf, L, m, head, s, sk)      after the hair (group over): facial hair,
//                                                     glasses, anything on top of the face
//                   head(buf, L, m, head, s)          replaces head.js drawHead (UNIT-8)
//                   face(buf, L, head, f, s)          replaces face.js drawFace (UNIT-8)
//                   coversEars: true                  hair hides the ears (no drawEars)
//   mats          extra materials { name: { ramp, line, rim?, rimTop?, th?, decal?, noLine? } },
//                 registered by matsOf() under the look's id and reachable as m.<name>
//
// Units are "rig units" (centimetres; 1 u = 1 px in the wide shot). Ramps are
// [highlight, base, shade, deep] from the channel palette (public/js/palette.js);
// no new colours are introduced.
import { P } from '../../../palette.js';
import { material } from '../pixbuf.js';

export const SKIN_LIGHT = [P.cream, P.skin, P.skinShade, P.brown];
export const SKIN_TAN = [P.skin, P.tan, P.tanShade, P.brown];

/** Materials of a look, registered once (cached on the look as L._mats). */
export function matsOf(L) {
  if (L._mats) return L._mats;
  const id = L.id;
  const skinTh = [0.975, -0.1, -0.62];
  const m = {
    skin: material(`${id}:skin`, { ramp: L.skin, line: L.skinLine, th: skinTh }),
    hand: material(`${id}:hand`, { ramp: L.skin, line: L.skinLine, th: [0.96, -0.02, -0.5] }),
    // hair light: by default a silver rim on the top and the right edge (the approved prototype);
    // `hair.rimTop: false` keeps only the right edge (the look paints a partial top light itself, so
    // dark hair does not read as a cap outlined in silver), `hair.rim` picks another palette colour
    hair: material(`${id}:hair`, { ramp: L.hair.ramp, line: L.hair.line, rim: L.hair.rim || P.silver, rimTop: L.hair.rimTop !== false, th: [0.62, 0.08, -0.42] }),
    hairBack: material(`${id}:hairBack`, { ramp: L.hair.ramp, line: L.hair.line, th: [2, 0.55, -0.1] }),
    jacket: material(`${id}:jacket`, { ramp: L.jacket.ramp, line: L.jacket.line, rim: P.silver, th: [0.8, -0.02, -0.5] }),
    // lapels: the jacket's ramp with a softer inner line (its shade tone) where they meet the shirt
    lapel: material(`${id}:lapel`, { ramp: L.jacket.ramp, line: L.jacket.ramp[2], th: [0.8, -0.02, -0.5] }),
    sleeve: material(`${id}:sleeve`, { ramp: L.jacket.ramp, line: L.jacket.line, rim: P.silver, th: [0.94, 0.12, -0.4] }),
    shirt: material(`${id}:shirt`, { ramp: L.shirt.ramp, line: L.shirt.line, th: [0.85, 0.05, -0.4] }),
    cuff: material(`${id}:cuff`, { ramp: [L.cuff, L.cuff, L.shirt.ramp[2], L.shirt.ramp[3]], line: L.shirt.line, th: [0.9, -0.1, -0.6] }),
  };
  // exact skin colours for painted features (lids, nose, folds) so no clean-up pass touches them
  m.skinD = material(`${id}:skinD`, { ramp: L.skin, decal: true });
  if (L.tie) m.tie = material(`${id}:tie`, { ramp: L.tie.ramp, line: L.tie.line, th: [0.9, 0.0, -0.5] });
  // the hairline against the skin: the hair's ramp with a darker LOCAL line (sel-out) instead of the
  // outline colour, used by kit-a selOutEdge; `hair.edge` (palette colour) opts in
  if (L.hair.edge) m.hairEdge = material(`${id}:hairEdge`, { ramp: L.hair.ramp, line: L.hair.edge, th: [0.62, 0.08, -0.42] });
  if (L.mustache) m.mustache = material(`${id}:mustache`, { ramp: L.mustache.ramp, line: L.mustache.ramp[3], noLine: true, th: [0.7, 0.15, -0.3] });
  for (const [name, spec] of Object.entries(L.mats || {})) m[name] = material(`${id}:${name}`, spec);
  L._mats = m;
  return m;
}

/** Fill the fields every look must have, so presenter files only state what is theirs. */
export function defineLook(spec) {
  const L = { parts: {}, mats: {}, mustache: null, ...spec };
  if (!L.parts.hair) throw new Error(`look ${L.id}: parts.hair is required`);
  return L;
}

/**
 * A provisional look made from another presenter's look (placeholder until the
 * presenter's own design lands). Shallow per-field overrides; `parts` merge.
 */
export function deriveLook(base, overrides) {
  const { _mats, ...rest } = base;
  return defineLook({ ...rest, ...overrides, parts: { ...base.parts, ...(overrides.parts || {}) } });
}
