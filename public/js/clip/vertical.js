// The vertical picture (?format=vertical: 216x384, 9:16 at 5x = 1080x1920; docs/publishing/vertical.md). Not a crop of
// the horizontal channel: the frame is composed again, every frame, from the channel's own drawing code, in bands
// laid out for a phone (clip/layout.js): the bug and the programme at the top, the story's tag and headline, the
// stage, the captions, a calm foot for the feed's own text.
//
// Under every band, edge to edge and top to bottom, the programme's own studio stood on end (clip/vset.js): its set
// drawn by the studio's renderer for a tall picture, its lights breathing. A presenter's single is the studio itself
// made tall (the set above and below the Stage's own frame, from its camera); a board is on tinted glass over the set,
// in the set's bezel (the quiz's in its lamp-lit marquee), whole from its first frame.
//
// The stage, by what the horizontal director has on air (scene.shot):
//   studio (wide, close)  the speaker's single, framed for a tall picture by a Stage of its own (v2 runtime/stage.js,
//                         a second instance: its own camera on the voice's owner, its own cue clock on the same plan,
//                         so the presenter gestures on the same words), cut when the voice changes hands, made tall
//   fact                  the board set again for the stage's width (clip/vboards.js), on glass
//   map                   the channel's map drawn at the stage's size (scenes/worldmap.js takes any viewport)
//   full                  the story's picture, the stage's width of it, panning as on air
//   montage, tease        the headline frame set again: the picture or the place's map, the headline at 2x under it
//   location              the correspondent, the expert in their studio, the re-staged guest: their single
//   twoway                the two boxes one over the other
//   quiz, scores, weather the programme's own vertical boards when there are (clip/vquiz.js), else the frame's middle
// Everything is drawn at 1x on the frame's grid: no element is ever scaled, so no pixel is bigger than another.
import { P } from '../palette.js';
import { drawRecreation } from '../graphics/recreation.js';
import { drawText, measureText } from '../font.js';
import { THEME_ACCENT, presenterName } from '../cast.js';
import { drawLogo, measureLogo } from '../logo.js';
import { drawWorldMap } from '../scenes/worldmap.js';
import { picturePan } from '../pace.js';
import { clamp, seg, easeOutQuint, balanceLines } from '../gfx/index.js';
import { bayer } from '../gfx/dither.js';
import { mk } from '../gfx/canvas.js';
import { u32 } from '../gfx/color.js';
import { contentWords } from '../graphics/index.js';
import { VW, VH, V, HW, HH, SAFE, MAST, boardBox, quizBox } from './layout.js';
import { WordCaptions, CLIP_CAPTION } from './captions.js';
import { drawVerticalBoard, boardKind, microFit } from './vboards.js';
import { drawBugOnly, drawProgrammeTag, speechNow, graveNow, boardRepeats } from './graphics.js';
import { pictureCreditOf } from '../graphics/picture.js';
import { prepareLocator, drawLocator } from '../graphics/locator.js';
import { drawTopicBoard } from '../graphics/topicboard.js';
import { drawOrbit, orbitMarker, coordsOf } from './vorbit.js';
import { VerticalSet, VSETS, twinkle, drawBoardFrame, hudBrackets, glassRect, glassScrims, glint, OVERLAP } from './vset.js';
import { drawVerticalChannel, drawVerticalFilm, drawStoryLine, storyLines, windowOpen } from './vchannel.js';
import { drawStinger, STINGER_DURATION } from '../scenes/cards.js';

const ST = V.stage;
// the presenter's single made tall: the Stage's 216 rows from this row (its framings put the eyes about 70 rows down:
// a third of the way down the picture), the set above and below it from the same camera
export const SINGLE_TOP = Object.freeze({ normal: 58, tall: 40 });
const REST_WALL = Object.freeze({ mode: 'rest', screen: false });
// a single's slow push in (v2 camera.js MOVES: a dolly, 5 % over six seconds from the cut), and how long one speaker's
// shot runs before the words' next pause cuts it in closer (or back out)
const SINGLE_PUSH = Object.freeze({ type: 'push', amount: 0.05, delay: 0, dur: 6 });
export const RECUT_AFTER = 4;
// the programmes whose places are seen from orbit (clip/vorbit.js), not on the flat map
const ORBIT = new Set(['cosmos']);
// the tall stage (no title band): the quiz, whose boards and three people need the frame's full 216 rows
const TALL = Object.freeze({ x: 0, y: V.title.y, w: VW, h: V.stage.y + V.stage.h - V.title.y });
const NORMAL = Object.freeze({ x: 0, y: ST.y, w: VW, h: ST.h });
// the headline frame (the montage, STILL TO COME): the stage and the captions' rows together, the headline at the foot
// of the safe area (the voice reads the headline on screen: it is the caption)
const MONTAGE = Object.freeze({ x: 0, y: ST.y, w: VW, h: V.caps.y + V.caps.h - ST.y });

/** The stage's box for a scene: the tall stage for the quiz, the montage's to the safe area's foot, else the stage. */
export function profileOf(scene) {
  const quiz = scene?.program?.id === 'pay-attention' || !!(scene?.cast?.H && scene?.cast?.A && scene?.cast?.B);
  if (quiz) return { name: 'tall', box: TALL, title: false, captions: true };
  if (scene?.shot === 'montage' || scene?.shot === 'tease') return { name: 'montage', box: MONTAGE, title: true, captions: false };
  return { name: 'normal', box: NORMAL, title: true, captions: true };
}
const STUDIO = new Set(['wide', 'close']);
const S = {
  white: { color: P.white },
  white2: { color: P.white, scale: 2 },
  silver: { color: P.silver },
  fog: { color: P.fog },
  microFog: { color: P.fog, font: 'micro' },
  microSilver: { color: P.silver, font: 'micro' },
  microWhite: { color: P.white, font: 'micro' },
};

/** A graded field (black to ink, Bayer 4x4 between the steps, lighter at its centre): the stage's quiet ground. */
const GROUNDS = new Map();
export function groundOf(w, h, { cx = w / 2, cy = h * 0.45, reach = 0.9 * Math.max(w, h), colors = [P.black, P.ink] } = {}) {
  const key = `${w}x${h}|${cx}|${cy}|${reach}|${colors.join()}`;
  let c = GROUNDS.get(key);
  if (c) return c;
  c = mk(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = new Uint32Array(img.data.buffer);
  const cols = colors.map((x) => u32(x));
  const n = cols.length - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / (reach * 0.9);
      const dy = (y - cy) / reach;
      const v = clamp(((1 - Math.sqrt(dx * dx + dy * dy)) * 2.1 - 0.55) * n, 0, n);
      const i = Math.floor(v + bayer(x, y) - 0.5);
      d[y * w + x] = cols[i < 0 ? 0 : i > n ? n : i];
    }
  }
  g.putImageData(img, 0, 0);
  GROUNDS.set(key, c);
  return c;
}

