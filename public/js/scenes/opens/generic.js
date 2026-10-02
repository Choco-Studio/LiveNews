// Fallback open for programmes without their own (new ids from the editorial
// desk): the GLOBIT 24 mark as an object. The WORLD NOW earth renderer in a
// darker ink/slate ramp (no navy, no graticule) carries the logo's seams, the
// equator and the two lens meridians, as 1 px red lines projected with the
// globe's tilt (dark red on the night side): red stays a thin line, never a
// big saturated disc. It opens like an iris and spins down; the logo's yellow
// bit sits on its shoulder and, like in every open, hops onto the title plate.
// Same package and clock as the others.
import { P } from '../../palette.js';
import { seg, easeOutQuint } from '../../gfx/index.js';
import { lazyBackdrop, playOpen, CENTRE, ZOOM } from './kit.js';
import { drawIrisGlobe, GLOBE_STYLES, LAM_END, globeWarmJobs } from './world.js';

const R0 = 30;

/** Centre longitude at dt: a turn that settles with the seams either side of the centre. */
function spin(dt) {
  return LAM_END + 200 * (1 - easeOutQuint(seg(dt, 0.2, 1.3)));
}

function emblem(ctx, dt, x, y, k = 1) {
  if (dt < 0.2) return;
  drawIrisGlobe(ctx, dt, x, y, Math.round(R0 * k), spin(dt), GLOBE_STYLES.generic);
}

const background = lazyBackdrop({ key: 'generic', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const GENERIC = {
  accent: P.red,
  style: { accent: P.red, plate: P.black, ink: 'light', bar: P.red, front: true },
  background,
  emblem,
  extent: R0, // an opaque globe, like WORLD NOW's: it may overlap the plate's left end
  front: true,
  absorb: 0.26,
  shoulder: 28,
  popAt: 0.8, // the logo's bit sits on the globe's shoulder from the start, as in the mark
  warmJobs: () => globeWarmJobs(R0, Math.round(R0 * ZOOM), 'generic'),
};

export function drawGeneric(ctx, dt, info) {
  playOpen(ctx, dt, info, GENERIC);
}
