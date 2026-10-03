// Live music beds (owner 17:05: "música suave de fondo para cada programa y momento, transiciones suaves, sin tapar
// al presentador"). Until now only the showcase recorder added beds, offline, after the fact: a live stream had none.
// This runs the lofi bed engine (music/proposals/lofi) on the channel's own AudioContext, cued by the director at
// the moments the recorder's music track uses (tools/showcase/lib/music.mjs deriveCues), and ducking itself under
// every voice (the engine's own per-programme depths; the AudioEngine's bed duck is set to 0 for it).
//
//   const music = new LiveMusic(audio, { enabled })   music.cue('story', { programId, emotion, grave, segment })
// Every call is guarded: music never takes the picture or the playout down.

import { LofiEngine } from './proposals/lofi/engine.js';

// accents only for the programmes whose bible uses them (a programme policy answers an unknown moment with silence)
const ACCENTS = {
  pip: new Set(['world-now']),
  item: new Set(['news-60']),
  shot: new Set(['cosmos']),
  featureEnd: new Set(['tech-bytes']),
  introEnd: new Set(['money-minute']),
};
export const SHOT_KIND = { map: 'map', full: 'picture', fact: 'presenter', close: 'presenter', wide: 'presenter' };

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
    if (ACCENTS[moment] && !ACCENTS[moment].has(programId)) return false;
    const e = this.ensure();
    if (!e) return false;
    return this.guard(() => {
      e.cue(moment, { ...opts, programId }, this.audio.context.currentTime);
      return true;
    });
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