/**
 * The framing a vertical single asks the Stage for: the quiz's own singles; every other presenter, duo or solo, in the
 * vertical's own single (camera.js 'tall': the close's scale, k 3.8, the head on the 384-wide frame's middle column and
 * walked clear of the bezel like any single), so the tall crop centres the head over the safe column on either seat.
 * (Round 10's first pass used the close, head at x 136 or 248: walked clear of the bezel it landed at x 81 on FULL
 * TIME's seat A, past where a crop can centre it.)
 */
export function verticalFraming(cast, slot) {
  if (cast?.H && cast?.A && cast?.B) return slot === 'H' ? 'quiz-host' : slot === 'A' ? 'quiz-a' : 'quiz-b';
  return 'tall';
}

/** Where a 216-wide window sits over a 384-wide frame to centre `x` (clamped to the frame). */
export const windowX = (x, w = VW) => clamp(Math.round(x - w / 2), 0, HW - w);

export class VerticalCompositor {
  constructor({ canvas, source, renderer = null, audio = null, channel = null, makeStage = null, vset = null, live = false, sprite = null }) {
    // the programme's set stood on end (clip/vset.js: the studio's renderer when clip/index.js hands it in, else the
    // programme's colours on a graded field)
    this.vset = vset || new VerticalSet(null);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.src = source;
    this.renderer = renderer;
    this.audio = audio;
    this.channel = channel;
    this.makeStage = makeStage;
    this.aux = mk(HW, HH); // the vertical Stage's frame (presenter singles)
    this.auxCtx = this.aux.getContext('2d');
    this.auxCtx.imageSmoothingEnabled = false;
    this.stage = null;
    this.stageFailed = false;
    this.proxy = null;
    this.speaker = null;
    this.cutAt = 0;
    // (the line's text and its black box's padding either side, together inside the safe column)
    this.caps = new WordCaptions({ maxW: SAFE.w - 2 * CLIP_CAPTION.padX * 2, scale: 2, perPage: 2 });
    this.onAt = 0;
    this.lastMode = null;
    this.lastHead = { x: HW / 2, y: 150 };
    this.errors = new Set();
    // the vertical live (main.js ?vertical=1): the channel's stinger, the playout's held frame, the spots' window
    this.live = !!live;
    this.sprite = sprite;
    this.holdImage = null;
    this.memo = {}; // the break's programme after it, the promo's cut-outs (clip/vchannel.js)
  }

  /** The stage's box for a scene (profileOf). */
  stageBox(scene) {
    return profileOf(scene).box;
  }

  /** The vertical Stage (built on first use; any failure leaves the singles to the horizontal frame's middle). */
  vstage() {
    if (this.stage || this.stageFailed || !this.makeStage) return this.stage;
    try {
      this.stage = this.makeStage({ audio: this.audio, channel: this.channel });
    } catch (err) {
      this.stageFailed = true;
      this.log(err);
    }
    return this.stage;
  }

  log(err) {
    const key = String(err?.message || err);
    if (this.errors.has(key) || this.errors.size > 20) return;
    this.errors.add(key);
    console.error('[vertical]', err);
  }

  /** One vertical frame from the horizontal frame just rendered into `source` and the scene. Never throws. */
  frame(t, scene) {
    const ctx = this.ctx;
    try {
      ctx.fillStyle = P.black;
      ctx.fillRect(0, 0, VW, VH);
      if (this.live && this.liveFrame(t, scene)) return;
      const on = !['start', 'standby', 'ad', 'ident', 'promo', 'countdown', 'breakingCard'].includes(scene.shot);
      if (on && this.lastMode !== 'on') this.onAt = t;
      this.lastMode = on ? 'on' : 'off';
      this.t = t;
      this.sp = speechNow(this.audio, scene);
      this.profile = profileOf(scene);
      this.box = this.profile.box;
      this.programId = scene.program?.id || 'world-now';
      this.theme = scene.program?.theme || 'world';
      this.set = this.vset.backdrop(this.programId);
      // the picture under every band: the presenter's single made tall, else the programme's set stood on end
      this.tall = !on ? null : STUDIO.has(scene.shot) ? this.tallSingle(t, scene) : scene.shot === 'weather' && this.weatherCloseup ? this.weatherCloseup(t, scene) : null;
      if (!this.tall) this.drawBackdrop(t);
      this.drawStage(t, scene);
      // the top and the foot under tinted glass: the feeds lay their buttons and words there
      glassScrims(ctx);
      if (on) {
        // (the title band holds the clip's hook, laid over the master by the factory: the master leaves it to the set)
        this.drawMast(t, scene);
        if (this.live && this.profile.title && this.profile.name !== 'montage') this.storyLine(t, scene);
        if (this.profile.captions !== false) this.drawCaptions(t, scene);
      } else this.drawChannelFrame(t, scene);
      if (this.live) this.stinger(t, scene);
    } catch (err) {
      this.log(err);
    }
  }

  /**
   * The vertical live's own frames: the playout's held frame (the last vertical frame of what aired before, under this
   * item's opening stinger) and the channel's shots set for the frame (clip/vchannel.js), each under the stinger. False
   * for a programme's shot.
   */
  liveFrame(t, scene) {
    const ctx = this.ctx;
    // (the renderer's grab carries the clean frame only while a film's window is open: tools/playout/render.mjs)
    this.canvas.windowOpen = windowOpen(scene);
    const opts = { adWindow: true, source: this.src, channel: this.channel, memo: this.memo, sprite: this.sprite };
    if (scene.shot === 'hold') {
      if (this.holdImage?.complete && this.holdImage.naturalWidth === VW) ctx.drawImage(this.holdImage, 0, 0);
    } else if (!drawVerticalChannel(ctx, t, scene, opts) && !drawVerticalFilm(ctx, t, scene, opts)) return false;
    if (scene.shot !== 'hold') this.lastMode = 'off';
    this.stinger(t, scene);
    return true;
  }

  /**
   * The vertical live's title band: the story on air (its headline from the rundown, else the strap's), else the
   * programme's line, on the title band's plate (clip/vchannel.js drawStoryLine); a new story wipes in.
   */
  storyLine(t, scene) {
    const story = scene.storyId && Array.isArray(scene.rundown) ? scene.rundown.find((r) => r?.storyId === scene.storyId) : null;
    const strap = this.renderer?.graphics?.strap;
    const text = String(story?.headline || (strap?.cur && strap.outAt === null ? strap.cur.headline : '') || scene.program?.tagline || '').trim();
    if (!text) return;
    if (text !== this.storyText) {
      this.storyText = text;
      this.storySince = t;
      this.storyFit = storyLines(text);
    }
    drawStoryLine(this.ctx, t, { ...this.storyFit, since: this.storySince, accent: THEME_ACCENT[scene.program?.theme] || P.red });
  }

