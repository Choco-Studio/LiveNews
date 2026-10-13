// Live music beds (owner 17:05: "música suave de fondo para cada programa y momento, transiciones suaves, sin tapar
// al presentador"). Until now only the showcase recorder added beds, offline, after the fact: a live stream had none.
// This runs the lofi bed engine (music/proposals/lofi) on the channel's own AudioContext, cued by the director at
// the moments the recorder's music track uses (tools/showcase/lib/music.mjs deriveCues), and ducking itself under
// every voice (the engine's own per-programme depths; the AudioEngine's bed duck is set to 0 for it).
//
//   const music = new LiveMusic(audio, { enabled })   music.cue('story', { programId, emotion, grave, segment })
// Every call is guarded: music never takes the picture or the playout down.

import { LofiEngine } from './proposals/lofi/engine.js';
import { SEGMENT_MOMENTS, isGrave, signoffAllowed } from './proposals/lofi/cuesheet.js';

// accents only for the programmes whose bible uses them (a programme policy answers an unknown moment with silence)
const ACCENTS = {
  pip: new Set(['world-now']),
  item: new Set(['news-60']),
  shot: new Set(['cosmos']),
  featureEnd: new Set(['tech-bytes']),
  introEnd: new Set(['money-minute']),
};
export const SHOT_KIND = { map: 'map', full: 'picture', fact: 'presenter', close: 'presenter', wide: 'presenter', broll: 'picture', location: 'presenter', twoway: 'presenter', tease: 'picture', scores: 'picture' };

export class LiveMusic {
  /**
   * @param audio   the AudioEngine (context, musicBus, voiced, musicDuckDb)
   * @param o.enabled  false (?beds=0, or a recorder that renders beds itself) never starts the engine
   * @param o.stories  'soft' (a very soft bed under light stories, the owner's switch) | 'off' (the bibles: dry)
   * @param o.makeEngine (ctx, destination, opts) => engine (tests)
   */
  constructor(audio, { enabled = true, stories = 'soft', makeEngine = null } = {}) {
    this.audio = audio;
    this.enabled = enabled;
    this.stories = stories;
    this.makeEngine = makeEngine || ((ctx, dest, opts) => new LofiEngine(ctx, dest, opts));
    this.engine = null;
    this.program = null;
    this.speaking = false;
    this.timer = 0;
    this.errors = 0;
    // the cue sheet's grave memory, kept here too (the engine keeps its own) so the director may ask it with the beds off
    this.segment = 0;
    this.graveSeg = null;
  }

  /** The engine, started on first use once the AudioContext exists (after the viewer's unlock). */
  ensure() {
    if (!this.enabled) return null;
    if (this.engine) return this.engine;
    const ctx = this.audio?.context;
    const bus = this.audio?.musicBus;
    if (!ctx || !bus) return null;
    this.audio.musicDuckDb = 0; // the engine ducks itself, per programme (bibles)
    this.engine = this.makeEngine(ctx, bus, { sharedStings: true, bedUnderStories: this.stories });
    this.engine.start?.();
    // the voice state, polled: the engine's duck follows what is actually heard
    if (typeof setInterval === 'function') this.timer = setInterval(() => this.tick(), 100);
    return this.engine;
  }

  tick() {
    const e = this.engine;
    if (!e) return;
    const on = Boolean(this.audio?.voiced);
    if (on === this.speaking) return;
    this.speaking = on;
    this.guard(() => e.setSpeaking(on, this.audio.context.currentTime));
  }

  /** The programme the next cues belong to. */
  setProgram(id) {
    this.program = id || null;
  }

  /** cue(moment, opts) now, in the cue sheet's vocabulary (see music/proposals/lofi/cuesheet.js). */
  cue(moment, opts = {}) {
    const programId = opts.programId ?? this.program;
    this.remember(moment, { ...opts, programId });
    if (ACCENTS[moment] && !ACCENTS[moment].has(programId)) return false;
    const e = this.ensure();
    if (!e) return false;
    return this.guard(() => {
      e.cue(moment, { ...opts, programId }, this.audio.context.currentTime);
      return true;
    });
  }

  /** The grave memory (the engine's rule): which segment is grave, so the one after it stays dry. */
  remember(moment, opts) {
    if (moment === 'leadin' || moment === 'open') this.graveSeg = null;
    if (!SEGMENT_MOMENTS.has(moment) || (moment === 'headlines' && opts.line > 0)) return;
    this.segment = opts.segment ?? this.segment + 1;
    if (moment === 'story' && (isGrave(opts) || opts.breaking) && opts.programId !== 'news-60') this.graveSeg = this.segment;
  }

  /**
   * SCORE CENTRE's row tick (full-time.md §6): in how many seconds it should sound, `lead` or a little later, so the bed's
   * own tick leaves room for it (LofiEngine.rowTick). Without a bed: `lead`.
   */
  rowTick(lead = 0.03) {
    const e = this.engine;
    const ctx = this.audio?.context;
    if (!e || !ctx || typeof e.rowTick !== 'function') return lead;
    const at = this.guard(() => e.rowTick(ctx.currentTime + lead));
    return typeof at === 'number' ? Math.max(lead, at - ctx.currentTime) : lead;
  }

  /**
   * PAY ATTENTION's countdown (pay-attention.md §6): `halves` ticks on the bed's half notes, the first `lead` s from now or
   * on the next half note after it (LofiEngine.countdown). Returns { start, ticks, end, half } in seconds from now, so the
   * director runs the countdown bar from `start` to `end` and reveals on `end`; without the engine (beds off), a grid of
   * the quiz's half notes from `lead` (the ticks are then not heard: the beds and their ticks are one switch).
   */
  countdown(halves = 4, lead = 0.05) {
    const n = Math.max(1, Math.round(halves));
    const half = 2 * (60 / 112);
    const plain = { start: lead, ticks: Array.from({ length: n }, (_, i) => lead + i * half), end: lead + n * half, half };
    const e = this.engine;
    const ctx = this.audio?.context;
    if (!e || !ctx || typeof e.countdown !== 'function') return plain;
    const now = ctx.currentTime;
    const r = this.guard(() => e.countdown(now + lead, n));
    if (!r || typeof r.start !== 'number') return plain;
    return { start: r.start - now, ticks: r.ticks.map((t) => t - now), end: r.end - now, half: r.half };
  }

  /**
   * May the programme's sign-off cue play now (audio.sfx('outro'), after the sign-off's last word)? FULL TIME's is the
   * theme's tail, never in the segment after grave news (full-time.md §6); every other programme's always plays.
   */
  signoffAllowed(programId = this.program) {
    return signoffAllowed(programId, { afterGrave: this.graveSeg != null && this.segment === this.graveSeg + 1 });
  }

  guard(fn) {
    try {
      return fn();
    } catch (err) {
      if (this.errors++ < 3) console.warn('[music]', err);
      return false;
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
    this.guard(() => this.engine?.stop?.(1));
  }
}
