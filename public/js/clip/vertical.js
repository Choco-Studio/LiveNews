// The vertical picture (?format=vertical: 216x384, 9:16 at 5x = 1080x1920; docs/publishing/vertical.md). Not a crop of
// the horizontal channel: the frame is composed again, every frame, from the channel's own drawing code, in bands
// laid out for a phone (clip/layout.js): the bug and the programme at the top, the story's tag and headline, the
// stage, the captions, a calm foot for the feed's own text.
//
// The stage, by what the horizontal director has on air (scene.shot):
//   studio (wide, close)  the speaker's single, framed for a tall picture by a Stage of its own (v2 runtime/stage.js,
//                         a second instance: its own camera on the voice's owner, its own cue clock on the same plan,
//                         so the presenter gestures on the same words), cut when the voice changes hands
//   fact                  the board set again for the stage's width (clip/vboards.js)
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
import { clamp, seg, easeOutQuint, balanceLines, textW } from '../gfx/index.js';
import { bayer } from '../gfx/dither.js';
import { mk } from '../gfx/canvas.js';
import { u32 } from '../gfx/color.js';
import { TOP } from '../graphics/layout.js';
import { contentWords } from '../graphics/index.js';
import { VW, VH, V, HW, HH, SAFE, boardBox } from './layout.js';
import { WordCaptions, CLIP_CAPTION } from './captions.js';
import { drawVerticalBoard, boardKind, microFit } from './vboards.js';
import { drawBugOnly, drawProgrammeTag, speechNow, graveNow, boardRepeats } from './graphics.js';

const ST = V.stage;
const REST_WALL = Object.freeze({ mode: 'rest' });
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

/** The framing a vertical single asks the Stage for: the quiz's own singles, a duo's single, a solo's centred single. */
export function verticalFraming(cast, slot) {
  if (cast?.H && cast?.A && cast?.B) return slot === 'H' ? 'quiz-host' : slot === 'A' ? 'quiz-a' : 'quiz-b';
  return cast?.B ? 'single' : 'mcu';
}

/** Where a 216-wide window sits over a 384-wide frame to centre `x` (clamped to the frame). */
export const windowX = (x, w = VW) => clamp(Math.round(x - w / 2), 0, HW - w);

