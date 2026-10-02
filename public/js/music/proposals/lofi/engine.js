// Lo-fi newsroom proposal: the bed engine. Plays songs (palettes.js), the
// cue-driven World Now headline arc and one-shots (stings.js), and turns
// director cues (cuesheet.js) into musical transitions:
//   - same song, new moment  -> layers cross-fade on the next bar line (or the
//     next beat when the music must get out of the way), no restart;
//   - new song               -> the old bed closes a low-pass and throws its
//     last notes into the tape echo while the new one enters on that downbeat;
//   - silence                -> fade (optionally on the bar line), no new notes;
//   - shot                   -> COSMOS: the bed bus fades in over 1.0 s on a
//     picture cut and out over 1.5 s on the cut away, the song running on;
//   - grave                  -> silence for that segment and the next one.
// Speech ducking is per song (bibles: -9 dB Tech, -4 dB News in 60, bells
// muted in Cosmos...), with a hold so beds do not pump between sentences, plus
// a 6 dB dip at 2.5 kHz while anyone speaks. Works on an AudioContext (live,
// look-ahead scheduler) and an OfflineAudioContext (same code via pump()).

import { Rig } from './synth.js';
import { PALETTES, LAYERS, DUCK_GROUP, arrangementFor } from './palettes.js';
import { barEvents, swingAt } from './arranger.js';
import { STINGS } from './stings.js';
import { resolveCue, SEGMENT_MOMENTS, isGrave } from './cuesheet.js';
import { SCALES, degreeToMidi, rng, hash } from './theory.js';
import { holdAt, targetTo, rampTo, dbToGain } from './automation.js';

export const LOOKAHEAD = 0.6; // seconds of music scheduled ahead of the clock
export const MIX = {
  duck: { melody: 0.08, keys: 0.35, drums: 0.4, bed: 0.56, air: 0.4, tex: 0.3 }, // default depths (linear) while speaking
  duckAttack: 0.04, // time constant (s): settled in ~120 ms
  duckRelease: 0.12, // time constant (s): back in ~350 ms
  duckHold: 0.35, // s of speech-off before releasing (bridges sentence gaps)
  pocketHz: 2500,
  pocketSpeech: -6, // dB dip at 2.5 kHz while anyone speaks
  headline: { level: -12, duckDb: -4 }, // WORLD NOW headline bus (dB): brass ~21 LU under speech, gaps <= -10 LU
  graveFade: 2.5,
  output: 1.0, // calibrated against the house voice chain (-16 LUFS per clip, upmixed to stereo as on air)
};
const SENDS = {
  melody: { verb: 1.2, echo: 1 },
  keys: { verb: 0.7, echo: 0.35 },
  drums: { verb: 0.3, echo: 0 },
  bed: { verb: 0.8, echo: 0 },
  air: { verb: 0.15, echo: 0 },
  tex: { verb: 0, echo: 0 },
};
const AIR = new Set(['air', 'tex']); // bypass the bed low-pass
// Stings audio.js already has as network cues (themes.js cueFor: breaking, promo, the per-programme
// sign-offs on the end card, the ident): with `sharedStings` the engine leaves them to audio.js.
export const SHARED_BY_AUDIO = new Set(['breaking', 'upNext', 'signoffBrass', 'moneyButton', 'sixtyBell', 'shortIdent']);
const GROUPS = Object.keys(SENDS);

/** Duck depth (linear) of a group for an arrangement of a song. */
function duckDepth(pal, arr, grp) {
  const o = arr.duck?.[grp] ?? pal.duck?.[grp];
  if (o != null) return o;
  return pal.duckDb != null ? dbToGain(pal.duckDb) : MIX.duck[grp];
}

