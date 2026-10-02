// Live direction for the v2 path (owner: INTEGRATION stream): the director's
// side of wave 2. director.js loads it only when v2 is on and calls it from a
// few surgical hooks; it plans every segment of a live episode (the server
// produced it a few minutes ago, nothing is pre-planned) and drives the v2
// shot cues with the director's own rules.
//
//   setCast(episode)         → episode(ep): scene.episode; every segment is planned
//                              in idle time (the first planSegment of a session costs
//                              ~100-200 ms cold, later ones a few ms), never on the
//                              frame path; segment i+1 is ready while i plays
//   playStory(seg)           → shots(seg, hasImg, handler): the plan's shot cues, or
//                              null (the old storyBeats then); the opening cue is the
//                              caller's, later cues come back through `handler`
//   playIntro(seg)           → intro(seg): the intro follows its plan: headline frames
//                              cut on the spoken teaser (each at its sentence's first
//                              word, showing the story that sentence teases, held to the
//                              next), the greeting on its planned studio shot; no cut back
//                              to the studio at the end (the next segment cuts, or a
//                              breaking story's stinger covers the montage)
//   say(seg)                 → begin(seg): scene.segPlan = { id, ctx, events, voice,
//                              speechStart, speechEnd }; the handle gives speak()
//                              marks for cuts inside a sentence, sentence(i) at each
//                              onSentence (speechStart at 0, sentence-start cuts) and
//                              end() when speak() resolves (speechEnd)
// Chats, outros and an intro without a montage use the default handler: studio
// cuts only (never away from a montage or a card), MIN_SHOT holds. Every cut
// waits for a stinger on screen to finish. scene.shot keeps the legacy names
// (wide/close/full/map/fact) the graphics, music hooks and old renderer know;
// the framing travels in scene.framing (CONTRACTS "framings never reach graphics").
import { planSegment } from '../direction/index.js';
// the Stage's module graph loads with this one: once the director's v2 side is ready, so is the
// Renderer's (studio.js imports host.js itself; this only removes the start-up race)
import './host.js';

const now = () => performance.now() / 1000;
const MIN_SHOT = 3; // s, as the director's own rule
const STINGER = 0.8; // s (cards.js STINGER_DURATION)
const GAP_AFTER = 0.3; // s the director waits after a segment
export const LEGACY_SHOTS = new Set(['wide', 'close', 'full', 'map', 'fact', 'montage']);
const STUDIO = new Set(['wide', 'close']);
const WIDE_FRAMINGS = new Set(['wide', 'two', 'solo-wide']);

/** The legacy shot name for a planned shot (framing names never reach graphics). */
export function legacyShot(shot, framing) {
  if (LEGACY_SHOTS.has(shot)) return shot;
  return WIDE_FRAMINGS.has(framing || shot) ? 'wide' : 'close';
}

/**
 * Shot cues of a plan, in order: [{ k, char, at, sentence, mid, shot, framing, focus, move, card }].
 * k 0 is the opening shot; `mid` cues fall inside a sentence (fired by speech marks).
 * Beats the story cannot show (no picture / location / figure), non-studio beats
 * outside stories (montage frames only in an intro) and repeats of the shot on air
 * are dropped. A montage cue's `card` is the rundown index of the story its sentence
 * teases (seg.teases, editorial), else the planner's card index. Null when nothing is left.
 */
export function cuesFromPlan(plan, { hasImg = true, rundown = null } = {}) {
  const ctx = plan?.ctx;
  if (!ctx || !Array.isArray(plan.events)) return null;
  const seg = ctx.seg || {};
  const story = seg.type === 'story';
  const intro = seg.type === 'intro';
  const out = [];
  for (const e of plan.events) {
    if (e.kind !== 'shot') continue;
    const shot = legacyShot(e.shot, e.framing);
    if (shot === 'montage' ? !intro : !story && !STUDIO.has(shot)) continue;
    if (shot === 'full' && !hasImg) continue;
    if (shot === 'map' && !(seg.location && Number.isFinite(seg.location.lat))) continue;
    if (shot === 'fact' && !seg.fact) continue; // the director's fact card needs seg.fact
    const focus = e.focus && e.focus in ctx.cast ? e.focus : ctx.speaker;
    const framing = shot === 'montage' ? null : (e.framing ?? null);
    const char = Number.isFinite(e.char) ? Math.max(0, e.char) : 0;
    const ss = ctx.sentences || [];
    let si = 0;
    while (si + 1 < ss.length && ss[si + 1].start <= char + 2) si++;
    const card = shot === 'montage' ? montageCard(e, seg, si, rundown, out) : null;
    const prev = out[out.length - 1];
    if (prev && prev.shot === shot && prev.framing === framing && prev.focus === focus && prev.card === card && !e.move) continue;
    const mid = out.length > 0 && Math.abs(char - (ss[si]?.start ?? 0)) > 2;
    out.push({ k: out.length, char, at: e.at, sentence: si, mid, shot, framing, focus, move: e.move ?? null, card, minLen: Number.isFinite(e.minLen) ? e.minLen : null });
  }
  return out.length ? out : null;
}

