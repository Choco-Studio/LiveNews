// A vertical clip's intro (docs/publishing/shorts-v2.md §6): the owner, 26 Oct, "necesitamos el hook. Podemos usar la
// intro para ello como en los programas: espectacular, que dure 3 segundos como máximo y con una música que mantenga
// atención", and "evita recuadros con texto; si lo haces, que sean letras que tengan que ver con el estilo metidas
// dentro; no hace falta tampoco muchísimo texto". The programme's own sequence for a phone, four beats on its own grid,
// under three seconds, before the clip's first frame, with its own theme (audio/themes.js introTheme). The picture is
// the whole of it: its title is made of the picture's own stuff (COSMOS DESK's of its stars), never a plate; the
// clip brings the story's words, the bug and the programme's tag on its first frame.
//
//   INTROS                           the programmes that have one ({ id: { cues, draw(ctx, t), warm() } })
//   introFor(programId)              its intro, or null
//   introSeconds(programId)          its length (the cut), or 0
//   drawIntro(ctx, t, { programId })   the whole frame at t seconds; false when the programme has none
import { COSMOS_INTRO } from '../scenes/opens/cosmosintro.js';

export const INTROS = Object.freeze({ cosmos: COSMOS_INTRO });

export const introFor = (programId) => INTROS[programId] || null;
export const introSeconds = (programId) => {
  const it = introFor(programId);
  return it ? (it.cues.cut * 60) / it.cues.bpm : 0;
};

/** The intro's frame at t seconds. */
export function drawIntro(ctx, t, { programId } = {}) {
  const it = introFor(programId);
  if (!it) return false;
  it.draw(ctx, t);
  return true;
}
