// The v2 Stage (owner: INTEGRATION stream): the live studio picture of the
// real channel, built by studio.js's Renderer when v2 is on (runtime/host.js
// wraps it with the fallback rules). Nothing here is planned per story: the
// actors come from the episode's cast, the events from the director's segment
// plan (scene.segPlan), the camera from the director's shot (scene.shot /
// framing / focus / cameraMove / shotSince), the set from the programme.
//
// Every frame, update() (all shots, cheap bookkeeping):
//   - a new episode (scene.episode.id, else programme + cast) rebuilds the actors:
//     lookFor(cast[slot], channel.presenters[id]); seats A/B (side +1 / -1) or
//     solo (side 0); seed = hashSeed(episode.id + slot); perf.speech =
//     liveSpeech() over a per-frame cache, so audio.speechFrame() is sampled once
//     per slot per frame (the lag pose and FACES' adapter read the cached frame);
//   - real cuts (shotSince / shot / focus / framing change) go to the cue clock
//     (cut guard), re-frame the camera and latch the wall state (the wall only
//     changes under a cut);
//   - the cue clock fires the plan's events into the actors; emotions follow
//     scene.anchors (the director's per-segment moods); listeners get perf.listen.
// draw() (studio shots only): camera (CAMERA framing() / cameraAt(), presets
// if they are missing), background + desk (SET, programme style, live wall,
// detail level), actors clipped by the desk, present, then the inset picture
// box on singles (until the over-the-shoulder framing carries the picture).
// studio.js then draws graphics and stingers on top, exactly as before.
// The rig runs on its own clock (renderer t - epoch, reset per episode and
// moved back under a cut after 14 min) because the idle tables cover 15 min.
// No per-frame allocation in this file.
import { frame, drawActors, actor as makeActor, QUALITY } from '../scene.js';
import * as SETM from '../studio/set.js';
import { SET, kAt, sxOf, syOf } from '../studio/geometry.js';
import * as CAM from '../camera.js';
import { liveSpeech } from '../speech.js';
import { hashSeed } from '../direction/context.js';
import { u32 } from '../pixbuf.js';
import { P } from '../../../palette.js';
import { THEME_ACCENT } from '../../../cast.js';
import { CueClock, prunePerf, shiftPerf } from './cueclock.js';

/** Legacy shot names the Stage draws (framings travel in scene.framing). */
export const STUDIO_SHOTS = new Set(['wide', 'close']);

const CLOCK_REBASE = 840; // s of rig time before the rig clock moves back (at the next cut)
const PRUNE_EVERY = 2; // s
const W = 384;

// Every programme's set variant, baked ahead of air (warmSets): the owner's 21:05 blocker, never a
// frame without the set. set.js bakes synchronously on first use anyway; warming moves that cost
// (10-30 ms per programme) off the frame path.
const STYLE_IDS = ['world-now', 'tech-bytes', 'cosmos', 'money-minute', 'news-60'];

/**
 * Bake every programme's set ahead of air (StageHost calls it once at boot, in idle time): SET's
 * warmSets() (wall light, wall tables, logo plate, raster loops; idempotent), else one warmSet per id.
 */
export function warmSets(idle = (fn) => fn()) {
  const ids = typeof SETM.warmSets === 'function' ? [null] : STYLE_IDS;
  for (const id of ids) {
    idle(() => {
      try {
        if (id === null) SETM.warmSets();
        else SETM.warmSet?.(id);
      } catch {
        /* the first frame of that programme bakes it instead (set.js bakes synchronously on first use) */
      }
    });
  }
}

/** Seats for a cast: A left (+1: partner on screen-right), B right (-1), or one centred solo seat (0). */
export function castSeats(cast) {
  const c = cast && typeof cast === 'object' ? cast : {};
  if (c.A && c.B) {
    return [
      { slot: 'A', X: SET.seatX.A, side: 1 },
      { slot: 'B', X: SET.seatX.B, side: -1 },
    ];
  }
  const slot = c.A ? 'A' : Object.keys(c).find((k) => c[k]);
  return slot ? [{ slot, X: SET.seatX.solo ?? 0, side: 0 }] : [];
}

/** Identity of what is on air: the episode id, else programme + cast. */
export function episodeKey(scene) {
  if (scene?.episode?.id) return String(scene.episode.id);
  const c = scene?.cast || {};
  return `${scene?.program?.id || ''}|${c.A || ''}|${c.B || ''}`;
}