/** One running song with its own buses, echo and texture. */
class Bed {
  constructor(engine, id, t0, arr, { entry = 'fade', speaking = false } = {}) {
    const ctx = engine.ctx;
    const rig = engine.rig;
    this.engine = engine;
    this.id = id;
    this.pal = PALETTES[id];
    this.seedId = `${id}#${engine.seed}`;
    this.spb = 60 / this.pal.bpm;
    this.barSec = this.spb * 4;
    this.t0 = t0;
    this.nextBar = 0;
    this.endAt = Infinity;
    this.doneAt = Infinity;
    this.timeline = [{ bar: 0, arr }];
    this.current = arr;
    this.state = {};
    this.entry = arr.entry || entry;
    this.nodes = [];
    this.sources = [];
    this.lastFadeIn = -Infinity;
    const g = (v) => {
      const n = ctx.createGain();
      n.gain.value = v;
      this.nodes.push(n);
      return n;
    };

    // Shot gain: COSMOS fades the bus by shot while the song runs on underneath.
    this.shot = g(arr.hidden ? 0 : 1);
    this.shot.connect(rig.sum);
    this.out = g(0);
    this.out.gain.setValueAtTime(0, Math.max(0, t0 - 0.01));
    this.out.gain.setValueAtTime(dbToGain(arr.gain + (this.pal.trim || 0)), t0);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.5;
    this.lp.frequency.value = arr.lp;
    this.nodes.push(this.lp);
    this.sum = g(1);
    this.sum.connect(this.lp).connect(this.out).connect(this.shot);
    // Reverb and echo returns follow the bed's level and its shot gain (a hidden COSMOS bed is
    // silent, reverb included), but release more slowly so tails ring on naturally.
    const level0 = dbToGain(arr.gain + (this.pal.trim || 0));
    this.sendOut = g(0);
    this.sendOut.gain.setValueAtTime(0, Math.max(0, t0 - 0.01));
    this.sendOut.gain.setValueAtTime(level0, t0);
    this.sendShot = g(arr.hidden ? 0 : 1);
    this.sendOut.connect(this.sendShot).connect(rig.reverbIn);

    // Ping-pong tape echo (dotted 8th), wobbling slightly like old tape.
    this.echoIn = g(1);
    const time = Math.min(1.5, this.spb * 0.75);
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = time;
    dr.delayTime.value = time;
    const elp = ctx.createBiquadFilter();
    elp.type = 'lowpass';
    elp.frequency.value = 2000;
    const ehp = ctx.createBiquadFilter();
    ehp.type = 'highpass';
    ehp.frequency.value = 320;
    const pl = ctx.createStereoPanner();
    pl.pan.value = -0.55;
    const pr = ctx.createStereoPanner();
    pr.pan.value = 0.55;
    const fb = g(0.34);
    this.echoWet = g(1);
    this.echoIn.connect(dl);
    dl.connect(elp).connect(ehp);
    ehp.connect(pl).connect(this.echoWet);
    ehp.connect(dr);
    dr.connect(pr).connect(this.echoWet);
    dr.connect(fb).connect(dl);
    this.echoOut = g(0);
    this.echoOut.gain.setValueAtTime(0, Math.max(0, t0 - 0.01));
    this.echoOut.gain.setValueAtTime(level0, t0);
    this.echoWet.connect(this.echoOut).connect(this.shot);
    const wob = ctx.createOscillator();
    wob.frequency.value = 0.45;
    const wobG = g(0.0012);
    wob.connect(wobG);
    wobG.connect(dl.delayTime);
    wobG.connect(dr.delayTime);
    wob.start(t0);
    this.sources.push(wob);
    this.nodes.push(dl, dr, elp, ehp, pl, pr);

    // Speech-duck groups, each with its reverb and echo sends (post-duck).
    this.duck = {};
    this.sends = {};
    for (const grp of GROUPS) {
      const d = g(speaking ? duckDepth(this.pal, arr, grp) : 1);
      d.connect(AIR.has(grp) ? this.out : this.sum);
      const verb = g(this.pal.fx.reverb * SENDS[grp].verb);
      const echo = g(this.pal.fx.echo * SENDS[grp].echo);
      d.connect(verb).connect(this.sendOut);
      d.connect(echo).connect(this.echoIn);
      this.duck[grp] = d;
      this.sends[grp] = [verb, echo];
    }

    // Layer gains = the arrangement. Entry: instant, a fade (1.5 bars), a cross-fade
    // (half a bar) or staggered (Money Minute's intro: pad, then bass, then chords).
    this.layer = {};
    const fade = this.entry === 'instant' ? 0 : this.entry === 'xfade' ? this.barSec * 0.5 : this.barSec * 1.5;
    for (const name of LAYERS) {
      const lg = g(0);
      const level = engine.level(arr, name);
      const start = t0 + (arr.stagger?.[name] ?? 0) * this.barSec;
      lg.gain.setValueAtTime(0, t0);
      if (arr.stagger) {
        lg.gain.setValueAtTime(0, start);
        lg.gain.linearRampToValueAtTime(level, start + this.barSec * 0.5);
      } else {
        lg.gain.setValueAtTime(fade ? 0 : level, t0);
        if (fade) lg.gain.linearRampToValueAtTime(level, t0 + fade);
      }
      let tail = lg;
      if (name === 'keys' && this.pal.fx.tremolo) {
        const pan = ctx.createStereoPanner();
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.21;
        const depth = g(this.pal.fx.tremolo * 0.5);
        lfo.connect(depth).connect(pan.pan);
        lfo.start(t0);
        this.sources.push(lfo);
        this.nodes.push(pan);
        lg.connect(pan);
        tail = pan;
      }
      tail.connect(this.duck[DUCK_GROUP[name]]);
      this.layer[name] = lg;
    }
    this.tex = this.pal.tex > 0 ? rig.texture(t0, this.pal.tex, this.layer.tex) : { stop() {} };
  }

