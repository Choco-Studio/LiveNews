// A vertical clip's intro (docs/publishing/shorts-v2.md §6): the owner, 26 Oct, "necesitamos el hook. Podemos usar la
// intro para ello como en los programas: espectacular, que dure 3 segundos como máximo y con una música que mantenga
// atención", and "evita recuadros con texto; si lo haces, que sean letras que tengan que ver con el estilo metidas
// dentro; no hace falta tampoco muchísimo texto"; four seconds at most; "que no sea un cambio de imagen directo". The
// programme's own sequence for a phone on its own grid, before the clip's first frame, with its own theme
// (audio/themes.js introTheme), ending on its emblem and its logotype (no plate, no box); its pixels dissolve away
// over its last beats, the clip showing through with the story's words, the bug and the programme's tag.
//
//   INTROS                           the programmes that have one ({ id: { cues, draw(ctx, t), warm() } })
//   introFor(programId)              its intro, or null
//   introSeconds(programId)          its length (its last frame), or 0
//   introTransition(programId)       how the programme comes in: { seconds }, the intro's pixels dissolving away over
//                                    its last `seconds` (server/publish/render.js introParts)
//   drawIntro(ctx, t, { programId })   the whole frame at t seconds; false when the programme has none
import { COSMOS_INTRO } from '../scenes/opens/cosmosintro.js';
import { TECH_INTRO } from '../scenes/opens/techintro.js';

export const INTROS = Object.freeze({ cosmos: COSMOS_INTRO, 'tech-bytes': TECH_INTRO });

export const introFor = (programId) => INTROS[programId] || null;
export const introSeconds = (programId) => {
  const it = introFor(programId);
  return it ? (it.cues.cut * 60) / it.cues.bpm : 0;
};

/**
 * The way into the programme (the owner, 26 Oct: "que no sea un cambio de imagen directo", then "prefiero un difuminado
 * en el que desaparecen los píxeles en diagonal"): over the intro's last beats (cues `push` to `cut`), the camera still
 * drifting, the intro's pixels dissolve away from the top right corner to the bottom left (the owner: "de arriba derecha
 * a abajo izquierda"), the clip's first frames showing through (render.js introParts). null without an intro.
 */
export function introTransition(programId) {
  const it = introFor(programId);
  if (!it) return null;
  return { seconds: ((it.cues.cut - it.cues.push) * 60) / it.cues.bpm };
}

/** The intro's frame at t seconds. */
export function drawIntro(ctx, t, { programId } = {}) {
  const it = introFor(programId);
  if (!it) return false;
  it.draw(ctx, t);
  return true;
}