/** Rundown index of the story a headline sentence teases (event storyId, seg.teases, else the planner's card). */
function montageCard(e, seg, si, rundown, out) {
  const list = Array.isArray(rundown) ? rundown : [];
  const sid = e.storyId || (Array.isArray(seg.teases) ? seg.teases[si] : null);
  const at = sid ? list.findIndex((r) => r && r.storyId === sid) : -1;
  if (at >= 0) return at;
  const k = Number.isInteger(e.card) ? e.card : out.filter((c) => c.shot === 'montage').length;
  return list.length ? Math.min(Math.max(0, k), list.length - 1) : Math.max(0, k);
}

const NONE = {}; // replan key: no recording
const WARM = { id: 'warm-up', program: { id: 'world-now' }, cast: { A: 'paco', B: 'lola' }, segments: [{ type: 'story', anchor: 'A', text: 'Good evening. Floods have forced 40,000 people from their homes in southern Brazil.', cues: [] }] };

export class LiveDirection {
  /** @param opts { director (setShot, scene), channel ({ presenters }), audio (mode) } */
  constructor({ director, channel = null, audio = null }) {
    this.director = director;
    this.scene = director.scene;
    this.channel = channel;
    this.audio = audio;
    this.ep = null;
    this.plans = new WeakMap();
    this.replans = new WeakMap(); // seg -> { key, plan } made for the voice that really plays
    this.story = null; // { seg, cues, handler } registered by playStory
    this.idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 1500 }) : (fn) => setTimeout(fn, 30);
    // the first plan of a session warms the text model and lexicon (~100-200 ms): do it now,
    // on the start card, so no programme open ever pays for it
    this.idle(() => planSegment(WARM, 0, {}));
  }

  /** A new episode is on air: remember it and plan its segments in idle time. */
  episode(ep) {
    this.ep = ep && Array.isArray(ep.segments) ? ep : null;
    this.scene.episode = this.ep;
    this.scene.presenters = this.channel?.presenters || null; // the Stage's looks for ids without a design
    this.scene.segPlan = null;
    this.story = null;
    this.warm(this.ep, 0);
  }

  warm(ep, i) {
    if (!ep || i >= ep.segments.length) return;
    this.idle(() => {
      if (this.ep !== ep) return;
      this.planAt(i);
      this.warm(ep, i + 1);
    });
  }

  /** Plan record of segment i (planned once). */
  planAt(i) {
    const seg = this.ep?.segments?.[i];
    if (!seg || typeof seg !== 'object') return null;
    let p = this.plans.get(seg);
    if (p) return p;
    const t0 = performance.now();
    const res = planSegment(this.ep, i, { presenters: this.channel?.presenters || {}, gapAfter: GAP_AFTER });
    p = { id: `${this.ep.id}:${i}`, index: i, ctx: res.ctx, events: res.events, errors: res.errors, voice: null, speechStart: null, speechEnd: null, ms: performance.now() - t0 };
    this.plans.set(seg, p);
    return p;
  }

  /** Plan segment i again for the voice that will actually play (recorded words, or none). */
  replan(i, recorded) {
    const seg = this.ep.segments[i];
    const key = recorded || NONE;
    const hit = this.replans.get(seg);
    if (hit && hit.key === key) return hit.plan;
    const segments = this.ep.segments.slice();
    segments[i] = { ...seg, audio: recorded || undefined };
    const t0 = performance.now();
    const res = planSegment({ ...this.ep, segments }, i, { presenters: this.channel?.presenters || {}, gapAfter: GAP_AFTER });
    const plan = { id: `${this.ep.id}:${i}`, index: i, ctx: res.ctx, events: res.events, errors: res.errors, voice: null, speechStart: null, speechEnd: null, ms: performance.now() - t0 };
    this.replans.set(seg, { key, plan });
    return plan;
  }

  indexOf(seg) {
    return this.ep?.segments?.indexOf(seg) ?? -1;
  }

  /**
   * playStory: the story's v2 shot cues (null = use the old beats). `handler(cue)`
   * applies a later cue with the director's card/wall/MIN_SHOT logic.
   */
  shots(seg, hasImg, handler) {
    const i = this.indexOf(seg);
    const p = i >= 0 ? this.planAt(i) : null;
    const cues = p ? cuesFromPlan(p, { hasImg }) : null;
    this.story = cues ? { seg, cues, handler } : null;
    return cues;
  }

  /**
   * playIntro: the intro on its plan (montage frames on the spoken teaser, the greeting's
   * studio shot). Applies the opening cue now, registers the rest for begin()/onSentence and
   * speaks the intro; the promise resolves when the last shot has held its `minLen` (a
   * templated NEWS IN 60 intro: 4 s; at most 2 s past the voice). Null when there is no plan
   * (the director's own montage then).
   */
  intro(seg) {
    const i = this.indexOf(seg);
    const p = i >= 0 ? this.planAt(i) : null;
    const cues = p ? cuesFromPlan(p, { rundown: this.scene.rundown }) : null;
    if (!cues) return null;
    let last = null;
    const apply = (cue) => {
      last = cue;
      if (cue.shot === 'montage') this.director.setShot('montage', { focus: seg.anchor, storyId: null, card: { index: cue.card } });
      else this.director.setShot(cue.shot, { focus: cue.focus, storyId: null, wall: { mode: 'logo' }, card: null, framing: cue.framing, cameraMove: cue.move });
    };
    this.story = { seg, cues, handler: apply };
    apply(cues[0]);
    return this.director.say(seg).then(() => {
      const need = Math.min(2, (last?.minLen || 0) - (now() - (this.scene.shotSince || 0)));
      return need > 0 ? new Promise((r) => setTimeout(r, need * 1000)) : undefined;
    });
  }

  /**
   * say(): the segment's plan goes on air. `recorded` = the voice speak() will really play
   * (the voice player's answer: a recording that arrived after the episode, or null when it
   * falls back to the browser voice); a plan made for other timing is re-made for it.
   * Returns the handle for speak() and onSentence.
   */
  begin(seg, recorded = undefined) {
    const i = this.indexOf(seg);
    let p = i >= 0 ? this.planAt(i) : null;
    if (!p) return null;
    if (recorded !== undefined && (recorded || null) !== (seg.audio || null) && (recorded?.words?.length || seg.audio?.words?.length)) p = this.replan(i, recorded);
    p.voice = this.audio?.mode ?? null;
    p.speechStart = null;
    p.speechEnd = null;
    this.scene.segPlan = p;
    const story = this.story?.seg === seg ? this.story : null;
    const cues = story ? story.cues : cuesFromPlan(p);
    const apply = story ? story.handler : (cue) => this.studioCut(cue);
    const timers = [];
    const fireCue = (cue) => {
      const st = this.scene.stinger;
      const left = st ? st.start + STINGER - now() : 0;
      if (left > 0) timers.push(setTimeout(() => fireCue(cue), left * 1000 + 20));
      else apply(cue);
    };
    if (!story && cues?.[0]) fireCue(cues[0]);
    const mids = cues ? cues.filter((c) => c.k > 0 && c.mid) : [];
    return {
      plan: p,
      speak: mids.length ? { marks: mids.map((c) => c.char), onMark: (j) => mids[j] && fireCue(mids[j]) } : null,
      sentence: (si) => {
        if (si === 0 && p.speechStart == null) p.speechStart = now();
        if (cues) for (const c of cues) if (c.k > 0 && !c.mid && c.sentence === si) fireCue(c);
      },
      end: () => {
        p.speechEnd = now();
        for (const id of timers) clearTimeout(id);
        if (this.story?.seg === seg) this.story = null;
      },
    };
  }

  /** Default cue handler: studio cuts only, MIN_SHOT holds (chats, outros, intros without a montage). */
  studioCut(cue, held = false) {
    const s = this.scene;
    if (!STUDIO.has(s.shot) || !STUDIO.has(cue.shot)) return;
    const wait = cue.k > 0 && !held ? MIN_SHOT - (now() - (s.shotSince || 0)) : 0;
    if (wait > 0) {
      const p = s.segPlan;
      setTimeout(() => s.segPlan === p && p.speechEnd == null && this.studioCut(cue, true), wait * 1000);
      return;
    }
    const reframe = s.shot === cue.shot && s.focus === cue.focus && (s.framing ?? null) !== cue.framing;
    this.director.setShot(cue.shot, { focus: cue.focus, framing: cue.framing, cameraMove: cue.move });
    if (reframe) s.shotSince = now(); // a new framing of the same shot is a cut too
  }
}