  barTime(n) {
    return this.t0 + n * this.barSec;
  }

  arrAt(n) {
    let a = this.timeline[0].arr;
    for (const e of this.timeline) if (e.bar <= n) a = e.arr;
    return a;
  }

  /** First bar line at or after t that has not been scheduled yet. */
  boundaryAfter(t) {
    return Math.max(this.nextBar, Math.ceil((t - this.t0) / this.barSec - 1e-6));
  }

  beatAfter(t) {
    return this.t0 + Math.max(0, Math.ceil((t - this.t0) / this.spb - 1e-6)) * this.spb;
  }

  setArrangement(arr, bar, t, dur) {
    this.timeline = this.timeline.filter((e) => e.bar < bar);
    this.timeline.push({ bar, arr });
    this.current = arr;
    for (const name of LAYERS) rampTo(this.layer[name].gain, this.engine.level(arr, name), t, dur);
    const level = dbToGain(arr.gain + (this.pal.trim || 0));
    rampTo(this.out.gain, level, t, dur);
    rampTo(this.sendOut.gain, level, t, dur);
    rampTo(this.echoOut.gain, level, t, dur);
    targetTo(this.lp.frequency, arr.lp, t, dur / 2);
    if (this.engine.speaking) for (const grp of GROUPS) targetTo(this.duck[grp].gain, duckDepth(this.pal, arr, grp), t, dur / 3);
  }

  duckTo(on, t) {
    const times = this.pal.duckTimes || {};
    for (const grp of GROUPS) {
      if (on) targetTo(this.duck[grp].gain, duckDepth(this.pal, this.current, grp), t, times.attack ?? MIX.duckAttack);
      else targetTo(this.duck[grp].gain, 1, t + (times.hold ?? MIX.duckHold), times.release ?? MIX.duckRelease);
    }
  }

  /** COSMOS picture shots: fade the bus in (1.0 s) or out (1.5 s); the song keeps playing. */
  showBus(show, t) {
    if (show) {
      targetTo(this.shot.gain, 1, t, 1.0 / 3);
      targetTo(this.sendShot.gain, 1, t, 1.0 / 3);
      this.lastFadeIn = t;
    } else {
      targetTo(this.shot.gain, 0, t, 1.5 / 3);
      targetTo(this.sendShot.gain, 0, t, 1.5 / 2); // the reverb tail lingers a little longer
    }
    this.shown = show;
  }

  /** Stop at t: no new notes, close the filter, fade; tail=true lets the echo/reverb ring on. */
  fadeOut(t, dur, { tail = true, sweep = true } = {}) {
    this.endAt = Math.min(this.endAt, t);
    targetTo(this.out.gain, 0, t, dur / 5); // -43 dB after `dur`
    this.out.gain.setValueAtTime(0, t + dur * 1.8);
    if (sweep) targetTo(this.lp.frequency, 320, t, dur / 3);
    if (!tail) {
      targetTo(this.sendOut.gain, 0, t, dur / 4);
      targetTo(this.echoOut.gain, 0, t, dur / 5);
    } else {
      targetTo(this.sendOut.gain, 0, t, Math.max(0.8, dur / 2)); // returns ring on, then die away
      targetTo(this.echoOut.gain, 0, t + this.spb, 0.9);
      // Echo throw: the last notes before the cut repeat into the transition.
      const melody = this.sends.melody[1].gain;
      const keys = this.sends.keys[1].gain;
      rampTo(melody, this.pal.fx.echo * 1.6, Math.max(this.t0, t - this.spb), this.spb);
      rampTo(keys, this.pal.fx.echo * 1.2, Math.max(this.t0, t - this.spb), this.spb);
      targetTo(melody, 0, t + this.spb, 0.4);
      targetTo(keys, 0, t + this.spb, 0.4);
    }
    this.tex.stop(t);
    this.doneAt = t + dur * 2 + 5;
  }