/** Framing for a legacy shot when the director sent none. */
export function defaultFraming(shot, solo, inset) {
  if (shot === 'close') return solo ? (inset ? 'mcu-l' : 'mcu') : 'single';
  return solo ? 'solo-wide' : 'wide';
}

const INSET_AREA = 104 * 62 * 0.6; // px of visible wall that make the inset box redundant

/** Screen area (px) of the video wall's interior that a camera shows. */
function wallVisible(cam) {
  const k = kAt(cam, SET.wallZ);
  const S = SET.screen;
  const x0 = Math.max(0, sxOf(cam, k, S.x0)), x1 = Math.min(W, sxOf(cam, k, S.x1));
  const y0 = Math.max(0, syOf(cam, k, S.y0)), y1 = Math.min(216, syOf(cam, k, S.y1));
  return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
}

const REST_FRAME = Object.freeze({ slot: null, speaking: false, level: 0, viseme: 'rest', next: 'rest', mix: 0, wordIndex: -1, charIndex: -1, sentenceIndex: -1, accent: 0, pause: false });

function sameCamera(a, b) {
  return a === b || (a.x === b.x && a.y === b.y && a.z === b.z && a.zoom === b.zoom && a.hy === b.hy && a.soft === b.soft);
}

/** When the camera move on air started: the director's cameraMoveSince, else the cut, else now. */
function moveStart(scene, t, noCut = false) {
  const since = scene.cameraMoveSince;
  if (Number.isFinite(since) && since <= t && (noCut || !(since < scene.shotSince))) return since;
  return noCut ? t : (scene.shotSince ?? t);
}

function lap(prof, key, since) {
  const now = performance.now();
  prof[key] = (prof[key] || 0) + now - since;
  return now;
}

const FRAME_KEYS = ['slot', 'speaking', 'level', 'viseme', 'next', 'mix', 'wordIndex', 'charIndex', 'sentenceIndex', 'accent', 'pause'];
function copyFrame(src, out) {
  if (!out || out === src) return src;
  for (let i = 0; i < FRAME_KEYS.length; i++) out[FRAME_KEYS[i]] = src[FRAME_KEYS[i]];
  return out;
}

/** The wall a scene asks for (until SET's wallFromScene() lands). */
function wallOf(scene, plan, out) {
  const w = scene.wall || {};
  const seg = plan?.ctx?.seg?.type === 'story' && plan.ctx.seg.storyId === scene.storyId ? plan.ctx.seg : null;
  out.image = null;
  out.location = null;
  out.figure = null;
  out.label = null;
  const img = w.mode === 'image' ? scene.images?.get?.(w.storyId || scene.storyId) : null;
  if (img) {
    out.mode = 'picture';
    out.image = img;
    out.label = seg?.kicker || null;
  } else if (seg?.location && Number.isFinite(seg.location.lat)) {
    out.mode = 'map';
    out.location = seg.location;
    out.label = seg.location.place || null;
  } else if (seg && (seg.numbers?.length || seg.fact)) {
    out.mode = 'figure';
    out.figure = seg.numbers?.[0] || seg.fact;
    out.label = seg.kicker || null;
  } else if (w.mode === 'source' && (seg?.kicker || w.source)) {
    out.mode = 'plate';
    out.label = seg?.kicker || w.source;
  } else out.mode = 'idle';
  return out;
}