  /** The channel's stinger over the vertical frame (scenes/cards.js drawStinger set for 216x384, the logo at 1x). */
  stinger(t, scene) {
    const st = scene.stinger;
    if (!st) return;
    const p = (t - st.start) / STINGER_DURATION;
    if (p > 0 && p < 1) drawStinger(this.ctx, t, p, { w: VW, h: VH, logoScale: 1 });
  }

  // ------------------------------------------------------------------ the stage

  drawStage(t, scene) {
    const ctx = this.ctx;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(0, this.box.y, VW, this.box.h);
      ctx.clip();
      const shot = scene.shot;
      const dt = t - (scene.shotSince || 0);
      this.shownPicture = null; // the story whose picture this frame's stage shows (its credit is drawn over it)
      if (STUDIO.has(shot)) {
        if (this.tall) this.nameTag(t, scene, this.speaker);
        else if (this.cutaway && this.storyPicture(scene)) this.picture(t, scene, t - this.cutAt);
        else this.middle(scene);
      } else if (shot === 'fact') {
        if (!this.board(t, scene, dt)) this.middle(scene);
      } else if (shot === 'map') this.map(t, scene, dt);
      else if (shot === 'full') this.picture(t, scene, dt);
      else if (shot === 'montage' || shot === 'tease') this.headlineFrame(t, scene, dt);
      else if (shot === 'location') this.remote(scene);
      else if (shot === 'twoway') this.twoway(scene);
      else if (shot === 'broll') this.broll(t, scene, dt);
      else if (shot === 'quiz' && this.quiz?.(t, scene, dt, quizBox(this.box))) {
        /* the programme's own vertical board */
      } else if (shot === 'scores' && this.sport && scene.card?.scores?.length) {
        // FULL TIME's SCORE CENTRE: the board set again, a result on two lines, on the glass
        this.glassPanel(t);
        this.sport.scoreboard(this.ctx, dt, scene.card, { ...boardBox(this.box), bare: true }, THEME_ACCENT[scene.program?.theme] || P.orange);
      } else if (shot === 'weather' && this.weather?.(t, scene, boardBox(this.box))) {
        /* WORLD WEATHER's board set again, or the window on the presenter */
      } else this.middle(scene);
      // the correspondent's name on their link, as the speaker's on a single (a re-staged guest keeps its own label)
      if ((shot === 'location' || shot === 'twoway') && this.channel?.presenters?.[scene.remote?.id] && scene.remote.kind !== 'restage' && !scene.recreation) this.nameTagOf(t, scene, scene.remote.id);
      // PAY ATTENTION's scores strip over the studio (the half-time scores and the banter after them)
      if (scene.quizStrip && STUDIO.has(shot)) this.quizStrip(t, scene.quizStrip);
      // the story's source and NEWS IN 60's minute, on the stage: in a clip the hook holds the title band and the feeds
      // cover the foot, so the stage is where they are seen (a board, the montage and a recreation carry their own)
      if ((STUDIO.has(shot) || ['map', 'full', 'broll', 'location'].includes(shot)) && this.profile?.name !== 'tall') this.sourcePlate(t, scene);
      // the picture's credit (or the file footage's) as its licence asks, while it is on the stage
      this.pictureCredit(scene);
      this.progressRule();
      if (scene.recreation) this.recreationLabel(scene.recreation, scene);
    } finally {
      ctx.restore();
    }
    // a picture window (a map, a photo, a location, the montage's backdrop) framed in the programme's accent, set into
    // the studio like the set's own screens
    if (this.windowed) this.windowRules(this.windowed);
    this.windowed = null;
  }

  // ------------------------------------------------------------------ the set

  /** The programme's set stood on end over the whole frame, its lights breathing. */
  drawBackdrop(t) {
    const set = this.set || this.vset.backdrop(this.programId);
    this.ctx.drawImage(set.img, 0, 0);
    twinkle(this.ctx, t, set.lights);
  }

  /** Tinted glass over the stage (the board's ground: the set reads through it as shape and light) and its frame. */
  glassPanel(t, box = this.box, opts = {}) {
    const r = glassRect(box);
    const set = this.set || this.vset.backdrop(this.programId);
    this.ctx.drawImage(set.glass, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    drawBoardFrame(this.ctx, t, r, this.programId, THEME_ACCENT[this.theme] || P.red, opts);
    return r;
  }

  /**
   * COSMOS's locator (clip/vorbit.js): the place from orbit in the programme's display, the kicker, the place's name and
   * its coordinates over the globe. False when the globe cannot be drawn (the flat map then).
   */
  orbitBoard(t, scene, dt, card) {
    if (!Number.isFinite(card.lat) || !Number.isFinite(card.lon) || typeof document === 'undefined') return false;
    const ctx = this.ctx;
    const acc = THEME_ACCENT[scene.program?.theme] || P.magenta;
    const r = glassRect(this.box);
    const tx = SAFE.x + 8;
    const place = String(card.place || '').toUpperCase().trim();
    let lines = place ? balanceLines(place, SAFE.w - 16, 2, 2) : [];
    let scale = 2;
    if (lines[lines.length - 1]?.endsWith('...')) {
      scale = 1;
      lines = balanceLines(place, SAFE.w - 16, 1, 2);
    }
    const lh = scale === 2 ? 18 : 11;
    const nameY = r.y + 22;
    const coordY = nameY + (lines.length ? lines.length * lh - (lh - 7 * scale) + 5 : 0);
    const top = coordY + 12;
    // (the story's source in the display's foot, as on its boards, under the globe)
    const source = this.sourceOf(scene);
    const foot = source ? 11 : 0;
    const R = Math.max(30, Math.floor((r.y + r.h - 6 - foot - top) / 2));
    // the globe first (it may not be ready: then nothing of the board is drawn and the flat map stands in)
    const cy = top + R;
    this.glassPanel(t, this.box, { orbit: false });
    if (!drawOrbit(ctx, { cx: VW >> 1, cy, R, lat: card.lat, lon: card.lon, dt, t, accent: acc })) return false;
    drawText(ctx, 'FROM ORBIT', tx, r.y + 10, { color: acc === P.purple ? P.fog : acc });
    lines.forEach((ln, i) => drawText(ctx, ln, tx, nameY + i * lh, scale === 2 ? S.white2 : S.white));
    drawText(ctx, coordsOf(card.lat, card.lon), tx, coordY, S.fog);
    if (source) drawText(ctx, microFit(`SOURCE: ${source}`, SAFE.w - 16), tx, r.y + r.h - 12, S.microFog);
    this.orbitAt = t;
    return true;
  }

  /** The accent rules above and below a picture window (rows y0..y1), the set's own frame lines. */
  windowRules({ y0, y1, held = y1 }) {
    const ctx = this.ctx;
    const acc = THEME_ACCENT[this.theme] || P.red;
    ctx.fillStyle = P.black;
    ctx.fillRect(0, y0 - 3, VW, 1);
    ctx.fillRect(0, y1 + 2, VW, 1);
    ctx.fillStyle = acc === P.purple ? P.fog : acc;
    ctx.fillRect(0, y0 - 2, VW, 2);
    ctx.fillRect(0, y1, VW, 2);
    glint(ctx, this.t || 0, 0, y0 - 2, VW, acc === P.purple ? P.fog : acc);
    // COSMOS: the picture held in its display's brackets, as a telescope's viewfinder frames it
    // (held: the brackets' foot, over the headline frame's tag)
    if (VSETS[this.programId]?.frame === 'hud' && held - y0 > 40) hudBrackets(ctx, { x: (VW - 190) >> 1, y: y0 + 4, w: 190, h: held - y0 - 8 }, acc === P.purple ? P.fog : acc);
  }

  /**
   * The story's picture while the studio talks over that story (the horizontal frame shows it on the wall behind the
   * presenter: wall.js wallFromScene's story segment), else null: never over the programme's chat, open or close.
   */
  storyPicture(scene) {
    const sid = scene.storyId;
    const img = sid != null ? scene.images?.get?.(sid) : null;
    if (!img?.full) return null;
    const seg = scene.segPlan?.ctx?.seg;
    if (seg ? seg.storyId !== sid || seg.type === 'chat' || seg.type === 'intro' || seg.type === 'outro' : scene.wall?.mode && scene.wall.mode !== 'picture') return null;
    return img;
  }

  /**
   * The presenter's single made tall: the Stage's own frame (216 rows, the speaker centred over the safe column), and
   * above and below it the set from the very same camera (clip/vset.js single), so the presenter sits in the studio:
   * the wall rises behind the head to the set's top, the desk runs on to the frame's foot. Returns { top, sx } or null
   * (no Stage: the backdrop and the frame's middle).
   */
  tallSingle(t, scene) {
    const stage = this.vstage();
    if (!stage) return null;
    const slot = this.speakerOf(scene);
    // (the captions' page as last drawn: it turns where the sentence pauses)
    const said = this.caps?.active ? `${this.caps.text}|${this.caps.page}` : null;
    const quiz = !!(scene.cast?.H && scene.cast?.A && scene.cast?.B);
    const pic = !quiz && !!this.storyPicture(scene);
    if (slot !== this.speaker) {
      this.speaker = slot;
      this.cutAt = t;
      this.beat = 0;
    } else if (!quiz && said && said !== this.lastSaid && t - this.cutAt >= RECUT_AFTER) {
      // a long turn: where the words pause (a new sentence, a comma: the captions turn their page there) the camera
      // cuts in closer, or back out, as a studio's two cameras would (the owner, of COSMOS's shorts: one presenter held
      // still in one frame for fifteen seconds loses the viewer); with the story's picture, every other cut is to the
      // picture under the voice, as the horizontal frame shows it on the wall behind the presenter: wide, picture,
      // close, picture
      this.beat = (this.beat || 0) + 1;
      this.cutAt = t;
    }
    if (said) this.lastSaid = said;
    const beat = this.beat || 0;
    this.tight = pic ? beat % 4 === 2 : beat % 2 === 1;
    this.cutaway = pic && beat % 2 === 1;
    // (the picture's beat: no single this frame, the stage shows the picture: drawStage)
    if (this.cutaway) return null;
    if (!this.proxy || Object.getPrototypeOf(this.proxy) !== scene) this.proxy = Object.create(scene);
    const p = this.proxy;
    p.shot = 'close';
    p.focus = slot;
    p.framing = this.tight ? 'tall-tight' : verticalFraming(scene.cast, slot);
    p.shotSince = this.cutAt;
    // and every shot a slow push in from its cut: the picture is never quite still
    p.cameraMove = quiz ? null : SINGLE_PUSH;
    p.cameraMoveSince = quiz ? null : this.cutAt;
    // the studio wall at rest behind the single (wall.js 'rest', as behind a two-way's box): no plate, map label,
    // figure or wordmark for the tall crop to cut in half; the story's own picture, map and figure have their shots
    p.wall = REST_WALL;
    let ok = false;
    try {
      ok = stage.frame(this.auxCtx, t, p, true);
    } catch (err) {
      this.log(err);
    }
    if (!ok) return null;
    // the speaker's head: their seat's screen x in this frame (the Stage's visible list)
    let hx = this.lastHead.x;
    for (const it of stage.vis || []) if (it.slot === slot) hx = it.x;
    this.lastHead.x = hx;
    // the head over the safe column's middle (the feeds' buttons cover the right edge)
    const sx = clamp(Math.round(hx - SAFE.cx), 0, HW - VW);
    const top = this.profile?.name === 'tall' ? SINGLE_TOP.tall : SINGLE_TOP.normal;
    const ext = this.vset.single(stage);
    const ctx = this.ctx;
    if (ext) {
      ctx.drawImage(ext.above, sx, 0, VW, HH, 0, top - HH, VW, HH);
      // (the speaker's body goes on below the Stage's frame: a contestant's podium is lower than a desk)
      let below = ext.below;
      try {
        below = this.vset.singleBelow(stage, ext, t) || ext.below;
      } catch (err) {
        this.log(err);
      }
      // (from the row the Stage's own frame ends on: the rasteriser leaves a frame's last row to the set, so a body
      // crossing it would show a line of wall)
      ctx.drawImage(below, sx, OVERLAP - 1, VW, HH - OVERLAP + 1, 0, top + HH - 1, VW, HH - OVERLAP + 1);
      twinkle(ctx, t, ext.lightsAbove, -sx, top - HH);
      twinkle(ctx, t, ext.lightsBelow, -sx, top + HH - OVERLAP);
      ctx.drawImage(this.aux, sx, 0, VW, HH - 1, 0, top, VW, HH - 1);
    } else {
      this.drawBackdrop(t);
      ctx.drawImage(this.aux, sx, 0, VW, HH, 0, top, VW, HH);
    }
    return { top, sx };
  }

  /**
   * A shot the compositor cannot make tall itself (WORLD WEATHER's close-up, drawn by its own centre): the horizontal
   * frame's whole height (216 rows, not the stage's 176), centred on `cx` over the safe column, from the stage's top
   * row, over the programme's set and framed as a window: the presenter as large as the frame gives him.
   */
  tallWindow(t, cx) {
    this.drawBackdrop(t);
    const sx = clamp(Math.round(cx - SAFE.cx), 0, HW - VW);
    const y0 = V.stage.y;
    this.ctx.drawImage(this.src, sx, 0, VW, HH, 0, y0, VW, HH);
    this.windowed = { y0, y1: y0 + HH };
    return { top: y0, sx };
  }

  /** The horizontal frame's middle, 216 wide (the fallback for a shot with no vertical layout of its own). */
  middle(scene, cx = HW / 2) {
    const sx = windowX(cx);
    const sy = clamp(Math.round((HH - this.box.h) / 2), 0, HH - this.box.h);
    this.ctx.drawImage(this.src, sx, sy, VW, this.box.h, 0, this.box.y, VW, this.box.h);
    this.windowed = { y0: this.box.y, y1: this.box.y + this.box.h };
  }

  /** Who the vertical single shows: the voice's owner, else the last one, else the director's focus. */
  speakerOf(scene) {
    const cast = scene.cast || {};
    const slot = this.sp?.slot;
    if (slot && cast[slot]) return slot;
    if (this.speaker && cast[this.speaker]) return this.speaker;
    if (scene.focus && cast[scene.focus]) return scene.focus;
    return Object.keys(cast)[0] || 'A';
  }

  /** The quiz's scores as a strip at the stage's foot: ● LOLA 12 │ ■ SAM 8 (scenes/cards-quiz.js drawScoresStrip's). */
  quizStrip(t, strip) {
    if (!strip?.players || !this.drawMark) return;
    const ctx = this.ctx;
    const parts = strip.players.slice(0, 2).map((pl) => ({ pl, s: String(strip.scores?.[pl.seat] ?? 0) }));
    const w = parts.reduce((a, x) => a + 9 + measureText(String(x.pl.name || '').toUpperCase()) + 6 + measureText(x.s), 0) + 21 + 12;
    const x0 = Math.round(SAFE.cx - w / 2);
    const y0 = this.box.y + this.box.h - 17;
    const vis = Math.round(w * easeOutQuint(seg(t - (strip.since || 0), 0, 0.3)));
    if (vis <= 0) return;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(x0, y0, vis, 13);
      ctx.clip();
      ctx.fillStyle = P.black;
      ctx.fillRect(x0, y0, w, 13);
      ctx.fillStyle = P.slate;
      ctx.fillRect(x0, y0, w, 1);
      let x = x0 + 6;
      parts.forEach((p, i) => {
        if (i) {
          ctx.fillStyle = P.slate;
          ctx.fillRect(x + 7, y0 + 3, 1, 7);
          x += 15;
        }
        x += this.drawMark(ctx, p.pl.seat, p.pl.name, x, y0 + 3, 'id') + 6;
        drawText(ctx, p.s, x, y0 + 3, strip.winner === p.pl.seat ? { color: P.yellow } : S.white);
        x += measureText(p.s);
      });
    } finally {
      ctx.restore();
    }
  }

  /** The speaker's name on their first turn (as the channel's name super), at the stage's foot left. */
  nameTag(t, scene, slot) {
    this.nameTagOf(t, scene, scene.cast?.[slot]);
  }

  /** The name super of a presenter or correspondent by id (a correspondent's on their link: the place's shot, the
   * two-way), once a programme, for 4.5 s from their first frame. */
  nameTagOf(t, scene, id) {
    if (!id) return;
    this.introduced ||= new Map();
    const key = `${scene.episode?.id || scene.program?.id || ''}|${id}`;
    if (!this.introduced.has(key)) this.introduced.set(key, t);
    const since = t - this.introduced.get(key);
    if (since > 4.5) return;
    const name = presenterName(id);
    const role = this.channel?.presenters?.[id]?.role ? String(this.channel.presenters[id].role).toUpperCase() : '';
    const acc = THEME_ACCENT[scene.program?.theme] || P.red;
    const w = Math.min(SAFE.w, Math.max(measureText(name), role ? measureText(role, 1, 'micro') : 0) + 10);
    const vis = Math.round(w * easeOutQuint(seg(since, 0.4, 0.35)));
    if (vis <= 0) return;
    const ctx = this.ctx;
    const y = this.box.y + this.box.h - (role ? 26 : 17);
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(SAFE.x, y, vis, 26);
      ctx.clip();
      ctx.fillStyle = acc;
      ctx.fillRect(SAFE.x, y, 2, role ? 22 : 13);
      ctx.fillStyle = P.ink;
      ctx.fillRect(SAFE.x + 2, y, w - 2, role ? 22 : 13);
      drawText(ctx, name, SAFE.x + 6, y + 3, S.white);
      if (role) drawText(ctx, role, SAFE.x + 6, y + 14, S.microSilver);
    } finally {
      ctx.restore();
    }
  }

  board(t, scene, dt) {
    const card = scene.card;
    const kind = boardKind(card);
    const acc = THEME_ACCENT[scene.program?.theme];
    // every board on the glass over the set, in its frame, whole from the shot's first frame (the board's own rows
    // rise into it as on air; no panel wipes in: a clip that opens on a board opens on a composed frame)
    const box = { ...boardBox(this.box), bare: true };
    if (kind === 'score' && this.sport) {
      this.glassPanel(t);
      return this.sport.scoreline(this.ctx, dt, card, box, acc || P.orange);
    }
    // FULL TIME's COMING UP and THE MOMENT ON THE BOARD, set for the tall frame
    if ((kind === 'fixtures' || kind === 'chalk') && this.sport?.[kind]) {
      this.glassPanel(t);
      return this.sport[kind](this.ctx, dt, card, box, acc || P.orange);
    }
    if (!kind || ['score', 'chalk', 'fixtures'].includes(kind)) return false;
    this.glassPanel(t);
    return drawVerticalBoard(this.ctx, dt, card, { ...box, programId: scene.program?.id, accent: acc });
  }

  /**
   * The map edge to edge, centred on the frame (its place label and the names round it fall inside the safe column).
   */
  map(t, scene, dt) {
    const card = scene.card || {};
    if (ORBIT.has(scene.program?.id) && this.orbitBoard(t, scene, dt, card)) return;
    drawWorldMap(this.ctx, t, dt, { x: 0, y: this.box.y, w: VW, h: this.box.h, lat: card.lat, lon: card.lon, scope: card.scope, place: card.place, accent: THEME_ACCENT[scene.program?.theme], programId: scene.program?.id, from: card.from, pins: card.pins, duration: card.duration, follow: true });
    this.windowed = { y0: this.box.y, y1: this.box.y + this.box.h };
  }



  picture(t, scene, dt) {
    const img = scene.storyId ? scene.images?.get?.(scene.storyId) : null;
    const pic = img?.full;
    if (!pic) return this.middle(scene);
    const { ox, oy } = picturePan(dt, pic.width - VW, pic.height - this.box.h, scene.panDir, scene.program?.id);
    this.ctx.drawImage(pic, -Math.round(ox), this.box.y - Math.round(oy));
    this.shownPicture = scene.storyId;
    this.windowed = { y0: this.box.y, y1: this.box.y + this.box.h };
  }

  /**
   * The credit of what the stage shows that is not the channel's own: the story's picture (full frame, B-roll, the
   * headline frame) as graphics/picture.js credits it on air, or a link's file footage (scene.fileCredit). Set for the
   * tall frame: in the safe column under the source plate, wrapped at whole words, never cut (drawVerticalCredit).
   */
  pictureCredit(scene) {
    const shot = scene.shot;
    let c = this.shownPicture ? pictureCreditOf(scene, this.shownPicture) : null;
    if (!c?.credit && scene.remote && scene.fileCredit && (shot === 'location' || shot === 'broll')) c = { credit: scene.fileCredit, uncleared: false };
    if (!c?.credit) return 0;
    const y = this.box.y + (shot === 'montage' || shot === 'tease' ? 4 : 16);
    return drawVerticalCredit(this.ctx, c.credit, { x: SAFE.x, y, w: SAFE.w, uncleared: !!c.uncleared });
  }

  /**
   * The locator board for a story with a place and no picture (graphics/locator.js), prepared for the headline frame's
   * tall backdrop: the place at the safe column's middle, its name inside the column and above the headline's plate.
   * Prepared once per place (the clip's recording waits for it; the channel on air never runs this).
   */
  locatorFor(loc, box) {
    return prepareLocator(loc, { w: VW, h: box.h, anchor: { x: SAFE.cx / VW, y: 0.3 }, frame: { x0: SAFE.x + 4, x1: SAFE.right - 4, y0: 8, y1: box.h - 106 } });
  }

  broll(t, scene, dt) {
    const img = scene.storyId ? scene.images?.get?.(scene.storyId) : null;
    if (!scene.card?.footage && img?.full) return this.picture(t, scene, dt);
    if (!scene.card?.footage && scene.remote && Number.isFinite(scene.remote.lat)) {
      drawWorldMap(this.ctx, t, dt, { x: 0, y: this.box.y, w: VW, h: this.box.h, lat: scene.remote.lat, lon: scene.remote.lon, scope: scene.remote.scope, place: scene.remote.place, accent: THEME_ACCENT[scene.program?.theme], programId: scene.program?.id, follow: true });
      this.windowed = { y0: this.box.y, y1: this.box.y + this.box.h };
      return;
    }
    this.middle(scene);
  }

  remote(scene) {
    // the correspondent (or expert, or guest) stands at REMOTE.headX = PRESS.headX = 124 in the horizontal frame
    this.middle(scene, 124);
  }

  twoway(scene) {
    // the two boxes (studio/remote.js TWOWAY: 176x99 at x 12 and 196, y 32, a fog frame and a shadow): one over the
    // other, each from 9 rows under its top (air over the hair; the head stays whole), the frame's top line redrawn
    const ctx = this.ctx;
    this.glassPanel(0);
    const bw = 178;
    const bh = 82;
    const x = Math.round(SAFE.cx - bw / 2);
    const boxes = [[11, this.box.y + 4], [195, this.box.y + 4 + bh + 6]];
    for (const [sx, dy] of boxes) {
      ctx.drawImage(this.src, sx, 31 + 9, bw, bh, x, dy, bw, bh);
      ctx.fillStyle = P.fog;
      ctx.fillRect(x, dy, bw, 1);
      ctx.fillRect(x, dy + bh - 1, bw, 1);
    }
  }

  /**
   * A sport story's tag (FOOTBALL, RUGBY: its strap's kicker) as an ink tab with the programme's accent bar, at 2x when
   * it fits the safe column, centred in the field above the tallest headline plate; it wipes in after the cut.
   */
  sportTag(kicker, acc, dt) {
    const ctx = this.ctx;
    const label = String(kicker).toUpperCase().slice(0, 18);
    const scale = measureText(label, 2) <= SAFE.w - 24 ? 2 : 1;
    const w = measureText(label, scale) + 12 + 2 * scale;
    const h = 7 * scale + 10;
    const x = Math.round(SAFE.cx - w / 2);
    const y = this.box.y + Math.round((this.box.h - 116) / 2) + 8 - Math.round(h / 2);
    const p = easeOutQuint(seg(dt, 0.1, 0.35));
    if (p <= 0) return;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(x, y, Math.max(1, Math.round(w * p)), h);
      ctx.clip();
      ctx.fillStyle = P.ink;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = acc;
      ctx.fillRect(x, y, 2 * scale, h);
      drawText(ctx, label, x + 2 * scale + 6, y + 5, scale === 2 ? S.white2 : S.white);
    } finally {
      ctx.restore();
    }
  }

  /**
   * The headline frame's place from orbit (COSMOS): the globe in the sky between the stage's top and the plate's tag
   * (rows y0..py), the place's name on a black plate beside its marker. False when the globe cannot be drawn.
   */
  orbitOver(t, dt, loc, py, acc) {
    if (typeof document === 'undefined') return false;
    const ctx = this.ctx;
    const y0 = this.box.y + 6, y1 = py - 14;
    const R = Math.min(56, Math.floor((y1 - y0) / 2));
    if (R < 24) return false;
    const cx = VW >> 1, cy = y0 + Math.round((y1 - y0) / 2);
    if (!drawOrbit(ctx, { cx, cy, R, lat: loc.lat, lon: loc.lon, dt, t, accent: acc })) return false;
    const name = String(loc.place || '').toUpperCase().trim();
    if (!name) return true;
    const m = orbitMarker(loc.lat, loc.lon, dt);
    const mx = Math.round(cx + m.x * R), my = Math.round(cy + m.y * R);
    const text = microFit(name, SAFE.w - 24);
    const w = measureText(text, 1, 'micro') + 8;
    // beside the marker, on whichever side has the room inside the safe column
    const right = mx + 12 + w <= SAFE.right;
    const lx = right ? mx + 12 : Math.max(SAFE.x, mx - 12 - w);
    ctx.fillStyle = P.black;
    ctx.fillRect(lx, my - 5, w, 10);
    ctx.fillStyle = acc;
    ctx.fillRect(right ? lx : lx + w - 1, my - 5, 1, 10);
    drawText(ctx, text, lx + 4, my - 3, S.microWhite);
    return true;
  }

  /** The montage's headline frame (and STILL TO COME's) set again: the backdrop over the stage, the headline under it. */
  headlineFrame(t, scene, dt) {
    const ctx = this.ctx;
    const card = scene.card || {};
    const tease = scene.shot === 'tease';
    const items = tease ? (card.items || []).map((id) => scene.rundown?.find((r) => r.storyId === id)).filter(Boolean) : [scene.rundown?.[card.index]].filter(Boolean);
    const item = items[0] || {};
    const acc = THEME_ACCENT[scene.program?.theme] || P.red;
    const pic = scene.images?.get?.(item.storyId)?.card || null;
    const loc = item.location;
    const place = Number.isFinite(loc?.lat) && Number.isFinite(loc?.lon);
    // the headline at 2x on a black plate at the stage's foot (up to four lines; at 1x when longer), the tag over it
    const headline = String(item.headline || '').toUpperCase();
    let scale = 2;
    let lines = balanceLines(headline, SAFE.w - 8, 2, 4);
    if (lines[lines.length - 1]?.endsWith('...')) {
      scale = 1;
      lines = balanceLines(headline, SAFE.w - 8, 1, 5);
    }
    const lh = scale === 2 ? 18 : 11;
    const textH = lines.length * lh - (lh - 7 * scale);
    // the plate rises from the safe area's foot, never less than 64 rows tall (the backdrop above it keeps the rest)
    const plateH = Math.max(64, textH + 16 + (item.source ? 10 : 0));
    const py = this.box.y + this.box.h - plateH;
    // (the backdrop fills the box above the plate; a photo is centred on the safe column)
    if (pic) {
      ctx.drawImage(pic, Math.round(SAFE.cx - pic.width / 2), this.box.y);
      this.shownPicture = item.storyId;
    } else if (place && ORBIT.has(scene.program?.id) && this.orbitOver(t, dt, loc, py, acc)) {
      // COSMOS: no picture, the place from orbit over its sky (clip/vorbit.js)
    } else if (place) {
      // no picture: the place's locator board set for the tall frame (else, while the map data loads, the map shot)
      const board = this.locatorFor(loc, this.box);
      if (board) drawLocator(ctx, board, loc, { accent: acc, dt, x: 0, y: this.box.y });
      else drawWorldMap(ctx, t, dt, { x: 0, y: this.box.y, w: VW, h: this.box.h, lat: loc.lat, lon: loc.lon, scope: loc.scope, place: '', label: false, accent: acc, programId: scene.program?.id, follow: true });
    } else if (item.storyId && scene.program?.theme !== 'sport') {
      // no picture and no place: the topic board (the story's own figure, quote, actor or topic: graphics/topicboard.js),
      // its box right-aligned in the safe column, above the tallest headline plate
      drawTopicBoard(ctx, item, { accent: acc, dt, frame: { x: 0, y: this.box.y, w: VW, h: this.box.h, right: SAFE.right - 4, top: 30, bottom: this.box.h - 116, maxW: SAFE.w - 8 } });
    } else {
      this.glassPanel(t);
      // FULL TIME (the sport theme draws no topic board): the story's sport, the horizontal frame's chip, set large in
      // the field, so a result without a picture or a place never opens on an empty stage (publishing round 6)
      if (scene.program?.theme === 'sport' && item.kicker) this.sportTag(item.kicker, acc, dt);
    }
    // (the plate whole from the shot's first frame: a clip opening on the montage opens on a composed frame; its lines
    // rise into it)
    this.windowed = { y0: this.box.y, y1: py, held: py - 12 };
    ctx.fillStyle = P.black;
    ctx.fillRect(0, py, VW, plateH);
    for (let i = 0; i < lines.length; i++) {
      const lp = seg(dt + 0.5, 0.15 + i * 0.07, 0.3); // (pre-rolled: the headline whole on the shot's first frame)
      if (lp <= 0) continue;
      drawText(ctx, lines[i], SAFE.x + 4, py + 8 + i * lh + Math.round((1 - easeOutQuint(lp)) * 4), scale === 2 ? S.white2 : S.white);
    }
    // (the source on the plate with the headline)
    if (item.source) drawText(ctx, microFit(`SOURCE: ${String(item.source).toUpperCase()}`, SAFE.w - 8), SAFE.x + 4, py + 8 + textH + 6, S.microFog);
    // the tag: TOP STORIES (with the pips of the run) or STILL TO COME (on the plate: the clip's hook covers the
    // title band all clip long)
    const tag = tease ? 'STILL TO COME' : 'TOP STORIES';
    const tw = measureText(tag, 1, 'micro') + 8;
    ctx.fillStyle = P.black;
    ctx.fillRect(SAFE.x, py - 11, tw, 9);
    drawText(ctx, tag, SAFE.x + 4, py - 9, S.microWhite);
    if (!tease) {
      const total = scene.rundown?.length || 1;
      for (let i = 0; i < Math.min(total, 8); i++) {
        ctx.fillStyle = i <= (card.index || 0) ? P.white : P.slate;
        ctx.fillRect(SAFE.x + tw + 4 + i * 6, py - 7, 4, 2);
      }
    }
  }

  /**
   * AI RECREATION — WORDS FROM PUBLIC STATEMENTS and SOURCE at the stage's top right, the name super at its foot, on
   * every frame of the piece: the compliance desk's own plates (graphics/recreation.js), laid out for this frame, the
   * same layout server/compliance/clips.js checks a vertical clip against.
   */
  recreationLabel(rec, scene = null) {
    drawRecreation(this.ctx, rec, THEME_ACCENT[scene?.program?.theme] || P.red, { vertical: boardBox(this.box) });
  }

  // ------------------------------------------------------------------ bands

  drawMast(t, scene) {
    const ctx = this.ctx;
    drawBugOnly(ctx, t, this.onAt, MAST.left, 10);
    const title = scene.program?.title ? String(scene.program.title) : '';
    if (title) {
      const color = THEME_ACCENT[scene.program?.theme] || P.red;
      const w = measureText(title) + 8;
      drawProgrammeTag(ctx, MAST.right - w, 10, title, color);
    }
  }

  /**
   * The story's source on a plate at the stage's top left, inside the safe column (SOURCE: NPR SCIENCE, micro on
   * black), while its strap is up. A recreation carries its own credit.
   */
  sourcePlate(t, scene) {
    // (COSMOS's globe carries its source in its display's foot)
    if (this.orbitAt === t && scene.shot === 'map') return;
    const cur = this.renderer?.graphics?.strap;
    if (scene.recreation || !cur?.cur || cur.outAt !== null || !cur.cur.headline) return;
    const source = this.sourceOf(scene);
    if (!source) return;
    const since = Math.max(0, t - (cur.cur.since || 0));
    const p = easeOutQuint(seg(since, 0.2, 0.3));
    if (p <= 0) return;
    const text = microFit(`SOURCE: ${source}`, SAFE.w - 8);
    const w = measureText(text, 1, 'micro') + 8;
    const ctx = this.ctx;
    ctx.fillStyle = P.black;
    ctx.fillRect(SAFE.x, this.box.y + 4, Math.round(w * p), 9);
    if (p >= 1) drawText(ctx, text, SAFE.x + 4, this.box.y + 6, S.microFog);
  }

  /**
   * NEWS IN 60's progress rule (the strap's top line on air: graphics/strap.js), 2 px along the stage's top edge
   * across the safe column: the slate track, the yellow fill in whole pixels.
   */
  progressRule() {
    const progress = this.renderer?.graphics?.strap?.progress;
    if (!Number.isFinite(progress)) return;
    const ctx = this.ctx;
    ctx.fillStyle = P.slate;
    ctx.fillRect(SAFE.x, this.box.y, SAFE.w, 2);
    ctx.fillStyle = P.yellow;
    ctx.fillRect(SAFE.x, this.box.y, Math.floor(SAFE.w * clamp(progress, 0, 1)), 2);
  }

  /** The story's outlet as the strap shows it (the channel's own name is no source). */
  sourceOf(scene) {
    const cur = this.renderer?.graphics?.strap?.cur;
    const story = scene.storyId && scene.rundown ? scene.rundown.find((r) => r.storyId === scene.storyId) : null;
    const source = String(cur?.plate || story?.source || '').split(' / ')[0].trim();
    return source && source !== this.channel?.name ? source.toUpperCase() : '';
  }

  drawCaptions(t, scene) {
    const sp = this.sp || {};
    let text = sp.text;
    // the montage's teaser reads the headline on screen: no caption repeats it
    if (text && ['montage', 'tease'].includes(scene.shot)) {
      const card = scene.card || {};
      const item = scene.shot === 'montage' ? scene.rundown?.[card.index] : scene.rundown?.find((r) => r.storyId === card.items?.[0]);
      if (item?.headline) {
        const head = new Set(contentWords(item.headline));
        const words = contentWords(text);
        if (words.length >= 2 && words.filter((w) => head.has(w)).length >= words.length * 0.6) text = null;
      }
    }
    if (text && scene.shot === 'fact' && scene.card?.term?.term) text = null;
    if (boardRepeats(text, scene)) text = null;
    this.caps.update(t, text, sp.charIndex, { grave: graveNow(scene, sp.slot) });
    this.caps.draw(this.ctx, t, { cx: SAFE.cx, bottom: V.caps.y + V.caps.h - 4 });
  }

  /** Full-frame channel shots (start, standby, break bumper...): the frame's middle and the logo. */
  drawChannelFrame(t, scene) {
    // (the full logo at 1x: at 2x it is 236 wide, past the frame's edges)
    const lw = measureLogo({ variant: 'full', scale: 1 }).w;
    drawLogo(this.ctx, Math.round((VW - lw) / 2), 30, { variant: 'full', scale: 1, t });
  }
}