  schedule(until) {
    while (this.barTime(this.nextBar) < until && this.barTime(this.nextBar) < this.endAt) {
      this.scheduleBar(this.nextBar++);
    }
  }

  scheduleBar(n) {
    const rig = this.engine.rig;
    const arr = this.arrAt(n);
    const prev = n > 0 ? this.arrAt(n - 1) : arr;
    const { events } = barEvents(this.pal, this.seedId, arr, prev, n, this.state, { noDrums: n === 0 && this.entry === 'fade' });
    const t0 = this.barTime(n);
    // Slow timbral drift over ~23 bars so long beds breathe.
    const drift = 1 + 0.12 * Math.sin((2 * Math.PI * n) / 23);
    if (n > 0 && this.endAt === Infinity) this.lp.frequency.setTargetAtTime(arr.lp * drift, t0, 1.5);
    const jr = rng(hash(this.seedId, 'jitter', n));
    const voiceFree = this.pal.duck?.melody === 0; // COSMOS: bells and arpeggios only when nobody speaks
    for (const e of events) {
      const drum = !e.midi;
      const jitter = (jr() - 0.5) * (drum ? 0.008 : 0.012);
      const t = Math.max(t0, t0 + swingAt(e.at, this.pal.swing) * this.spb + (e.strum || 0) + jitter);
      if (t >= this.endAt) continue;
      if (voiceFree && (e.layer === 'lead' || e.layer === 'arp') && this.engine.voiceNear(t)) continue;
      const dest = this.layer[e.layer];
      const dur = (e.dur || 0.25) * this.spb;
      this.engine.noteLog(t, e.layer, e.inst);
      switch (e.inst) {
        case 'kick': rig.kick(t, e.vel, dest); break;
        case 'snare': rig.snare(t, e.vel, dest, e.p); break;
        case 'hat': rig.hat(t, e.vel, dest, e.open); break;
        case 'shaker': rig.shaker(t, e.vel, dest); break;
        case 'rim': rig.rim(t, e.vel, dest); break;
        case 'tick': rig.tick(t, e.vel, dest, e.tok); break;
        case 'clock': rig.clock(t, e.vel, dest, e.tok); break;
        default:
          if (typeof rig[e.inst] === 'function') rig[e.inst](t, e.midi, dur, e.vel, dest, e.p || {});
      }
    }
  }

  dispose() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch { /* ignore */ }
    }
    for (const n of [...this.nodes, ...Object.values(this.layer)]) {
      try {
        n.disconnect();
      } catch { /* ignore */ }
    }
  }
}

export class LofiEngine {
  constructor(ctx, destination, { gravePad = false, sharedStings = false, bedUnderStories = 'off', seed = 'globit', noteLog = false } = {}) {
    this.ctx = ctx;
    this.rig = new Rig(ctx, { seed: 24 });
    this.rig.out.gain.value = MIX.output;
    this.rig.out.connect(destination);
    this.rig.pocket.frequency.value = MIX.pocketHz;
    this.gravePad = gravePad;
    this.sharedStings = sharedStings;
    this.bedUnderStories = bedUnderStories;
    this.seed = seed; // per episode: the same episode always plays the same notes
    this.solo = null; // Set of layer names (lab diagnostics), or null for all
    this.bed = null;
    this.beds = new Set();
    this.speaking = false;
    this.pocketBase = 0;
    this.timer = 0;
    this.log = []; // cue log for the lab page
    this.notes = noteLog ? [] : null; // note log: lets tests check that no bell sounds under a voice
    this.speechPlan = null; // [[start, end]] when known in advance (offline renders, scripted shows)
    this.graveSeg = null;
    this.segment = 0;
    this.stingBuses = [];
    // Stings: their own bus (never under speech by design), with some reverb.
    this.stingBus = ctx.createGain();
    this.stingBus.connect(this.rig.sum);
    const sv = ctx.createGain();
    sv.gain.value = 0.3;
    this.stingBus.connect(sv).connect(this.rig.reverbIn);
    // WORLD NOW headline chords: their own ducked bus.
    this.headBus = ctx.createGain();
    this.headBus.gain.value = dbToGain(MIX.headline.level);
    this.headBus.connect(this.rig.sum);
    const hv = ctx.createGain();
    hv.gain.value = 0.18;
    this.headBus.connect(hv).connect(this.rig.reverbIn);
    this.headlineVoice = null;
  }