export class VerticalCompositor {
  constructor({ canvas, source, renderer = null, audio = null, channel = null, makeStage = null }) {
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
      const on = !['start', 'standby', 'ad', 'ident', 'promo', 'countdown', 'breakingCard'].includes(scene.shot);
      if (on && this.lastMode !== 'on') this.onAt = t;
      this.lastMode = on ? 'on' : 'off';
      this.sp = speechNow(this.audio, scene);
      this.profile = profileOf(scene);
      this.box = this.profile.box;
      this.drawStage(t, scene);
      if (on) {
        if (this.profile.title) this.drawTitle(t, scene);
        this.drawMast(t, scene);
        if (this.profile.captions !== false) this.drawCaptions(t, scene);
        this.drawFoot(t, scene);
      } else this.drawChannelFrame(t, scene);
    } catch (err) {
      this.log(err);
    }
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
      if (STUDIO.has(shot)) this.studio(t, scene);
      else if (shot === 'fact') {
        if (!this.board(t, scene, dt)) this.middle(scene);
      } else if (shot === 'map') this.map(t, scene, dt);
      else if (shot === 'full') this.picture(t, scene, dt);
      else if (shot === 'montage' || shot === 'tease') this.headlineFrame(t, scene, dt);
      else if (shot === 'location') this.remote(scene);
      else if (shot === 'twoway') this.twoway(scene);
      else if (shot === 'broll') this.broll(t, scene, dt);
      else if (shot === 'quiz' && this.quiz?.(t, scene, dt, boardBox(this.box))) {
        /* the programme's own vertical board */
      } else if (shot === 'scores' && this.sport && scene.card?.scores?.length) {
        // FULL TIME's SCORE CENTRE: the board set again, a result on two lines
        this.ctx.drawImage(groundOf(VW, this.box.h), 0, this.box.y);
        this.sport.scoreboard(this.ctx, dt, scene.card, boardBox(this.box), THEME_ACCENT[scene.program?.theme] || P.orange);
      } else if (shot === 'weather' && this.weather?.(t, scene, boardBox(this.box))) {
        /* WORLD WEATHER's board set again, or the window on the presenter */
      } else this.middle(scene);
      // PAY ATTENTION's scores strip over the studio (the half-time scores and the banter after them)
      if (scene.quizStrip && STUDIO.has(shot)) this.quizStrip(t, scene.quizStrip);
      // the story's source and NEWS IN 60's minute, on the stage: in a clip the hook holds the title band and the feeds
      // cover the foot, so the stage is where they are seen (a board, the montage and a recreation carry their own)
      if ((STUDIO.has(shot) || ['map', 'full', 'broll', 'location'].includes(shot)) && this.profile?.name !== 'tall') this.sourcePlate(t, scene);
      this.progressRule();
      if (scene.recreation) this.recreationLabel(scene.recreation, scene);
    } finally {
      ctx.restore();
    }
  }

  /** The horizontal frame's middle, 216 wide (the fallback for a shot with no vertical layout of its own). */
  middle(scene, cx = HW / 2) {
    const sx = windowX(cx);
    const sy = clamp(Math.round((HH - this.box.h) / 2), 0, HH - this.box.h);
    this.ctx.drawImage(this.src, sx, sy, VW, this.box.h, 0, this.box.y, VW, this.box.h);
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

  studio(t, scene) {
    const stage = this.vstage();
    if (!stage) return this.middle(scene);
    const slot = this.speakerOf(scene);
    if (slot !== this.speaker) {
      this.speaker = slot;
      this.cutAt = t;
    }
    if (!this.proxy || Object.getPrototypeOf(this.proxy) !== scene) this.proxy = Object.create(scene);
    const p = this.proxy;
    p.shot = 'close';
    p.focus = slot;
    p.framing = verticalFraming(scene.cast, slot);
    p.shotSince = this.cutAt;
    p.cameraMove = null;
    p.cameraMoveSince = null;
    // the studio wall at rest behind the single (wall.js 'rest', as behind a two-way's box): no plate, map label,
    // figure or wordmark for the tall crop to cut in half; the story's own picture, map and figure have their shots
    p.wall = REST_WALL;
    const ok = stage.frame(this.auxCtx, t, p, true);
    if (!ok) return this.middle(scene);
    // the speaker's head: their seat's screen x and neck line in this frame (the Stage's visible list)
    let hx = this.lastHead.x;
    let ny = this.lastHead.y;
    for (const it of stage.vis || []) {
      if (it.slot === slot) {
        hx = it.x;
        ny = it.y;
      }
    }
    this.lastHead.x = hx;
    this.lastHead.y = ny;
    const sx = windowX(hx);
    // the neck two thirds down the stage: the eyes on its upper third, room over the hair
    const sy = clamp(Math.round(ny - this.box.h * 0.62), 0, HH - this.box.h);
    this.ctx.drawImage(this.aux, sx, sy, VW, this.box.h, 0, this.box.y, VW, this.box.h);
    this.nameTag(t, scene, slot);
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
    const id = scene.cast?.[slot];
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
      ctx.rect(8, y, vis, 26);
      ctx.clip();
      ctx.fillStyle = acc;
      ctx.fillRect(8, y, 2, role ? 22 : 13);
      ctx.fillStyle = P.ink;
      ctx.fillRect(10, y, w - 2, role ? 22 : 13);
      drawText(ctx, name, 14, y + 3, S.white);
      if (role) drawText(ctx, role, 14, y + 14, S.microSilver);
    } finally {
      ctx.restore();
    }
  }

  board(t, scene, dt) {
    const card = scene.card;
    const kind = boardKind(card);
    if (kind === 'score' && this.sport) {
      this.ctx.drawImage(groundOf(VW, this.box.h), 0, this.box.y);
      return this.sport.scoreline(this.ctx, dt, card, boardBox(this.box), THEME_ACCENT[scene.program?.theme] || P.orange);
    }
    // FULL TIME's COMING UP and THE MOMENT ON THE BOARD, set for the tall frame
    if ((kind === 'fixtures' || kind === 'chalk') && this.sport?.[kind]) {
      this.ctx.drawImage(groundOf(VW, this.box.h), 0, this.box.y);
      return this.sport[kind](this.ctx, dt, card, boardBox(this.box), THEME_ACCENT[scene.program?.theme] || P.orange);
    }
    if (!kind || ['score', 'chalk', 'fixtures'].includes(kind)) return false;
    this.ctx.drawImage(groundOf(VW, this.box.h), 0, this.box.y);
    return drawVerticalBoard(this.ctx, dt, card, { ...boardBox(this.box), programId: scene.program?.id, accent: THEME_ACCENT[scene.program?.theme] });
  }

  /**
   * The map over the safe column (its place label and the names round it fall inside x 8-188), the strip beyond it in
   * the map's own sea, under the feed's buttons.
   */
  map(t, scene, dt) {
    const card = scene.card || {};
    const w = SAFE.right + 8;
    drawWorldMap(this.ctx, t, dt, { x: 0, y: this.box.y, w, h: this.box.h, lat: card.lat, lon: card.lon, scope: card.scope, place: card.place, accent: THEME_ACCENT[scene.program?.theme], programId: scene.program?.id, from: card.from, pins: card.pins, duration: card.duration, follow: true });
    this.seaStrip(w);
  }

  /** The stage beyond the safe column, after a map drawn to its edge: the map's last column of sea, carried on. */
  seaStrip(x) {
    this.ctx.drawImage(this.canvas, x - 1, this.box.y, 1, this.box.h, x, this.box.y, VW - x, this.box.h);
  }

  picture(t, scene, dt) {
    const img = scene.storyId ? scene.images?.get?.(scene.storyId) : null;
    const pic = img?.full;
    if (!pic) return this.middle(scene);
    const { ox, oy } = picturePan(dt, pic.width - VW, pic.height - this.box.h, scene.panDir, scene.program?.id);
    this.ctx.drawImage(pic, -Math.round(ox), this.box.y - Math.round(oy));
  }

  broll(t, scene, dt) {
    const img = scene.storyId ? scene.images?.get?.(scene.storyId) : null;
    if (!scene.card?.footage && img?.full) return this.picture(t, scene, dt);
    if (!scene.card?.footage && scene.remote && Number.isFinite(scene.remote.lat)) {
      drawWorldMap(this.ctx, t, dt, { x: 0, y: this.box.y, w: SAFE.right + 8, h: this.box.h, lat: scene.remote.lat, lon: scene.remote.lon, scope: scene.remote.scope, place: scene.remote.place, accent: THEME_ACCENT[scene.program?.theme], programId: scene.program?.id, follow: true });
      this.seaStrip(SAFE.right + 8);
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
    ctx.drawImage(groundOf(VW, this.box.h), 0, this.box.y);
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
    // (the backdrop fills the box above the plate; a photo is centred on the safe column)
    if (pic) ctx.drawImage(pic, Math.round(SAFE.cx - pic.width / 2), this.box.y);
    else if (Number.isFinite(loc?.lat) && Number.isFinite(loc?.lon)) drawWorldMap(ctx, t, dt, { x: 0, y: this.box.y, w: VW, h: this.box.h, lat: loc.lat, lon: loc.lon, scope: loc.scope, place: '', label: false, accent: acc, programId: scene.program?.id, follow: true });
    else ctx.drawImage(groundOf(VW, this.box.h), 0, this.box.y);
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
    const p = easeOutQuint(seg(dt, 0, 0.3));
    ctx.fillStyle = P.black;
    ctx.fillRect(0, py, Math.round(VW * p), plateH);
    ctx.fillStyle = acc;
    ctx.fillRect(0, py, Math.round(VW * p), 1);
    for (let i = 0; i < lines.length; i++) {
      const lp = seg(dt, 0.15 + i * 0.07, 0.3);
      if (lp <= 0) continue;
      drawText(ctx, lines[i], 12, py + 8 + i * lh + Math.round((1 - easeOutQuint(lp)) * 4), scale === 2 ? S.white2 : S.white);
    }
    if (item.source) drawText(ctx, microFit(`SOURCE: ${String(item.source).toUpperCase()}`, SAFE.w - 8), 12, py + 8 + textH + 6, S.microFog);
    // the tag: TOP STORIES (with the pips of the run) or STILL TO COME (on the plate: the clip's hook covers the
    // title band all clip long)
    const tag = tease ? 'STILL TO COME' : 'TOP STORIES';
    const tw = measureText(tag, 1, 'micro') + 8;
    ctx.fillStyle = P.black;
    ctx.fillRect(8, py - 11, tw, 9);
    drawText(ctx, tag, 12, py - 9, S.microWhite);
    if (!tease) {
      const total = scene.rundown?.length || 1;
      for (let i = 0; i < Math.min(total, 8); i++) {
        ctx.fillStyle = i <= (card.index || 0) ? P.white : P.slate;
        ctx.fillRect(8 + tw + 4 + i * 6, py - 7, 4, 2);
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
    drawBugOnly(ctx, t, this.onAt, 8, 10);
    const title = scene.program?.title ? String(scene.program.title) : '';
    if (title) {
      const color = THEME_ACCENT[scene.program?.theme] || P.red;
      const w = measureText(title) + 8;
      drawProgrammeTag(ctx, SAFE.right - w, 10, title, color);
    }
  }

  /** The story's tag and headline (the channel's strap, set for the tall frame), else the programme's title. */
  drawTitle(t, scene) {
    const ctx = this.ctx;
    const y0 = V.title.y;
    const g = this.renderer?.graphics;
    // (in a clip the hook holds this band all clip long: what a viewer must see lives on the stage, sourcePlate)
    const cur = g?.strap?.cur && g.strap.outAt === null ? g.strap.cur : null;
    const rec = scene.recreation;
    const headline = cur?.headline || '';
    if (headline && !rec && !['montage', 'tease'].includes(scene.shot)) {
      const tag = cur.tag || '';
      const color = cur.tagColor || THEME_ACCENT[scene.program?.theme] || P.red;
      const two = balanceLines(headline.toUpperCase(), SAFE.w, 1, 2);
      const fits = !two[two.length - 1]?.endsWith('...');
      const lines = fits ? two : balanceLines(headline.toUpperCase(), SAFE.w, 1, 3);
      const showTag = fits && tag;
      const since = Math.max(0, t - (cur.since || 0));
      const p = easeOutQuint(seg(since, 0, 0.35));
      let y = y0 + (showTag ? 4 : 3);
      if (showTag) {
        const tw = measureText(tag) + 8;
        const vis = Math.round(tw * p);
        if (vis > 0) {
          ctx.fillStyle = color;
          ctx.fillRect(8, y, vis, 11);
          if (vis >= tw) drawText(ctx, tag, 12, y + 2, { color: inkOn(color) });
        }
        y += 14;
      }
      for (let i = 0; i < lines.length; i++) {
        const lp = seg(since, 0.1 + i * 0.07, 0.3);
        if (lp > 0) drawText(ctx, lines[i], 8, y + i * 11 + Math.round((1 - easeOutQuint(lp)) * 3), S.white);
      }
      return;
    }
    // no story strap: the programme (and, in a quiz, the board's round)
    const title = String(scene.program?.title || this.channel?.name || 'GLOBIT 24');
    const tagline = scene.program?.tagline ? String(scene.program.tagline) : '';
    drawText(ctx, title, 8, y0 + 7, S.white2);
    if (tagline) drawText(ctx, microFit(tagline, SAFE.w), 8, y0 + 27, S.microFog);
  }

  /**
   * The story's source on a plate at the stage's top left, inside the safe column (SOURCE: NPR SCIENCE, micro on
   * black), while its strap is up. A recreation carries its own credit.
   */
  sourcePlate(t, scene) {
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

  drawFoot(t, scene) {
    const ctx = this.ctx;
    const y = V.foot.y;
    // the foot: the feeds' buttons and caption sit over it, so it carries nothing a viewer must read (the source is in
    // the title band, beside the story's tag): a rule and the channel's name, small
    ctx.fillStyle = P.slate;
    ctx.fillRect(8, y, SAFE.w, 1);
    const lw = measureLogo({ variant: 'full', scale: 1 }).w;
    drawLogo(ctx, Math.round((VW - lw) / 2), VH - 30, { variant: 'full', scale: 1, t: null });
  }

  /** Full-frame channel shots (start, standby, break bumper...): the frame's middle and the logo. */
  drawChannelFrame(t, scene) {
    const lw = measureLogo({ variant: 'full', scale: 2 }).w;
    drawLogo(this.ctx, Math.round((VW - lw) / 2), 30, { variant: 'full', scale: 2, t });
  }
}

const DARK_INK = new Set([P.yellow, P.cyan, P.green, P.cream, P.white, P.silver, P.orange, P.pink]);
const inkOn = (c) => (DARK_INK.has(c) ? P.black : P.white);