/**
 * FILE (or FILE 2023, or PHOTO for a picture of the event itself) and a picture's credit as its licence asks
 * (server/rights.js onAirCredit: "FILE · JANE DOE · CC BY-SA 4.0 · PIXELATED"), set for the tall frame at (x, y) inside
 * a column `w` wide, all in the body face (7 px at 1x, 35 px on 1920: the size the compliance desk asks of a vertical
 * label, never the micro face): the tag white on black, the credit silver on black beside it, then under it across
 * the column, wrapped at whole parts and words (a word too long for a line is broken, never dropped: the licence asks
 * for all of it); PREVIEW · NOT CLEARED in yellow under it in a private preview. Returns the rows it took.
 */
export function drawVerticalCredit(ctx, credit, { x = SAFE.x, y, w = SAFE.w, uncleared = false } = {}) {
  const raw = String(credit || '').trim();
  if (!raw) return 0;
  const m = /^(FILE(?: \d{4})?|PHOTO)\s*·\s*/i.exec(raw);
  const tag = m ? m[1].toUpperCase() : 'PHOTO';
  const text = raw.slice(m ? m[0].length : 0).toUpperCase();
  const tw = measureText(tag) + 8;
  // the first line beside the tag, the others the column's width under it (each plate 8 px wider than its words)
  const lines = creditWords(text, w - tw - 1 - 8, w - 8);
  ctx.fillStyle = P.black;
  ctx.fillRect(x, y, tw, 11);
  drawText(ctx, tag, x + 4, y + 2, S.white);
  lines.forEach((line, i) => {
    const lw = measureText(line);
    const lx = i === 0 ? x + tw + 1 : x;
    ctx.fillStyle = P.black;
    ctx.fillRect(lx, y + i * 12, lw + 8, 11);
    drawText(ctx, line, lx + 4, y + 2 + i * 12, S.silver);
  });
  let h = Math.max(1, lines.length) * 12 - 1;
  if (uncleared) {
    const pt = 'PREVIEW · NOT CLEARED';
    ctx.fillStyle = P.black;
    ctx.fillRect(x, y + h + 1, measureText(pt) + 8, 11);
    drawText(ctx, pt, x + 4, y + h + 3, { color: P.yellow });
    h += 12;
  }
  return h;
}

