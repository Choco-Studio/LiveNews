// Integration lab (owner: INTEGRATION stream): the whole v2 runtime of the real
// channel, deterministic and capturable frame by frame, for one saved episode
// per programme (the offline channel's /api/queue, embedded at the end of this
// file; the same JSON as test/fixtures/v2-episodes/). public/lab/v2-stage.html.
//
// What runs is the real code: planSegment (direction/), cuesFromPlan and the
// director's rules (runtime/direction.js), the Stage with its cue clock
// (runtime/stage.js, cueclock.js), CAMERA's framings, SET's studio, the rig and
// the looks. Only the director's timers and the AudioEngine are simulated:
//   - the director: open 4 s, the intro on its plan as LiveDirection.intro plays
//     it (headline frames at each teaser sentence, the greeting's studio shot, the
//     last shot's minLen), one segment after the other with the director's gaps,
//     shot cues at sentence starts (or the char's time inside a sentence) with
//     MIN_SHOT, the end card after the outro;
//   - the voice: audio/visemes.js buildTimeline per sentence (what the engine
//     plays in mute and blips) with the engine's pauses; `voice: 'recorded'`
//     also gives every segment seg.audio.words from the same timeline (lead 0.18 s),
//     so plans are fired by `at` instead of by char.
// render(T) replays the runtime on a 60 fps grid from 5 s before the start of
// T's segment (continuing incrementally when T moves forward in the same
// segment), so a frame depends only on T and the settings.
//
//   window.__lab.set({ programme, voice: 'mute'|'recorded', guides, hud })
//   window.__lab.render(T)          draw instant T (s from the start of the episode)
//   window.__lab.timeline()         { duration, segments: [...], shots: [...] } (capture planning)
//   window.__lab.perf({ frames, runs })   v2 shot ms p50/p95 (min over runs) on this programme
//   window.__lab.baseline({ runs })       ms of a fixed reference workload (same-session ratio)
//   window.__lab.state()            the scene, the plan and the clock stats at the last render
import { Stage, STUDIO_SHOTS } from '../runtime/stage.js';
import { planSegment } from '../direction/index.js';
import { cuesFromPlan } from '../runtime/direction.js';
import { buildTimeline, sampleTimeline, wordAtChar } from '../../../audio/visemes.js';
import { splitSentences } from '../../../audio/sentences.js';
import { drawText } from '../../../font.js';
import { P } from '../../../palette.js';

const FPS = 60;
const OPEN = 4; // s
const GAP_AFTER = 0.3; // s between segments (director)
const MIN_SHOT = 3;
const MONTAGE_FRAME = 2.6;
const BREAKING = 3.4; // stinger + card hold
const ENDCARD = 3.3;
const LEAD = 0.18; // s of silence before the first word in a recorded file

/** The engine's pause after a sentence in mute/blips (audio.js gapAfter). */
function pauseAfter(sentence) {
  const end = /([.!?…:;])["'’”»)\]]*\s*$/.exec(sentence)?.[1] ?? '';
  if (end === '?') return 0.48;
  if (end === '…') return 0.56;
  if (end === '.' || end === '!') return 0.43;
  if (end === ':' || end === ';') return 0.3;
  return 0.16;
}

function sentenceStarts(text, sentences) {
  const out = [];
  let from = 0;
  for (const s of sentences) {
    const at = text.indexOf(s.slice(0, 12), from);
    out.push(at >= 0 ? at : from);
    from = (at >= 0 ? at : from) + s.length;
  }
  return out;
}

const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------------------
// pictures: the offline channel paints its own; the lab paints a quiet one per story

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h;
}

function picture(id, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  const r = hash(id);
  const skies = [[P.navy, P.blue], [P.ink, P.slate], [P.ink, P.steel], [P.ink, P.navy]];
  const [a, b] = skies[r % skies.length];
  const horizon = Math.round(h * (0.52 + ((r >> 4) % 20) / 100));
  for (let y = 0; y < horizon; y++) {
    x.fillStyle = y < horizon * 0.55 ? a : b;
    x.fillRect(0, y, w, 1);
  }
  x.fillStyle = P.black;
  x.fillRect(0, horizon, w, h - horizon);
  // a skyline of blocks, warm windows here and there
  let px = 0;
  let s = r;
  while (px < w) {
    s = Math.imul(s ^ (s >>> 13), 0x5bd1e995) >>> 0;
    const bw = 4 + (s % Math.max(6, Math.round(w / 10)));
    const bh = Math.round(h * 0.08 + ((s >> 8) % Math.round(h * 0.32)));
    x.fillStyle = (s >> 3) % 3 ? P.ink : P.slate;
    x.fillRect(px, horizon - bh, bw, bh);
    if ((s >> 5) % 2) {
      x.fillStyle = P.orange || P.yellow;
      x.fillRect(px + 2, horizon - bh + 3, 1, 1);
    }
    px += bw + 1;
  }
  x.fillStyle = P.steel;
  x.fillRect(0, horizon, w, 1);
  return c;
}

// ---------------------------------------------------------------------------
// the simulated director + voice

