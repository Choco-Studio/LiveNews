// Clip mode (the publishing desk's recordings: docs/publishing/vertical.md). main.js asks for it with
//   ?clip=1                       the horizontal picture with clip graphics (clip/graphics.js ClipGraphics)
//   ?format=vertical (or 9x16)    the vertical picture, 216x384 (clip/vertical.js), clip graphics implied
//   ?clip=clean                   the horizontal picture with no graphics at all (a whole programme's thumbnail frame)
// and nothing changes on air without them. The page's canvas is the picture the recorder grabs (#screen): in the
// vertical mode the renderer draws its horizontal frame into an offscreen canvas and the compositor draws the
// vertical frame from it.
import { VW, VH, HW, HH } from './layout.js';

/**
 * The studio's own renderer, for the vertical picture's backdrop (clip/vset.js): the set, its desk, the shared frame and
 * the programme styles. Null when the v2 studio is not in the build (the backdrop is then the programme's colours).
 */
export async function setKit() {
  try {
    const [set, scene, styles] = await Promise.all([import('../v2/canvas25d/studio/set.js'), import('../v2/canvas25d/scene.js'), import('../v2/canvas25d/studio/styles.js')]);
    return { drawBackground: set.drawBackground, drawDesk: set.drawDesk, invalidateSet: set.invalidateSet, wallRect: set.wallRect, frame: scene.frame, drawActors: scene.drawActors, styleFor: styles.styleFor };
  } catch {
    return null;
  }
}

/** What the URL asks for: { on, vertical }. */
export function clipOptions(params) {
  const fmt = String(params?.get?.('format') || '').toLowerCase();
  const vertical = fmt === 'vertical' || fmt === '9x16' || fmt === '9:16';
  const raw = String(params?.get?.('clip') || '');
  const clean = /^(clean|plate)$/i.test(raw) && !vertical;
  const clip = clean || /^(1|true|yes|on)$/i.test(raw);
  return clean ? { on: true, vertical: false, clean: true } : { on: clip || vertical, vertical };
}

/** The canvas sizes: the page's picture and the renderer's. */
export function clipSizes(opts) {
  return opts.vertical ? { page: { w: VW, h: VH }, render: { w: HW, h: HH } } : { page: { w: HW, h: HH }, render: { w: HW, h: HH } };
}

/**
 * Set clip mode up on a renderer already built: its graphics become the clip graphics, and in the vertical mode a
 * compositor draws the page's canvas after every renderer frame. Returns { frame(t, scene) } (a no-op horizontally).
 */
export async function installClip({ canvas, renderer, audio, channel, opts }) {
  const g = await import('./graphics.js');
  if (opts.clean) {
    // the channel's bookkeeping, nothing drawn: no bug, strap or caption under a thumbnail's own type
    renderer.graphics = new g.VerticalGraphics({ audio });
    return { vertical: false, clean: true, frame() {} };
  }
  if (!opts.vertical) {
    renderer.graphics = new g.ClipGraphics({ audio });
    return { vertical: false, frame() {} };
  }
  renderer.graphics = new g.VerticalGraphics({ audio });
  return installVertical({ canvas, renderer, audio, channel });
}

/**
 * The vertical compositor drawing `canvas` (216x384) from `renderer.canvas` (the horizontal frame without the air
 * graphics) and `renderer.graphics` (the clip graphics' bookkeeping) after every renderer frame. `live`: the vertical
 * live's picture (main.js ?vertical=1): the channel's stinger drawn for the frame, the playout's held frame, and the
 * break's spots left to a window the pre-rendered playout fills with the spot itself at 2x (clip/vchannel.js
 * AD_WINDOW, server/playout/encode.js renderGraph); a clip is drawn without them.
 * Returns { vertical: true, compositor, frame(t, scene) }.
 */
export async function installVertical({ canvas, renderer, audio, channel, live = false }) {
  const [{ VerticalCompositor }, stageMod, quizMod, weatherMod, sportMod, vsetMod, kit, spriteMod] = await Promise.all([
    import('./vertical.js'),
    import('../v2/canvas25d/runtime/stage.js').catch(() => null),
    import('./vquiz.js').catch(() => null),
    import('./vweather.js').catch(() => null),
    import('./vsport.js').catch(() => null),
    import('./vset.js'),
    setKit(),
    import('./sprite.js').catch(() => null),
  ]);
  const comp = new VerticalCompositor({
    canvas,
    source: renderer.canvas,
    renderer,
    audio,
    channel,
    makeStage: stageMod ? (o) => new stageMod.Stage({ ...o, idle: null }) : null,
    vset: new vsetMod.VerticalSet(kit),
    live,
    sprite: spriteMod?.presenterSprite || null,
  });
  if (quizMod?.installQuiz) quizMod.installQuiz(comp);
  if (weatherMod?.installWeather) weatherMod.installWeather(comp);
  if (sportMod) comp.sport = { scoreline: sportMod.drawVerticalScoreline, scoreboard: sportMod.drawVerticalScoreboard, fixtures: sportMod.drawVerticalComingUp, chalk: sportMod.drawVerticalChalkboard };
  return { vertical: true, compositor: comp, frame: (t, scene) => comp.frame(t, scene) };
}