/**
 * A credit in lines of body type, the first at most `firstPx` wide and the others `restPx` (default: the same): its
 * parts (the author, the licence, PIXELATED) kept whole and joined with " · " while they fit, a line ending with "·"
 * before the next part; a part too long for a line wrapped at its words, a word too long for a line broken (never
 * dropped).
 */
export function creditWords(text, firstPx, restPx = firstPx, font = 'body') {
  const width = (s) => measureText(s, 1, font);
  const sep = width(' ·'); // (room kept on every line for the separator that may end it)
  const room = (n) => (n === 0 ? firstPx : restPx) - sep;
  const fits = (s, n) => width(s) <= room(n);
  const lines = [];
  const breakWord = (wd, n) => {
    if (fits(wd, n)) return [wd];
    const out = [];
    let cur = '';
    for (const ch of wd) {
      if (cur && !fits(cur + ch, n + out.length)) {
        out.push(cur);
        cur = '';
      }
      cur += ch;
    }
    return cur ? [...out, cur] : out;
  };
  for (const part of String(text || '').split(/\s+·\s+/).map((p) => p.trim()).filter(Boolean)) {
    const n = lines.length - 1;
    if (n >= 0 && fits(`${lines[n]} · ${part}`, n)) {
      lines[n] = `${lines[n]} · ${part}`;
      continue;
    }
    if (n >= 0) lines[n] = `${lines[n]} ·`;
    // the part on a line of its own, each word joining the line while it fits
    let first = true;
    for (const wd of part.split(/\s+/).filter(Boolean)) {
      const k = lines.length - 1;
      if (!first && fits(`${lines[k]} ${wd}`, k)) {
        lines[k] = `${lines[k]} ${wd}`;
        continue;
      }
      for (const piece of breakWord(wd, lines.length)) lines.push(piece);
      first = false;
    }
  }
  return lines;
}