function buildShow(epIn, presenters, voice) {
  const ep = clone(epIn);
  const segs = [];
  const shots = [];
  const images = new Map();
  for (const r of ep.rundown || []) {
    if (!r.hasImage) continue;
    const full = picture(r.storyId, 416, 234);
    const card = document.createElement('canvas');
    card.width = 384;
    card.height = 216;
    card.getContext('2d').drawImage(full, -16, -9);
    images.set(r.storyId, { small: picture(r.storyId, 104, 62), full, card });
  }
  let t = 0;
  let lastCut = -Infinity;
  const cut = (at, shot, extra = {}) => {
    shots.push({ t: at, shot, framing: null, focus: 'A', move: null, storyId: null, wall: 'logo', ...extra });
    lastCut = at;
  };
  cut(0, 'open');
  t = OPEN;
  for (let i = 0; i < ep.segments.length; i++) {
    const seg = ep.segments[i];
    const pres = presenters[ep.cast[seg.anchor]] || {};
    const lang = pres.voice?.lang || 'en';
    const rate = pres.voice?.rate || 1;
    const sentences = splitSentences(seg.text);
    const starts = sentenceStarts(seg.text, sentences);
    const tls = sentences.map((s) => buildTimeline(s, { lang, rate }));
    // recorded voices: word times from the same timeline, as the voice worker would send them
    if (voice === 'recorded') {
      const words = [];
      let ft = LEAD;
      tls.forEach((tl, k) => {
        for (const w of tl.words) {
          const char = starts[k] + w.ci;
          if (words.length && words[words.length - 1].char === char) continue;
          words.push({ t: Math.round((ft + w.t0 / 1000) * 1000) / 1000, char });
        }
        ft += tl.total / 1000 + pauseAfter(sentences[k]);
      });
      seg.audio = { url: 'lab', duration: ft, words };
    }
    const story = seg.type === 'story';
    if (story && seg.breaking) {
      cut(t, 'breakingCard', { storyId: seg.storyId });
      t += BREAKING;
    }
    const res = planSegment(ep, i, { presenters, gapAfter: GAP_AFTER });
    const plan = { id: `${ep.id}:${i}`, index: i, ctx: res.ctx, events: res.events, errors: res.errors, voice, speechStart: null, speechEnd: null };
    const segStart = t;
    const speechStart = segStart + (voice === 'recorded' ? 0.12 : 0.05);
    const sentAt = [];
    let st = speechStart;
    tls.forEach((tl, k) => {
      sentAt.push(st);
      st += tl.total / 1000 + (k + 1 < tls.length ? pauseAfter(sentences[k]) : 0);
    });
    const speechEnd = st;
    const hasImg = images.has(seg.storyId);
    const wall = story ? (hasImg ? 'image' : 'source') : 'logo';
    const base = { focus: seg.anchor, storyId: story ? seg.storyId : null, wall };
    const timeOfChar = (c) => {
      let k = 0;
      while (k + 1 < starts.length && starts[k + 1] <= c) k++;
      const tl = tls[k];
      const w = tl ? tl.words[wordAtChar(tl, c - starts[k])] : null;
      return sentAt[k] + (w ? w.t0 / 1000 : 0);
    };
    const studio = (s) => STUDIO_SHOTS.has(s);
    // the v2 intro (LiveDirection.intro): every cue of the plan at its sentence's first word, montage
    // frames on the story each sentence teases, no MIN_SHOT hold (voice-paced), no cut back at the end
    const introCues = seg.type === 'intro' ? cuesFromPlan(plan, { rundown: ep.rundown }) : null;
    if (introCues) {
      let hold = 0;
      for (const c of introCues) {
        const at = c.k === 0 ? segStart : c.mid ? timeOfChar(c.char) : sentAt[c.sentence] ?? segStart;
        if (c.k > 0 && at > speechEnd) continue;
        if (c.shot === 'montage') cut(at, 'montage', { ...base, card: c.card, storyId: null });
        else cut(at, c.shot, { ...base, focus: c.focus, framing: c.framing, move: c.move, cue: c.k });
        hold = Math.min(2, (c.minLen || 0) - (speechEnd - at));
      }
      segs.push({ i, seg, plan, segStart, speechStart, speechEnd, sentAt, tls });
      t = speechEnd + Math.max(0, hold) + GAP_AFTER;
      continue;
    }
    if (seg.type === 'intro' && (ep.rundown || []).length >= 2) {
      const frames = Math.min(3, ep.rundown.length);
      for (let f = 0; f < frames; f++) cut(segStart + f * MONTAGE_FRAME, 'montage', { ...base, card: f });
      const end = Math.max(speechEnd, segStart + frames * MONTAGE_FRAME);
      segs.push({ i, seg, plan, segStart, speechStart, speechEnd, sentAt, tls });
      cut(end, 'wide', { ...base });
      t = end + GAP_AFTER;
      continue;
    }
    const cues = cuesFromPlan(plan, { hasImg });
    if (!cues) cut(segStart, story ? 'close' : 'wide', base);
    else {
      for (const c of cues) {
        if (!story && !studio(c.shot)) continue;
        let at = c.k === 0 ? segStart : c.mid ? timeOfChar(c.char) : sentAt[c.sentence] ?? segStart;
        if (c.k > 0 && at - lastCut < MIN_SHOT) at = lastCut + MIN_SHOT;
        if (c.k > 0 && at > speechEnd) continue;
        if (c.k === 0 && !story && !studio(shots[shots.length - 1]?.shot)) {
          // chats and outros open on the director's studio shot
        }
        cut(at, c.shot, { ...base, focus: c.focus, framing: c.framing, move: c.move, cue: c.k });
      }
    }
    segs.push({ i, seg, plan, segStart, speechStart, speechEnd, sentAt, tls });
    t = speechEnd + GAP_AFTER;
    if (seg.type === 'outro') {
      cut(t, 'endcard');
      t += ENDCARD;
    }
  }
  shots.sort((a, b) => a.t - b.t);
  return { ep, segs, shots, images, duration: t };
}

/** A fake AudioEngine for the Stage: the simulated voice's speechFrame. */
function makeAudio(show) {
  return {
    mode: 'mute',
    speechFrame(ms, slot, out = {}) {
      const t = ms / 1000;
      out.slot = slot;
      out.speaking = false;
      out.level = 0;
      out.viseme = 'rest';
      out.next = 'rest';
      out.mix = 0;
      out.wordIndex = -1;
      out.charIndex = -1;
      out.sentenceIndex = -1;
      out.accent = 0;
      out.pause = false;
      const s = segAt(show, t);
      if (!s || s.seg.anchor !== slot || t < s.speechStart || t > s.speechEnd + 0.15) return out;
      let k = 0;
      while (k + 1 < s.sentAt.length && s.sentAt[k + 1] <= t) k++;
      sampleTimeline(s.tls[k], (t - s.sentAt[k]) * 1000, out);
      out.slot = slot;
      out.sentenceIndex = k;
      return out;
    },
  };
}

function segAt(show, t) {
  let hit = null;
  for (const s of show.segs) if (s.segStart <= t + 1e-9) hit = s;
  return hit;
}

// ---------------------------------------------------------------------------
// non-studio beats: a quiet slate that says what the old renderer would show

