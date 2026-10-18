// Clip mode (the publishing desk's recordings: docs/publishing/vertical.md). main.js asks for it with
//   ?clip=1                       the horizontal picture with clip graphics (clip/graphics.js ClipGraphics)
//   ?format=vertical (or 9x16)    the vertical picture, 216x384 (clip/vertical.js), clip graphics implied
//   ?clip=clean                   the horizontal picture with no graphics at all (a whole programme's thumbnail frame)
// and nothing changes on air without them. The page's canvas is the picture the recorder grabs (#screen): in the
// vertical mode the renderer draws its horizontal frame into an offscreen canvas and the compositor draws the
// vertical frame from it.
import { VW, VH, HW, HH } from './layout.js';

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
  const [{ VerticalCompositor }, stageMod, quizMod, weatherMod, sportMod] = await Promise.all([
    import('./vertical.js'),
    import('../v2/canvas25d/runtime/stage.js').catch(() => null),
    import('./vquiz.js').catch(() => null),
    import('./vweather.js').catch(() => null),
    import('./vsport.js').catch(() => null),
  ]);
  const comp = new VerticalCompositor({
    canvas,
    source: renderer.canvas,
    renderer,
    audio,
    channel,
    makeStage: stageMod ? (o) => new stageMod.Stage({ ...o, idle: null }) : null,
  });
  if (quizMod?.installQuiz) quizMod.installQuiz(comp);
  if (weatherMod?.installWeather) weatherMod.installWeather(comp);
  if (sportMod) comp.sport = { scoreline: sportMod.drawVerticalScoreline, scoreboard: sportMod.drawVerticalScoreboard, fixtures: sportMod.drawVerticalComingUp, chalk: sportMod.drawVerticalChalkboard };
  return { vertical: true, compositor: comp, frame: (t, scene) => comp.frame(t, scene) };
}