export class Stage {
  /**
   * @param opts { audio (speechFrame), channel ({ presenters }), log(msg),
   *               idle: (fn) => void for the per-episode warm-up (default requestIdleCallback in
   *               a browser; null = no warm-up, e.g. deterministic labs and tests) }
   */
  constructor({ audio = null, channel = null, log = null, idle } = {}) {
    this.audio = audio;
    this.idle = idle !== undefined ? idle : typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 1000 }) : null;
    this.presenters = channel?.presenters || {};
    this.log = log || ((m) => console.warn(`[v2 stage] ${m}`));
    this.seen = new Set();
    this.onError = null; // (t) => void, set by the host
    this.lod = 0; // detail level from the watchdog (0..2)
    this.clock = new CueClock({ log: (m) => this.log(m) });
    this.key = null;
    this.actors = [];
    this.frames = {};
    // liveSpeech() reads this proxy: one real speechFrame() per slot per frame (sampled in
    // update); like the engine it fills `out` when given one (FACES' source reads it back)
    this.proxy = { speechFrame: (ms, slot, out) => copyFrame(this.frames[slot] || REST_FRAME, out) };
    this.epoch = 0;
    this.cast = {};
    this.solo = false;
    this.programId = 'world-now';
    this.accent = u32(P.red);
    this.style = null;
    this.cutSince = null;
    this.cutShot = null;
    this.cutFocus = null;
    this.cutFraming = null;
    this.cutAt = -Infinity;
    this.moveSince = 0; // renderer time the camera move on air started (CAMERA rule 4)
    this.warmed = false;
    this.visibleSince = 0; // shotSince of the last cut the viewer could see
    this.spec = { framing: 'wide', cast: null, focus: 'A', solo: false, side: undefined, programId: 'world-now', move: null };
    this.base = null; // camera of the current framing
    this.camOut = CAM.makeCamera();
    this.wall = { mode: 'idle', image: null, location: null, figure: null, label: null, since: 0, focus: 'A', solo: false };
    this.bgOpts = { style: null, wall: this.wall, shotSince: 0, lod: 0, cut: false };
    this.clipRows = new Int16Array(W);
    this.list = [];
    this.vis = [];
    this.inset = null;
    this.nextPrune = 0;
    this.speaker = null;
    this.prof = null;
  }

  setChannel(channel) {
    this.presenters = channel?.presenters || {};
  }

  /**
   * One renderer frame. Bookkeeping always; the studio picture when `draw`.
   * Returns false on an error (logged once per distinct message): the old path draws that frame.
   */
  frame(ctx, t, scene, draw = true) {
    try {
      this.update(t, scene);
      if (draw) this.render(ctx, t, scene);
      return true;
    } catch (err) {
      const msg = `${err?.name || 'Error'}: ${err?.message || err}`;
      if (!this.seen.has(msg) && this.seen.size < 50) {
        this.seen.add(msg);
        try {
          console.error('[v2 stage]', err);
        } catch {
          /* no console */
        }
      }
      this.onError?.(t);
      return false;
    }
  }

  // --- bookkeeping -----------------------------------------------------------

  update(t, scene) {
    const key = episodeKey(scene);
    if (key !== this.key) this.build(scene, t, key);
    const audio = this.audio;
    if (audio && typeof audio.speechFrame === 'function') {
      for (let i = 0; i < this.actors.length; i++) {
        const slot = this.actors[i].slot;
        this.frames[slot] = audio.speechFrame(t * 1000, slot, this.frames[slot] || {}) || REST_FRAME;
      }
    }
    const plan = scene.segPlan ?? null;
    const own = plan && (!plan.ctx || !scene.episode?.id || plan.ctx.episodeId === scene.episode.id);
    this.clock.load(own ? plan : null, t);
    if (scene.shotSince !== this.cutSince || scene.shot !== this.cutShot || scene.focus !== this.cutFocus || (scene.framing ?? null) !== this.cutFraming) this.onCut(t, scene);
    else if ((scene.cameraMove || null) !== this.spec.move) {
      // a move on the shot already on air (CAMERA rule 4): it runs from when it was applied
      this.spec.move = scene.cameraMove || null;
      this.moveSince = moveStart(scene, t, true);
    }
    // who speaks: the voice, else the plan's speaker while its speech runs
    let speaker = null;
    for (let i = 0; i < this.actors.length; i++) if (this.frames[this.actors[i].slot]?.speaking) speaker = this.actors[i].slot;
    if (!speaker && plan?.ctx && plan.speechStart != null && plan.speechEnd == null) speaker = plan.ctx.speaker;
    this.speaker = speaker;
    const rt = t - this.epoch;
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      const emo = scene.anchors?.[a.slot]?.emotion || 'neutral';
      if (emo !== a.emotion) {
        a.emotion = emo;
        a.perf.emotions.push({ t0: rt, name: emo });
      }
      a.perf.listen = this.actors.length > 1 && speaker !== null && a.slot !== speaker;
    }
    this.clock.tick(t, own && plan.ctx ? this.frames[plan.ctx.speaker] || null : null);
    if (t >= this.nextPrune) {
      this.nextPrune = t + PRUNE_EVERY;
      for (let i = 0; i < this.actors.length; i++) prunePerf(this.actors[i].perf, rt);
    }
  }

  build(scene, t, key) {
    this.key = key;
    const cast = scene.episode?.cast || scene.cast || {};
    this.cast = cast;
    const seats = castSeats(cast);
    this.solo = seats.length === 1;
    this.epoch = t;
    this.clock.reset();
    this.clock.epoch = t;
    this.clock.perfs = {};
    const epId = scene.episode?.id ?? key;
    const presenters = scene.presenters || this.presenters || {}; // config/channel.json entries (set by the v2 director)
    this.actors = seats.map(({ slot, X, side }) => {
      const id = cast[slot];
      const perf = { side, seed: hashSeed(`${epId}${slot}`), gestures: [], emotions: [], look: [], speech: liveSpeech(this.proxy, slot), listen: false, gain: 1 };
      this.clock.perfs[slot] = perf;
      return { slot, id, X, side, emotion: null, actor: makeActor(id, perf, presenters[id]), perf };
    });
    this.list = this.actors.map((a) => ({ actor: a.actor, X: a.X, x: 0, y: 0, s: 1, clip: true, slot: a.slot }));
    for (const a of this.actors) this.frames[a.slot] ||= {};
    const program = scene.episode?.program || scene.program || {};
    this.programId = program.id || 'world-now';
    this.accent = u32(THEME_ACCENT[program.theme] || P.red);
    // the programme's set style, now (studio/styles.js is a static import of set.js): the first
    // frame of a new programme already has its own set and desk, never a stale or default one
    this.style = null;
    try {
      this.style = SETM.styleFor?.(this.programId) || null;
    } catch (err) {
      this.log(`style ${this.programId}: ${err?.message || err}`);
    }
    this.cutSince = undefined; // re-frame on the next update
    this.base = null;
    this.warmed = false;
    if (this.idle) this.idle(() => this.key === key && this.warm());
  }

  /**
   * Warm-up for a new episode, in idle time while its open plays: bake the programme's set,
   * measure the cast's framings (CAMERA) and draw one frame offscreen, so the first studio frame
   * pays no first-use cost (skin maps, look metrics, the wall bake). Never presents anything.
   */
  warm() {
    if (this.warmed) return;
    this.warmed = true;
    try {
      SETM.warmSet?.(this.programId);
      CAM.warmFraming?.(this.cast);
      if (STUDIO_SHOTS.has(this.cutShot) || !this.list.length) return; // on air already: the real frame does it
      // the actors once, at the scale of a single (the costliest LOD): skin maps, look caches and the
      // rig's code paths are ready; the set's wall state is not touched (SET's warmSets covers the set)
      const W2 = W / 2;
      for (let i = 0; i < this.list.length; i++) {
        const it = this.list[i];
        it.x = W2;
        it.y = 120;
        it.s = 3;
        this.vis.length = 0;
        this.vis.push(it);
        drawActors(1, this.vis, null);
      }
      this.vis.length = 0;
    } catch (err) {
      this.log(`warm-up: ${err?.message || err}`);
    }
  }

  /** A real cut: cue clock guard, camera framing, wall latch, rig clock rebase. */
  onCut(t, scene) {
    const prevShot = this.cutShot;
    const prevBase = this.base;
    this.cutSince = scene.shotSince;
    this.cutShot = scene.shot;
    this.cutFocus = scene.focus;
    this.cutFraming = scene.framing ?? null;
    this.cutAt = t;
    const plan = scene.segPlan ?? null;
    const wall = this.wall;
    if (typeof SETM.wallFromScene === 'function') {
      const w = SETM.wallFromScene(scene, this.style || this.programId);
      Object.assign(wall, w);
    } else wallOf(scene, plan, wall);
    wall.focus = this.solo ? 'solo' : scene.focus === 'B' ? 'B' : 'A';
    wall.solo = this.solo;
    this.inset = scene.shot === 'close' && wall.mode === 'picture' && scene.framing !== 'ots' ? wall.image?.small || null : null;
    // camera framing for this shot
    const spec = this.spec;
    spec.framing = scene.framing || defaultFraming(scene.shot, this.solo, !!this.inset);
    spec.cast = this.cast;
    spec.focus = scene.focus in this.cast ? scene.focus : this.actors[0]?.slot || 'A';
    spec.solo = this.solo;
    spec.side = this.solo && this.inset ? 1 : undefined;
    spec.programId = this.programId;
    spec.move = scene.cameraMove || null;
    this.moveSince = moveStart(scene, t);
    this.base = this.frameCamera(spec, scene);
    // SET shows the picture on the wall itself: the inset box only when this framing hides the wall
    if (this.inset && typeof SETM.wallFromScene === 'function' && wallVisible(this.base) >= INSET_AREA) this.inset = null;
    // A "cut" to the identical picture (a chat hand-over on the same wide: new focus, same
    // camera) is no cut for the eye: no cut guard, and the wall changes with a wipe, not a jump.
    const invisible = !!prevBase && STUDIO_SHOTS.has(prevShot) && STUDIO_SHOTS.has(scene.shot) && !spec.move && sameCamera(prevBase, this.base);
    if (!invisible) {
      this.clock.cut(t);
      this.visibleSince = scene.shotSince ?? t;
      this.bgOpts.cut = true;
      if (t - this.epoch > CLOCK_REBASE) {
        const d = t - this.epoch;
        for (const a of this.actors) shiftPerf(a.perf, d);
        this.epoch = t;
        this.clock.epoch = t;
      }
    }
    wall.since = this.visibleSince;
  }

  frameCamera(spec, scene) {
    if (typeof CAM.framing === 'function') {
      try {
        const cam = CAM.framing(spec.framing, spec);
        if (cam) return cam;
      } catch (err) {
        this.log(`framing ${spec.framing}: ${err?.message || err}`);
      }
    }
    // presets (the approved demo cameras) until CAMERA's framing() exists
    if (scene.shot === 'close') return CAM.singleCam(this.solo ? 'A' : spec.focus, 3.4);
    return CAM.makeCamera({ x: 0, y: -60, z: this.solo ? 120 : 0, zoom: 1, hy: this.solo ? 50 : 52 });
  }

  // --- picture ---------------------------------------------------------------

  render(ctx, t, scene) {
    const spec = this.spec;
    let cam = this.base || CAM.makeCamera();
    if (spec.move && typeof CAM.cameraAt === 'function') cam = CAM.cameraAt(spec, t - this.moveSince, this.camOut) || cam;
    QUALITY.lag = this.lod < 1;
    const o = this.bgOpts;
    o.shotSince = this.visibleSince; // SET: a change = a cut (instant wall switch)
    o.lod = this.lod;
    const heads = this.drawStudio(cam, t, o);
    o.cut = false;
    const prof = this.prof;
    let p0 = prof ? performance.now() : 0;
    frame.present(ctx);
    if (this.inset) this.drawInset(ctx, heads);
    if (prof) {
      lap(prof, 'present', p0);
      prof.n++;
    }
  }

  /** Set, desk and actors into the shared frame (no present): the picture and the warm-up. */
  drawStudio(cam, t, o) {
    const prof = this.prof; // labs: { bg, desk, actors, present, n } ms accumulators, null on air
    let p0 = prof ? performance.now() : 0;
    o.style = this.style || this.programId;
    SETM.drawBackground(frame, cam, t, o);
    if (prof) p0 = lap(prof, 'bg', p0);
    SETM.drawDesk(frame, cam, this.clipRows, this.style ? undefined : this.accent);
    if (prof) p0 = lap(prof, 'desk', p0);
    // place the actors (inline placeActor: no allocation), skip anyone off screen
    const k = kAt(cam, SET.presenterZ);
    const s = Math.max(0.5, Math.round(22 * k) / 22);
    const y = syOf(cam, k, SET.neckY);
    const vis = this.vis;
    vis.length = 0;
    for (let i = 0; i < this.list.length; i++) {
      const it = this.list[i];
      it.x = sxOf(cam, k, it.X);
      it.y = y;
      it.s = s;
      if (it.x + 48 * s >= 0 && it.x - 48 * s <= W) vis.push(it);
    }
    const heads = drawActors(t - this.epoch, vis, this.clipRows);
    if (prof) lap(prof, 'actors', p0);
    return heads;
  }

  /** The story picture beside a single (old renderer's inset box, calmer frame). */
  drawInset(ctx, heads) {
    const img = this.inset;
    let hx = 120;
    for (let i = 0; i < this.vis.length; i++) if (this.vis[i].slot === this.spec.focus && heads[i]) hx = heads[i].cx;
    const bw = img.width, bh = img.height;
    const bx = hx < W / 2 ? W - 32 - bw : 32;
    const by = 30;
    ctx.fillStyle = P.black;
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = P.steel;
    ctx.fillRect(bx - 3, by - 3, bw + 6, 1);
    ctx.fillRect(bx - 3, by + bh + 2, bw + 6, 1);
    ctx.fillRect(bx - 3, by - 2, 1, bh + 4);
    ctx.fillRect(bx + bw + 2, by - 2, 1, bh + 4);
    ctx.drawImage(img, bx, by);
  }
}