function slate(ctx, shot, show, s) {
  ctx.fillStyle = P.black;
  ctx.fillRect(0, 0, 384, 216);
  ctx.fillStyle = P.ink;
  ctx.fillRect(24, 88, 336, 40);
  const seg = s?.seg;
  const what =
    shot.shot === 'map' ? `MAP  ${seg?.location?.place || ''}` :
    shot.shot === 'fact' ? `FACT  ${seg?.numbers?.[0]?.value || seg?.fact || ''}` :
    shot.shot === 'full' ? `PICTURE  ${seg?.kicker || ''}` :
    shot.shot === 'montage' ? `HEADLINE ${shot.card + 1}: ${show.ep.rundown?.[shot.card]?.headline || ''}` :
    shot.shot === 'open' ? `OPEN  ${show.ep.program?.title || ''}` :
    shot.shot.toUpperCase();
  const cut = what.length > 46 ? what.lastIndexOf(' ', 46) : -1;
  drawText(ctx, (cut > 0 ? what.slice(0, cut) : what).slice(0, 46), 192, cut > 0 ? 98 : 104, { color: P.fog, align: 'center' });
  if (cut > 0) drawText(ctx, what.slice(cut + 1, cut + 47), 192, 110, { color: P.fog, align: 'center' });
}

// zoom: { x, y, w, h } of the frame blown up to fill the screen (nearest neighbour), to judge
// eyelines and hands in wide shots at a glance
let ZOOM = null;
function zoomInto(ctx, z) {
  if (typeof document === 'undefined') return;
  ZOOM ||= document.createElement('canvas');
  ZOOM.width = 384;
  ZOOM.height = 216;
  const zc = ZOOM.getContext('2d');
  zc.drawImage(ctx.canvas, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ZOOM, z.x, z.y, z.w, z.h, 0, 0, 384, 216);
}

function guides(ctx) {
  ctx.fillStyle = P.red;
  const box = (x0, y0, x1, y1) => {
    ctx.fillRect(x0, y0, x1 - x0, 1);
    ctx.fillRect(x0, y1 - 1, x1 - x0, 1);
    ctx.fillRect(x0, y0, 1, y1 - y0);
    ctx.fillRect(x1 - 1, y0, 1, y1 - y0);
  };
  box(13, 8, 371, 21); // top row
  box(55, 136, 329, 160); // captions over a strap
  box(19, 166, 365, 194); // strap
  box(0, 202, 384, 216); // ticker
}

// ---------------------------------------------------------------------------

export function createIntegLab(canvas, { episodes = EPISODES, presenters = PRESENTERS } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const opts = { programme: 'world-now', voice: 'mute', guides: false, hud: false, zoom: null };
  let show = null;
  let stage = null;
  let audio = null;
  let simT = -1;
  let simFrom = -1;
  let scene = null;
  let shotIx = -1;

  function rebuild() {
    show = buildShow(episodes[opts.programme] || episodes['world-now'], presenters, opts.voice);
    audio = makeAudio(show);
    resetSim(0);
  }

  function resetSim(from) {
    stage = new Stage({ audio, channel: { presenters }, log: () => {} });
    for (const s of show.segs) {
      s.plan.speechStart = null;
      s.plan.speechEnd = null;
    }
    scene = { episode: show.ep, program: show.ep.program, cast: show.ep.cast, shot: 'open', shotSince: 0, focus: 'A', framing: null, cameraMove: null, storyId: null, wall: { mode: 'logo' }, anchors: {}, images: show.images, segPlan: null, stinger: null };
    shotIx = -1;
    simFrom = from;
    simT = from - 1 / FPS;
  }

  /** Bring the scene to time t (the director's state at t). */
  function direct(t) {
    let k = shotIx;
    while (k + 1 < show.shots.length && show.shots[k + 1].t <= t + 1e-9) k++;
    if (k !== shotIx && k >= 0) {
      const sh = show.shots[k];
      shotIx = k;
      scene.shot = sh.shot;
      scene.shotSince = sh.t;
      scene.focus = sh.focus;
      scene.framing = sh.framing;
      scene.cameraMove = sh.move;
      scene.storyId = sh.storyId;
      scene.wall = sh.wall === 'image' ? { mode: 'image', storyId: sh.storyId } : sh.wall === 'source' ? { mode: 'source', source: '' } : { mode: 'logo' };
    }
    const s = segAt(show, t);
    if (s) {
      scene.segPlan = s.plan;
      if (t >= s.speechStart && s.plan.speechStart == null) s.plan.speechStart = s.speechStart;
      if (t >= s.speechEnd && s.plan.speechEnd == null) s.plan.speechEnd = s.speechEnd;
      const emo = s.seg.emotion || 'neutral';
      for (const slot of Object.keys(show.ep.cast)) {
        scene.anchors[slot] = { emotion: slot === s.seg.anchor ? emo : emo === 'happy' ? 'happy' : emo === 'serious' || emo === 'sad' ? 'serious' : 'neutral' };
      }
    }
  }

  function advance(T) {
    const s = segAt(show, T);
    const from = Math.max(0, Math.round(((s ? s.segStart : 0) - 5) * FPS) / FPS);
    if (T < simT - 1e-9 || from !== simFrom) resetSim(from);
    const n = Math.round((T - simFrom) * FPS);
    let k = Math.round((simT - simFrom) * FPS) + 1;
    for (; k < n; k++) {
      const t = simFrom + k / FPS;
      direct(t);
      stage.frame(null, t, scene, false);
    }
    simT = simFrom + (n - 1) / FPS;
  }

  /** Draw instant T (snapped to the 60 fps grid). Returns what was on air. */
  function render(T = 0) {
    if (!show) rebuild();
    T = Math.max(0, Math.round(T * FPS) / FPS);
    advance(T);
    direct(T);
    const studio = STUDIO_SHOTS.has(scene.shot);
    const ok = stage.frame(ctx, T, scene, studio);
    simT = T;
    if (!studio || !ok) slate(ctx, show.shots[shotIx] || { shot: scene.shot }, show, segAt(show, T));
    if (opts.zoom) zoomInto(ctx, opts.zoom);
    if (opts.guides) guides(ctx);
    if (opts.hud) {
      const p = scene.segPlan;
      const line = `${T.toFixed(2)} ${scene.shot}${scene.framing ? `/${scene.framing}` : ''} ${scene.focus} seg ${p?.index ?? '-'} fired ${stage.clock.stats.fired}`;
      drawText(ctx, line, 4, 4, { color: P.yellow, font: 'micro' });
    }
    return { shot: scene.shot, framing: scene.framing, focus: scene.focus, seg: scene.segPlan?.index ?? null };
  }

  return {
    render,
    set(o = {}) {
      const before = `${opts.programme}|${opts.voice}`;
      Object.assign(opts, o);
      if (`${opts.programme}|${opts.voice}` !== before || !show) rebuild();
      return { ...opts };
    },
    timeline() {
      if (!show) rebuild();
      return {
        programme: opts.programme,
        duration: show.duration,
        segments: show.segs.map((s) => ({ i: s.i, type: s.seg.type, anchor: s.seg.anchor, t0: s.segStart, speechStart: s.speechStart, speechEnd: s.speechEnd, events: s.plan.events.map((e) => `${e.kind}:${e.slot || ''}:${e.name || e.shot || e.target}@${e.at.toFixed(2)}`) })),
        shots: show.shots.map((s) => ({ t: +s.t.toFixed(3), shot: s.shot, framing: s.framing, focus: s.focus })),
      };
    },
    /** ms per v2 studio frame on this programme: p50 / p95 per run, and the minimum over runs. */
    perf({ frames = 600, runs = 5, from = null, draw = true } = {}) {
      if (!show) rebuild();
      const studioShots = show.shots.filter((s) => STUDIO_SHOTS.has(s.shot));
      const t0 = from ?? (studioShots[1] || studioShots[0]).t;
      const out = [];
      const prof = { bg: 0, desk: 0, actors: 0, present: 0, n: 0 };
      let total = 0, count = 0;
      for (let r = 0; r < runs; r++) {
        resetSim(Math.max(0, t0 - 2));
        stage.prof = prof;
        const ms = [];
        let t = simFrom;
        for (let k = 0; ms.length < frames && k < frames * 8; k++) {
          t = simFrom + k / FPS;
          direct(t);
          const studio = STUDIO_SHOTS.has(scene.shot);
          // draw: the v2 shot as the channel draws it; draw false: the runtime's bookkeeping alone
          // (speech sampling, cue clock, cuts, emotions) on every frame
          const a = performance.now();
          stage.frame(ctx, t, scene, draw && studio);
          const d = performance.now() - a;
          if ((studio || !draw) && t >= t0) {
            ms.push(d);
            total += d;
            count++;
          }
        }
        ms.sort((x, y) => x - y);
        out.push({ p50: ms[Math.floor(ms.length * 0.5)], p95: ms[Math.floor(ms.length * 0.95)], n: ms.length });
      }
      simT = Infinity; // force a fresh replay on the next render
      const k = 1 / Math.max(1, prof.n);
      return {
        runs: out,
        p50: Math.min(...out.map((o) => o.p50)),
        p95: Math.min(...out.map((o) => o.p95)),
        mean: total / Math.max(1, count),
        sections: { bg: prof.bg * k, desk: prof.desk * k, actors: prof.actors * k, present: prof.present * k },
      };
    },
    /**
     * A fixed reference workload (a 384x216 raster pass with a per-pixel branch, 8 times): its ms,
     * minimum over runs, so perf numbers can be reported as a ratio to the machine's speed in the
     * same session (the shared machine's load swings ±50 %).
     */
    baseline({ runs = 5 } = {}) {
      const px = new Uint32Array(384 * 216);
      let best = Infinity;
      for (let r = 0; r < runs; r++) {
        const a = performance.now();
        for (let k = 0; k < 8; k++) {
          for (let y = 0, i = 0; y < 216; y++) {
            for (let x = 0; x < 384; x++, i++) px[i] = ((x ^ y) + k) & 4 ? 0xff203040 + y : px[i] ^ (x << 8);
          }
        }
        best = Math.min(best, performance.now() - a);
      }
      return { ms: best, check: px[1234] };
    },
    state() {
      return { scene: { shot: scene?.shot, framing: scene?.framing, focus: scene?.focus, seg: scene?.segPlan?.index }, clock: stage?.clock.stats, perf: stage?.actors.map((a) => ({ slot: a.slot, gestures: a.perf.gestures.map((g) => g.name), looks: a.perf.look.length, emotions: a.perf.emotions.map((e) => e.name) })) };
    },
    get opts() {
      return { ...opts };
    },
  };
}