  /** Layer level of an arrangement (a `solo` set mutes the other layers: lab diagnostics). */
  level(arr, name) {
    if (this.solo && !this.solo.has(name)) return 0;
    return arr.layers[name] || 0;
  }

  /** Is a voice active at t (or about to start)? Uses the known speech plan offline, the live state otherwise. */
  voiceNear(t) {
    if (this.speechPlan) return this.speechPlan.some(([a, b]) => t >= a - 0.15 && t <= b + 0.2);
    return this.speaking;
  }

  noteLog(t, layer, inst) {
    if (this.notes && this.notes.length < 20000) this.notes.push({ t, layer, inst });
  }

  registerSting(g) {
    this.stingBuses.push(g);
    if (this.stingBuses.length > 24) this.stingBuses.shift();
  }

  // ------------------------------------------------------------- scheduling

  pump(until = this.ctx.currentTime + LOOKAHEAD) {
    const now = this.ctx.currentTime;
    for (const bed of this.beds) {
      bed.schedule(until);
      if (now > bed.doneAt) {
        bed.dispose();
        this.beds.delete(bed);
      }
    }
  }

  /** Live mode: keep scheduling ahead of the clock. */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.pump();
      } catch (err) {
        console.warn('[lofi] pump', err);
      }
    }, 120);
  }

  stop(fade = 1) {
    const t = this.ctx.currentTime;
    for (const bed of this.beds) bed.fadeOut(t, fade, { tail: false });
    STINGS.headlineOff(this, t, fade);
    this.bed = null;
  }

  // ------------------------------------------------------------------ cues

  /** cue('story', { programId, emotion, segment, ... }) at context time `at`. */
  cue(moment, opts = {}, at = this.ctx.currentTime) {
    // Grave memory: no bed in a grave segment nor in the one after it (all bibles).
    if (SEGMENT_MOMENTS.has(moment) && !(moment === 'headlines' && opts.line > 0)) {
      this.segment = opts.segment ?? this.segment + 1;
      if (moment === 'story' && (isGrave(opts) || opts.breaking) && opts.programId !== 'news-60') this.graveSeg = this.segment;
    }
    if (moment === 'leadin' || moment === 'open') this.graveSeg = null;
    const afterGrave = this.graveSeg != null && (this.segment === this.graveSeg + 1);
    const action = resolveCue(moment, opts, {
      afterGrave, current: this.bed && this.bed.endAt === Infinity ? this.bed.id : null,
      gravePad: this.gravePad, sharedStings: this.sharedStings, bedUnderStories: this.bedUnderStories,
    });
    this.pump(at + LOOKAHEAD);
    this.log.push({ t: at, moment, action: action.kind, detail: action.song ? `${action.song}:${action.moment}` : action.name || '' });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200); // 24/7: keep the recent history only
    // Headline chords belong to the headlines only: anything else releases them.
    if (action.kind !== 'headline' && action.kind !== 'pip' && this.headlineVoice) STINGS.headlineOff(this, at + 0.02, action.kind === 'silence' ? action.fade : 0.3);
    switch (action.kind) {
      case 'bed': return this.toBed(action.song, action.moment, at);
      case 'gravePad': return this.toGravePad(action.song, at);
      case 'sting': return this.sting(action, at);
      case 'headline':
        if (this.bed) this.toSilence(at, 0.3);
        return STINGS.headline(this, at, action);
      case 'pip': return STINGS.pip(this, at, action);
      case 'shot': return this.shotCue(action, at);
      case 'accent': return this.accent(at);
      case 'cut': return this.cut(at);
      case 'keep': return at;
      default: return this.toSilence(at, action.fade ?? 0.8, action.atBar);
    }
  }

  toBed(id, moment, at) {
    const arr = arrangementFor(id, moment);
    const cur = this.bed;
    if (cur && cur.id === id && cur.endAt === Infinity) {
      if (cur.current.name === moment) return at;
      if (arr.immediate) {
        cur.setArrangement(arr, cur.boundaryAfter(at), at + 0.01, 0.12);
        return at;
      }
      const up = arr.energy > cur.current.energy;
      const req = Math.max(at, cur.dwellUntil || 0);
      const bar = cur.boundaryAfter(req);
      const tb = cur.barTime(bar);
      if (up) {
        // Lift on the bar line; a riser leads in when there is a beat to spare.
        if (tb - cur.spb >= at && arr.energy - cur.current.energy > 0.2) this.rig.riser(tb - cur.spb, cur.spb, 0.6, cur.duck.air);
        cur.setArrangement(arr, bar, tb, cur.spb);
      } else {
        // Get out of the way on the next beat, over a beat and a half.
        cur.setArrangement(arr, bar, cur.beatAfter(req), cur.spb * 1.5);
      }
      this.setPocket(arr.pocket, at);
      return at;
    }
    let t0;
    let entry = arr.entry || 'fade';
    const pal = PALETTES[id];
    const spb = 60 / pal.bpm;
    if (cur && cur.endAt === Infinity) {
      // A new song while one plays: hand over on its bar line (the vamp after a tape bed).
      let tb = cur.barTime(cur.boundaryAfter(at));
      if (tb - at > 1.6) tb = cur.beatAfter(at);
      cur.fadeOut(tb, cur.barSec * 0.75, { tail: true });
      t0 = tb;
      if (!arr.stagger && entry !== 'instant') entry = 'xfade';
    } else {
      t0 = at + 0.06;
    }
    const bed = new Bed(this, id, t0, arr, { entry, speaking: this.speaking });
    if (arr.dwellBars) bed.dwellUntil = t0 + arr.dwellBars * bed.barSec;
    // The signature's pickup between songs only on channel music: inside programmes the next
    // segment's first words would land on it.
    if (entry === 'xfade' && t0 - spb >= at && pal.programme === 'channel' && !this.speaking) this.pickup(bed, t0);
    this.bed = bed;
    this.beds.add(bed);
    this.setPocket(arr.pocket, at);
    bed.schedule(at + LOOKAHEAD);
    return t0;
  }

  pickup(bed, t0) {
    // The signature's first two notes ("low 5 - 1") announce the new song, on the sting bus.
    const pal = bed.pal;
    const scale = SCALES[pal.scale];
    const inst = ['chip', 'pluck', 'bell', 'ep', 'softtri', 'pulse12'].includes(pal.lead.inst) ? pal.lead.inst : 'bell';
    const tonic = pal.tonic + pal.lead.oct;
    const g = this.ctx.createGain();
    g.gain.value = this.speaking ? 0.12 : 0.45;
    g.connect(this.stingBus);
    this.rig[inst](t0 - bed.spb, degreeToMidi(tonic, scale, -3), bed.spb * 0.45, 0.6, g, {});
    this.rig[inst](t0 - bed.spb * 0.5, degreeToMidi(tonic, scale, 0), bed.spb * 0.45, 0.65, g, {});
  }

  toSilence(at, fade, atBar = false) {
    const cur = this.bed;
    if (cur) {
      // On the bar line when asked (and when it is near), otherwise now.
      let t = at + 0.02;
      if (atBar && cur.endAt === Infinity) {
        const tb = cur.barTime(cur.boundaryAfter(at));
        t = tb - at <= cur.barSec * 0.75 ? tb : at + 0.02;
      }
      cur.fadeOut(t, fade, { tail: fade > 1.2 ? false : true, sweep: true });
    }
    this.bed = null;
    return at;
  }

  /** Optional grave treatment: an almost inaudible low pad that fades away over 9 s. */
  toGravePad(id, at) {
    this.toSilence(at, MIX.graveFade);
    const arr = { ...arrangementFor(id, Object.keys(PALETTES[id].moments)[0]), name: 'gravePad', gain: -30, lp: 420, bright: 0.6, lead: null };
    arr.layers = Object.fromEntries(LAYERS.map((l) => [l, l === 'pad' ? 1 : l === 'bass' ? 0.5 : 0]));
    arr.hidden = false;
    const bed = new Bed(this, id, at + 0.06, arr, { entry: 'fade', speaking: this.speaking });
    bed.fadeOut(at + 2.5, 9, { tail: false, sweep: false });
    bed.endAt = at + 11.5;
    this.beds.add(bed);
    bed.schedule(at + LOOKAHEAD);
    return at;
  }

  sting(action, at) {
    // With sharedStings the audio stream plays these network cues itself (audio.sfx('breaking' |
    // 'promo' | 'outro' | 'jingle')): the beds still step aside, but the sting is not doubled.
    if (this.sharedStings && SHARED_BY_AUDIO.has(action.name)) action = { ...action, name: null };
    const cur = this.bed;
    let t = at + 0.05;
    if (action.stopBed && cur && cur.endAt === Infinity) {
      // Musical exit: on the next beat (but never wait long), the bed ducks out under the sting.
      const tb = action.hard ? at + 0.02 : Math.min(cur.beatAfter(at), at + 0.7);
      cur.fadeOut(tb, action.hard ? 0.15 : cur.spb, { tail: !action.hard });
      this.bed = null;
      t = action.hard ? at + 0.05 : tb;
    } else if (action.fadeBed && cur && cur.endAt === Infinity) {
      cur.fadeOut(at + 0.05, action.fadeBed, { tail: true });
      this.bed = null;
    }
    const fn = STINGS[action.name];
    return fn ? fn(this, t, action) : t;
  }

  /** COSMOS: picture and map cuts fade the bus in; any other cut fades it out. */
  shotCue({ show, expected }, at) {
    const cur = this.bed;
    if (!cur || cur.endAt !== Infinity || !cur.current.hidden) return at;
    if (show) {
      if (expected != null && expected < 6) return at; // no bed on picture shots shorter than 6 s
      if (!cur.shown && at - cur.lastFadeIn < 10) return at; // at most one fade-in per 10 s
      cur.showBus(true, at);
    } else if (cur.shown) cur.showBus(false, at);
    return at;
  }

  /** NEWS IN 60 item change: the bed's own tick, once, 4 dB above its regular ticks. */
  accent(at) {
    const cur = this.bed;
    if (!cur || cur.endAt !== Infinity) return at;
    this.rig.clock(at, 0.8 * dbToGain(4), cur.layer.perc, false);
    return at;
  }

  /** A hard cut (lead-in -> programme, ad boundaries): everything off in 25 ms. */
  cut(at) {
    for (const bed of this.beds) if (bed.endAt > at) bed.fadeOut(at, 0.12, { tail: false, sweep: false });
    for (const g of this.stingBuses) {
      holdAt(g.gain, at);
      g.gain.linearRampToValueAtTime(0, at + 0.025);
    }
    this.stingBuses = [];
    STINGS.headlineOff(this, at, 0.1);
    this.bed = null;
    return at;
  }

  // --------------------------------------------------------------- speech

  setSpeaking(on, at = this.ctx.currentTime) {
    on = Boolean(on);
    if (on === this.speaking) return;
    this.speaking = on;
    for (const bed of this.beds) bed.duckTo(on, at);
    const hd = dbToGain(MIX.headline.level + (on ? MIX.headline.duckDb : 0));
    if (on) targetTo(this.headBus.gain, hd, at, MIX.duckAttack);
    else targetTo(this.headBus.gain, hd, at + MIX.duckHold, MIX.duckRelease);
    if (on) targetTo(this.rig.pocket.gain, this.pocketBase + MIX.pocketSpeech, at, MIX.duckAttack);
    else targetTo(this.rig.pocket.gain, this.pocketBase, at + MIX.duckHold, MIX.duckRelease);
  }

  setPocket(db, at) {
    this.pocketBase = db ?? 0;
    targetTo(this.rig.pocket.gain, this.pocketBase + (this.speaking ? MIX.pocketSpeech : 0), at, 0.3);
  }
}