// voices of the eight presenters (config/channel.json), for the text model's rate
const PRESENTERS = {
  paco: { name: 'Paco Pixel', voice: { gender: 'male', lang: 'en-GB', rate: 1.0 } },
  lola: { name: 'Lola Byte', voice: { gender: 'female', lang: 'en-US', rate: 1.06 } },
  max: { name: 'Max Circuit', voice: { gender: 'male', lang: 'en-US', rate: 1.1 } },
  ada: { name: 'Ada Volt', voice: { gender: 'female', lang: 'en-GB', rate: 1.04 } },
  nova: { name: 'Dr Nova Reyes', voice: { gender: 'female', lang: 'en-US', rate: 1.0 } },
  unit8: { name: 'UNIT-8', voice: { gender: 'robot', lang: 'en-US', rate: 1.05 } },
  penny: { name: 'Penny Sterling', voice: { gender: 'female', lang: 'en-GB', rate: 1.05 } },
  sam: { name: 'Sam Night', voice: { gender: 'male', lang: 'en-US', rate: 1.08 } },
};

// EPISODES: one per programme, saved from the offline channel's /api/queue
// (same files as test/fixtures/v2-episodes/*.json).
const EPISODES = {"world-now":{"kind":"episode","id":"emur828xi0","createdAt":"2026-10-02T17:13:28.758Z","program":{"id":"world-now","title":"WORLD NOW","tagline":"THE STORIES SHAPING OUR WORLD","theme":"world"},"cast":{"A":"paco","B":"lola"},"provider":"mock","title":"WORLD NOW (demo)","segments":[{"type":"intro","anchor":"A","emotion":"neutral","text":"Panama Canal reopens after a day-long closure. North Sea wind farm starts supplying power to 1.2 million homes. Lisbon opens a new riverside tram line. Good evening, and welcome to WORLD NOW. I'm Paco Pixel, with Lola Byte.","cues":[{"char":191,"slot":null,"action":"nod"},{"char":223,"slot":"B","action":"nod"}],"teases":["s73bb228b7b","sadae5c525f","sf2538c295c"]},{"type":"story","anchor":"A","emotion":"neutral","text":"Breaking news. Ledger Line reports that the Panama Canal has reopened to ships after fog closed it for a day. The canal authority says about 30 ships are waiting to cross.","cues":[{"char":171,"slot":"B","action":"look_partner"}],"storyId":"s73bb228b7b","headline":"Panama Canal reopens after a day-long closure","shot":"map","breaking":true,"location":{"place":"PANAMA","lat":8.5,"lon":-80.8},"fact":"ABOUT 30 SHIPS","source":"Ledger Line","category":"business","hasImage":false,"kicker":"TRADE","numbers":[{"value":"30","label":"SHIPS","qualifier":"ABOUT"}]},{"type":"story","anchor":"B","emotion":"neutral","text":"Thanks, Paco. From Ledger Line: An offshore wind farm in the North Sea has started supplying electricity. The developer says its 140 turbines can power about 1.2 million homes.","cues":[{"char":13,"slot":null,"action":"point_screen"},{"char":176,"slot":"A","action":"nod"}],"storyId":"sadae5c525f","headline":"North Sea wind farm starts supplying power to 1.2 million homes","shot":"full","breaking":false,"location":null,"fact":"ABOUT 1.2 MILLION HOMES","source":"Ledger Line","category":"business","hasImage":true,"kicker":"ENERGY","numbers":[{"value":"1.2 MILLION","label":"HOMES","qualifier":"ABOUT"},{"value":"140","label":"TURBINES"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"Our number of the day: 40,000. Lisbon has opened a new tram line along the Tagus river, Pixelburg Post reports. The city says the 9 kilometre route will carry 40,000 passengers a day and cut car traffic in the old town. As the mayor put it: “This line will change how people move around the old town.”","cues":[{"char":0,"slot":null,"action":"steeple"},{"char":219,"slot":"B","action":"nod"}],"storyId":"sf2538c295c","headline":"Lisbon opens a new riverside tram line","shot":"map","breaking":false,"location":{"place":"LISBON, PORTUGAL","lat":38.72,"lon":-9.14},"fact":"40,000 PASSENGERS A DAY","source":"Pixelburg Post","category":"world","hasImage":true,"kicker":"NUMBER OF THE DAY","numbers":[{"value":"40,000","label":"PASSENGERS A DAY"}],"quote":{"text":"This line will change how people move around the old town","by":"the mayor"},"feature":"number"},{"type":"story","anchor":"B","emotion":"serious","text":"Now, around the world in 30 seconds. Heavy monsoon rain has flooded streets in several coastal towns in Kerala, India, Pixelburg Post reports.","cues":[],"storyId":"sfa4f308e5c","headline":"Heavy rain floods streets in coastal towns of Kerala","shot":"map","breaking":false,"location":{"place":"KERALA, INDIA","lat":10.5,"lon":76.3},"fact":null,"source":"Pixelburg Post","category":"world","hasImage":false,"kicker":"AROUND THE WORLD","feature":"roundup","roundup":{"index":0,"count":4}},{"type":"story","anchor":"B","emotion":"neutral","text":"A fissure eruption has started again on the Reykjanes peninsula in Iceland.","cues":[],"storyId":"s5fb454f418","headline":"Iceland volcano erupts again on the Reykjanes peninsula","shot":"map","breaking":false,"location":{"place":"REYKJANES PENINSULA, ICELAND","lat":63.9,"lon":-22.3},"fact":null,"source":"Pixelburg Post","category":"world","hasImage":true,"kicker":"AROUND THE WORLD","feature":"roundup","roundup":{"index":1,"count":4}},{"type":"story","anchor":"B","emotion":"neutral","text":"Venice has raised its sea barriers for a test ahead of the autumn high tides, Bitport Herald reports.","cues":[],"storyId":"s701ea0e9b9","headline":"Venice raises its sea barriers in a test before the autumn tides","shot":"map","breaking":false,"location":{"place":"VENICE, ITALY","lat":45.44,"lon":12.32},"fact":null,"source":"Bitport Herald","category":"world","hasImage":false,"kicker":"AROUND THE WORLD","feature":"roundup","roundup":{"index":2,"count":4}},{"type":"story","anchor":"B","emotion":"neutral","text":"A large solar plant on the edge of the Sahara in Morocco is now running at full power, Bitport Herald reports.","cues":[],"storyId":"s6e5fa12524","headline":"Morocco desert solar plant reaches full power","shot":"map","breaking":false,"location":{"place":"MOROCCO","lat":31.8,"lon":-7.1},"fact":null,"source":"Bitport Herald","category":"world","hasImage":false,"kicker":"AROUND THE WORLD","feature":"roundup","roundup":{"index":3,"count":4}},{"type":"story","anchor":"B","emotion":"happy","text":"And finally: Scientists say coral cover has grown on parts of the Great Barrier Reef for a second year. “The reef is showing it can bounce back when it gets a break,” a lead researcher said.","cues":[{"char":190,"slot":"A","action":"nod"}],"storyId":"s9efe8cbd21","headline":"Coral recovers on parts of the Great Barrier Reef","shot":"map","breaking":false,"location":{"place":"GREAT BARRIER REEF, AUSTRALIA","lat":-18.3,"lon":147.7},"fact":null,"source":"Bitport Herald","category":"world","hasImage":false,"kicker":"AND FINALLY","quote":{"text":"The reef is showing it can bounce back when it gets a break","by":"a lead researcher"},"feature":"lighter"},{"type":"chat","anchor":"A","emotion":"happy","text":"A good note to end on.","cues":[{"char":0,"slot":null,"action":"nod"}]},{"type":"chat","anchor":"B","emotion":"happy","text":"Rare enough that we should enjoy it.","cues":[]},{"type":"outro","anchor":"A","emotion":"neutral","text":"That's WORLD NOW. From Lola Byte and from me, thank you for watching. Stay with us on GLOBIT 24.","cues":[{"char":17,"slot":null,"action":"nod"}]}],"rundown":[{"storyId":"s73bb228b7b","headline":"Panama Canal reopens after a day-long closure","source":"Ledger Line","category":"business","hasImage":false,"kicker":"TRADE"},{"storyId":"sadae5c525f","headline":"North Sea wind farm starts supplying power to 1.2 million homes","source":"Ledger Line","category":"business","hasImage":true,"kicker":"ENERGY"},{"storyId":"sf2538c295c","headline":"Lisbon opens a new riverside tram line","source":"Pixelburg Post","category":"world","hasImage":true,"kicker":"NUMBER OF THE DAY"},{"storyId":"sfa4f308e5c","headline":"Heavy rain floods streets in coastal towns of Kerala","source":"Pixelburg Post","category":"world","hasImage":false,"kicker":"AROUND THE WORLD"},{"storyId":"s5fb454f418","headline":"Iceland volcano erupts again on the Reykjanes peninsula","source":"Pixelburg Post","category":"world","hasImage":true,"kicker":"AROUND THE WORLD"},{"storyId":"s701ea0e9b9","headline":"Venice raises its sea barriers in a test before the autumn tides","source":"Bitport Herald","category":"world","hasImage":false,"kicker":"AROUND THE WORLD"},{"storyId":"s6e5fa12524","headline":"Morocco desert solar plant reaches full power","source":"Bitport Herald","category":"world","hasImage":false,"kicker":"AROUND THE WORLD"},{"storyId":"s9efe8cbd21","headline":"Coral recovers on parts of the Great Barrier Reef","source":"Bitport Herald","category":"world","hasImage":false,"kicker":"AND FINALLY"}],"storyIds":["s73bb228b7b","sadae5c525f","sf2538c295c","sfa4f308e5c","s5fb454f418","s701ea0e9b9","s6e5fa12524","s9efe8cbd21"]},"tech-bytes":{"kind":"episode","id":"emur828y11","createdAt":"2026-10-02T17:13:28.777Z","program":{"id":"tech-bytes","title":"TECH BYTES","tagline":"THE FUTURE, ONE BYTE AT A TIME","theme":"tech"},"cast":{"A":"max","B":"ada"},"provider":"mock","title":"TECH BYTES (demo)","segments":[{"type":"intro","anchor":"A","emotion":"neutral","text":"Chipmaker unveils a laptop processor with all-day battery life. Also coming up: Startup launches satellite internet service for farms. And later, our number of the day. This is TECH BYTES. I'm Max Circuit, with Ada Volt.","cues":[{"char":63,"slot":null,"action":"nod"},{"char":188,"slot":null,"action":"nod"},{"char":220,"slot":"B","action":"nod"}],"teases":["s6b65619146","s9c777c85c9","s73f99cbdf2"]},{"type":"story","anchor":"A","emotion":"neutral","text":"From Circuit Weekly: A chipmaker has unveiled a new laptop processor it says can run for 20 hours on a single charge.","cues":[{"char":0,"slot":null,"action":"point_screen"},{"char":117,"slot":"B","action":"nod"}],"storyId":"s6b65619146","headline":"Chipmaker unveils laptop processor with all-day battery life","shot":"close","breaking":false,"location":null,"fact":"20 HOURS","source":"Circuit Weekly","category":"tech","hasImage":true,"kicker":"CHIPS","numbers":[{"value":"20","label":"HOURS"}]},{"type":"chat","anchor":"B","emotion":"neutral","text":"And when does it reach actual people?","cues":[{"char":0,"slot":null,"action":"chin"}]},{"type":"chat","anchor":"A","emotion":"neutral","text":"The first laptops using it will go on sale in the spring.","cues":[{"char":0,"slot":null,"action":"lean_in"}]},{"type":"story","anchor":"B","emotion":"neutral","text":"Circuit Weekly reports that a startup has launched a satellite internet service designed for farms in remote areas. It says the service reaches speeds of 100 megabits per second.","cues":[{"char":178,"slot":"A","action":"look_partner"}],"storyId":"s9c777c85c9","headline":"Startup launches satellite internet service for farms","shot":"wide","breaking":false,"location":null,"fact":"100 MEGABITS PER SECOND","source":"Circuit Weekly","category":"tech","hasImage":false,"kicker":"CONNECTIVITY","numbers":[{"value":"100","label":"MEGABITS PER SECOND"}]},{"type":"story","anchor":"A","emotion":"happy","text":"Our number of the day: about 1,500 dollars. From Circuit Weekly: A home robotics company has shown a robot vacuum that can climb stairs using two small legs. It will cost about 1,500 dollars when it launches next year.","cues":[{"char":0,"slot":null,"action":"count"},{"char":218,"slot":"B","action":"nod"}],"storyId":"s73f99cbdf2","headline":"Robot vacuum learns to climb stairs","shot":"wide","breaking":false,"location":null,"fact":"ABOUT 1,500 DOLLARS","source":"Circuit Weekly","category":"tech","hasImage":false,"kicker":"NUMBER OF THE DAY","numbers":[{"value":"1,500","label":"DOLLARS","qualifier":"ABOUT"}],"feature":"number"},{"type":"story","anchor":"B","emotion":"happy","text":"And finally: Astronomers using a telescope in Chile have detected water vapour in the atmosphere of a planet 120 light years away, Starfield Journal reports. The planet is about twice the size of Earth.","cues":[{"char":202,"slot":"A","action":"nod"}],"storyId":"s1c5a3cb80a","headline":"Telescope in Chile spots water vapour on a distant planet","shot":"map","breaking":false,"location":{"place":"CHILE","lat":-35.7,"lon":-71.5},"fact":"120 LIGHT YEARS AWAY","source":"Starfield Journal","category":"science","hasImage":true,"kicker":"AND FINALLY","numbers":[{"value":"120","label":"LIGHT YEARS AWAY"}],"feature":"lighter"},{"type":"chat","anchor":"A","emotion":"happy","text":"Somewhere, a researcher is very pleased with themselves. Rightly.","cues":[{"char":0,"slot":null,"action":"look_partner"}]},{"type":"outro","anchor":"A","emotion":"neutral","text":"That's TECH BYTES. From Ada Volt and from me, thanks for watching. More news around the clock on GLOBIT 24.","cues":[{"char":18,"slot":null,"action":"nod"}]}],"rundown":[{"storyId":"s6b65619146","headline":"Chipmaker unveils laptop processor with all-day battery life","source":"Circuit Weekly","category":"tech","hasImage":true,"kicker":"CHIPS"},{"storyId":"s9c777c85c9","headline":"Startup launches satellite internet service for farms","source":"Circuit Weekly","category":"tech","hasImage":false,"kicker":"CONNECTIVITY"},{"storyId":"s73f99cbdf2","headline":"Robot vacuum learns to climb stairs","source":"Circuit Weekly","category":"tech","hasImage":false,"kicker":"NUMBER OF THE DAY"},{"storyId":"s1c5a3cb80a","headline":"Telescope in Chile spots water vapour on a distant planet","source":"Starfield Journal","category":"science","hasImage":true,"kicker":"AND FINALLY"}],"storyIds":["s6b65619146","s9c777c85c9","s73f99cbdf2","s1c5a3cb80a"]},"news-60":{"kind":"episode","id":"emur8291q2","createdAt":"2026-10-02T17:13:28.910Z","program":{"id":"news-60","title":"NEWS IN 60","tagline":"THE HEADLINES IN A MINUTE","theme":"flash"},"cast":{"A":"sam"},"provider":"mock","title":"NEWS IN 60 (demo)","segments":[{"type":"intro","anchor":"A","emotion":"neutral","text":"This is NEWS IN 60. I'm Sam Night.","cues":[{"char":0,"slot":null,"action":"nod"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"From Pixelburg Post: A solar farm north of Nairobi has started supplying power to the national grid. Officials say it can light around 300,000 homes and is the biggest in East Africa so far.","cues":[{"char":0,"slot":null,"action":"nod"}],"storyId":"sfe6d14dab8","headline":"Kenya switches on its largest solar farm near Nairobi","shot":"map","breaking":false,"location":{"place":"NAIROBI, KENYA","lat":-1.29,"lon":36.82},"fact":"ABOUT 300,000 HOMES","source":"Pixelburg Post","category":"world","hasImage":true,"kicker":"ENERGY","numbers":[{"value":"300,000","label":"HOMES","qualifier":"ABOUT"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"Norway has opened a 27 kilometre road tunnel under a fjord on its west coast, Bitport Herald reports. The government says it cuts the journey between two cities by 40 minutes.","cues":[],"storyId":"sbecc7e92fa","headline":"Norway opens 27 kilometre road tunnel under a fjord","shot":"map","breaking":false,"location":{"place":"NORWAY","lat":61,"lon":8.5},"fact":"27 KILOMETRE ROAD TUNNEL","source":"Bitport Herald","category":"world","hasImage":false,"kicker":"TRANSPORT","numbers":[{"value":"27","label":"KILOMETRE ROAD TUNNEL"},{"value":"40","label":"MINUTES"}]},{"type":"story","anchor":"A","emotion":"neutral","text":"Around the world. Japan's bullet trains mark a record year for punctuality, Pixelburg Post reports.","cues":[],"storyId":"s945f1dfc87","headline":"Japan's bullet trains mark record year for punctuality","shot":"map","breaking":false,"location":{"place":"JAPAN","lat":36.2,"lon":138.3},"fact":null,"source":"Pixelburg Post","category":"world","hasImage":true,"kicker":"AROUND THE WORLD","feature":"roundup","roundup":{"index":0,"count":3}},{"type":"story","anchor":"A","emotion":"neutral","text":"Paris unveils plans to plant 170,000 trees by 2030.","cues":[],"storyId":"s7cf5417e48","headline":"Paris unveils plans to plant 170,000 trees by 2030","shot":"map","breaking":false,"location":{"place":"PARIS, FRANCE","lat":48.86,"lon":2.35},"fact":null,"source":"Pixelburg Post","category":"world","hasImage":true,"kicker":"AROUND THE WORLD","feature":"roundup","roundup":{"index":1,"count":3}},{"type":"story","anchor":"A","emotion":"neutral","text":"Mexico City closes its historic centre to cars on Sundays, Bitport Herald reports.","cues":[],"storyId":"se3b2083eb0","headline":"Mexico City closes its historic centre to cars on Sundays","shot":"map","breaking":false,"location":{"place":"MEXICO CITY, MEXICO","lat":19.43,"lon":-99.13},"fact":null,"source":"Bitport Herald","category":"world","hasImage":false,"kicker":"AROUND THE WORLD","feature":"roundup","roundup":{"index":2,"count":3}},{"type":"story","anchor":"A","emotion":"happy","text":"Volunteers in Ghana have planted one million mangrove seedlings along the coast near Accra. The project aims to protect fishing villages from coastal erosion.","cues":[],"storyId":"sc2b2054024","headline":"Ghana volunteers plant one million mangrove trees","shot":"map","breaking":false,"location":{"place":"ACCRA, GHANA","lat":5.6,"lon":-0.19},"fact":null,"source":"Bitport Herald","category":"world","hasImage":false,"kicker":"WILDLIFE"},{"type":"outro","anchor":"A","emotion":"neutral","text":"That's the minute. Stay with us on GLOBIT 24.","cues":[]}],"rundown":[{"storyId":"sfe6d14dab8","headline":"Kenya switches on its largest solar farm near Nairobi","source":"Pixelburg Post","category":"world","hasImage":true,"kicker":"ENERGY"},{"storyId":"sbecc7e92fa","headline":"Norway opens 27 kilometre road tunnel under a fjord","source":"Bitport Herald","category":"world","hasImage":false,"kicker":"TRANSPORT"},{"storyId":"s945f1dfc87","headline":"Japan's bullet trains mark record year for punctuality","source":"Pixelburg Post","category":"world","hasImage":true,"kicker":"AROUND THE WORLD"},{"storyId":"s7cf5417e48","headline":"Paris unveils plans to plant 170,000 trees by 2030","source":"Pixelburg Post","category":"world","hasImage":true,"kicker":"AROUND THE WORLD"},{"storyId":"se3b2083eb0","headline":"Mexico City closes its historic centre to cars on Sundays","source":"Bitport Herald","category":"world","hasImage":false,"kicker":"AROUND THE WORLD"},{"storyId":"sc2b2054024","headline":"Ghana volunteers plant one million mangrove trees","source":"Bitport Herald","category":"world","hasImage":false,"kicker":"WILDLIFE"}],"storyIds":["sfe6d14dab8","sbecc7e92fa","s945f1dfc87","s7cf5417e48","se3b2083eb0","sc2b2054024"]},"cosmos":{"kind":"episode","id":"emur8293p3","createdAt":"2026-10-02T17:13:28.981Z","program":{"id":"cosmos","title":"COSMOS DESK","tagline":"SCIENCE, SPACE & OUR PLANET","theme":"space"},"cast":{"A":"nova","B":"unit8"},"provider":"mock","title":"COSMOS DESK (demo)","segments":[{"type":"intro","anchor":"A","emotion":"neutral","text":"Rover finds layered rocks in an ancient lake bed on Mars. Also coming up: our number of the day. And later: Astronauts grow tomatoes on the space station. This is COSMOS DESK. I'm Dr Nova Reyes, with UNIT-8.","cues":[{"char":175,"slot":null,"action":"nod"},{"char":207,"slot":"B","action":"nod"}],"teases":["s6c9709e0d6","s29418f9aa5","s10c25a368f"]},{"type":"story","anchor":"A","emotion":"neutral","text":"According to Starfield Journal, a Mars rover has photographed layered rocks in what scientists believe was an ancient lake bed. The layers could hold clues about past water on the planet.","cues":[{"char":187,"slot":"B","action":"look_partner"}],"storyId":"s6c9709e0d6","headline":"Rover finds layered rocks in an ancient lake bed on Mars","shot":"wide","breaking":false,"location":null,"fact":null,"source":"Starfield Journal","category":"science","hasImage":false,"kicker":"SPACE"},{"type":"chat","anchor":"B","emotion":"neutral","text":"Logged, Dr Reyes.","cues":[{"char":0,"slot":null,"action":"nod"}]},{"type":"chat","anchor":"A","emotion":"neutral","text":"Thank you, UNIT-8. Our number of the day is yours.","cues":[{"char":0,"slot":null,"action":"look_partner"}]},{"type":"story","anchor":"B","emotion":"neutral","text":"Our number of the day: 2 million. From Circuit Weekly: A new handheld games console sold 2 million units in its first week, its maker says. Shops in Tokyo reported long queues on launch day.","cues":[{"char":0,"slot":null,"action":"count"},{"char":190,"slot":"A","action":"nod"}],"storyId":"s29418f9aa5","headline":"Handheld games console sells 2 million units in its first week","shot":"map","breaking":false,"location":{"place":"TOKYO, JAPAN","lat":35.68,"lon":139.69},"fact":"2 MILLION UNITS","source":"Circuit Weekly","category":"tech","hasImage":false,"kicker":"NUMBER OF THE DAY","numbers":[{"value":"2 MILLION","label":"UNITS"}],"feature":"number"},{"type":"story","anchor":"A","emotion":"happy","text":"And finally: Astronauts on the International Space Station have harvested tomatoes grown in a small greenhouse, Starfield Journal reports. Scientists want to learn how to feed crews on long missions.","cues":[{"char":199,"slot":"B","action":"look_partner"}],"storyId":"s10c25a368f","headline":"Astronauts grow tomatoes on the space station","shot":"wide","breaking":false,"location":null,"fact":null,"source":"Starfield Journal","category":"science","hasImage":false,"kicker":"AND FINALLY","feature":"lighter"},{"type":"chat","anchor":"B","emotion":"neutral","text":"I will keep one sensor pointed upwards, Dr Reyes. For the record.","cues":[]},{"type":"outro","anchor":"A","emotion":"neutral","text":"That's COSMOS DESK. From UNIT-8 and from me, thank you for watching. Stay with us on GLOBIT 24.","cues":[{"char":19,"slot":null,"action":"nod"}]}],"rundown":[{"storyId":"s6c9709e0d6","headline":"Rover finds layered rocks in an ancient lake bed on Mars","source":"Starfield Journal","category":"science","hasImage":false,"kicker":"SPACE"},{"storyId":"s29418f9aa5","headline":"Handheld games console sells 2 million units in its first week","source":"Circuit Weekly","category":"tech","hasImage":false,"kicker":"NUMBER OF THE DAY"},{"storyId":"s10c25a368f","headline":"Astronauts grow tomatoes on the space station","source":"Starfield Journal","category":"science","hasImage":false,"kicker":"AND FINALLY"}],"storyIds":["s6c9709e0d6","s29418f9aa5","s10c25a368f"]},"money-minute":{"kind":"episode","id":"emur8298l5","createdAt":"2026-10-02T17:13:29.157Z","program":{"id":"money-minute","title":"MONEY MINUTE","tagline":"MARKETS & YOUR MONEY","theme":"money"},"cast":{"A":"penny"},"provider":"mock","title":"MONEY MINUTE (demo)","segments":[{"type":"intro","anchor":"A","emotion":"neutral","text":"Chocolate makers warn of higher prices as cocoa stays expensive. Also coming up: Rice prices ease in Asia after strong harvests. And later, our number of the day. This is MONEY MINUTE. I'm Penny Sterling.","cues":[{"char":64,"slot":null,"action":"nod"},{"char":184,"slot":null,"action":"nod"}],"teases":["s13ed823f35","s5db1cb2e8a","s62cbd69778"]},{"type":"story","anchor":"A","emotion":"neutral","text":"From Ledger Line: Several chocolate makers say they will raise prices again because cocoa remains near record levels. Cocoa has more than doubled in price in two years.","cues":[{"char":0,"slot":null,"action":"lean_in"}],"storyId":"s13ed823f35","headline":"Chocolate makers warn of higher prices","shot":"close","breaking":false,"location":null,"fact":null,"source":"Ledger Line","category":"business","hasImage":false,"kicker":"ECONOMY"},{"type":"story","anchor":"A","emotion":"neutral","text":"Ledger Line reports that rice prices in Asia have fallen 8 percent since July after strong harvests in Thailand and Vietnam. Traders say supplies look healthy for the rest of the year.","cues":[],"storyId":"s5db1cb2e8a","headline":"Rice prices ease in Asia","shot":"close","breaking":false,"location":null,"fact":"RICE PRICES DOWN 8%","source":"Ledger Line","category":"business","hasImage":false,"kicker":"ECONOMY","map":[{"place":"THAILAND","lat":15.9,"lon":100.9},{"place":"VIETNAM","lat":14.1,"lon":108.3}]},{"type":"story","anchor":"A","emotion":"neutral","text":"Our number of the day: 62 percent. Thousands of small shops in Lagos have switched to solar panels to cut fuel costs. A survey found 62 percent of traders now use solar for some of their power.","cues":[{"char":0,"slot":null,"action":"steeple"}],"storyId":"s62cbd69778","headline":"Lagos shops switch to solar power to cut fuel costs","shot":"map","breaking":false,"location":{"place":"LAGOS, NIGERIA","lat":6.52,"lon":3.38},"fact":"62% OF TRADERS","source":"Ledger Line","category":"business","hasImage":false,"kicker":"NUMBER OF THE DAY","numbers":[{"value":"62%","label":"OF TRADERS"}],"feature":"number"},{"type":"outro","anchor":"A","emotion":"neutral","text":"That's your MONEY MINUTE. I'm Penny Sterling. Stay with us on GLOBIT 24.","cues":[{"char":72,"slot":null,"action":"papers"}]}],"rundown":[{"storyId":"s13ed823f35","headline":"Chocolate makers warn of higher prices","source":"Ledger Line","category":"business","hasImage":false,"kicker":"ECONOMY"},{"storyId":"s5db1cb2e8a","headline":"Rice prices ease in Asia","source":"Ledger Line","category":"business","hasImage":false,"kicker":"ECONOMY"},{"storyId":"s62cbd69778","headline":"Lagos shops switch to solar power to cut fuel costs","source":"Ledger Line","category":"business","hasImage":false,"kicker":"NUMBER OF THE DAY"}],"storyIds":["s13ed823f35","s5db1cb2e8a","s62cbd69778"]}};
