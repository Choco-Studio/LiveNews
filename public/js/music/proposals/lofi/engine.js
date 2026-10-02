// Lo-fi newsroom proposal: the bed engine. Plays one programme "song" at a
// time and turns cues (moments) into musical transitions:
//   - same song, new moment  -> layers cross-fade on the next bar line (or the
//     next beat when the music must get out of the way), no restart;
//   - new song               -> the old bed closes a low-pass and throws its
//     last notes into the tape echo while the new one enters on the downbeat,
//     announced by the motif's two-note pickup ("so-do") in the new key;
//   - grave / breaking       -> fade to silence (2.5 s / 0.15 s), no new notes;
//   - stings                 -> one-shots on their own bus (bumpers, promo,
//     replay tag, breaking sting, end-card button).
// Speech ducking is per layer group (melody -22 dB, keys -9, drums -8, pad and
// bass -5) plus a dynamic EQ pocket at 2.4 kHz, with a hold so the bed does not
// pump between sentences. Works on an AudioContext (live, look-ahead scheduler)
// and on an OfflineAudioContext (the same code path, driven by pump()).

import { Rig } from './synth.js';
import { PALETTES, LAYERS, DUCK_GROUP, arrangementFor } from './palettes.js';
import { barEvents, swingAt } from './arranger.js';
import { STINGS } from './stings.js';
import { resolveCue } from './cuesheet.js';
import { SCALES, degreeToMidi, rng, hash } from './theory.js';

export const LOOKAHEAD = 0.6; // seconds of music scheduled ahead of the clock
export const MIX = {
  duck: { melody: 0.08, keys: 0.35, drums: 0.4, bed: 0.56, tex: 0.3 }, // linear gain while speaking
  duckAttack: 0.035, // time constant (s): ~100 ms to settle
  duckRelease: 0.28, // time constant (s): ~800 ms to come back
  duckHold: 0.35, // s of speech-off before releasing (bridges sentence gaps)
  pocketSpeech: -6, // extra dB of 2.4 kHz dip while speaking
  graveFade: 2.5,
  output: 1.0,
};
const SENDS = {
  melody: { verb: 1.2, echo: 1 },
  keys: { verb: 0.7, echo: 0.35 },
  drums: { verb: 0.3, echo: 0 },
  bed: { verb: 0.8, echo: 0 },
  tex: { verb: 0, echo: 0 },
};
const GROUPS = Object.keys(SENDS);
const dbToGain = (db) => 10 ** (db / 20);

function holdAt(param, t) {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t);
  else {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
  }
}
function rampTo(param, v, t, dur) {
  holdAt(param, t);
  param.linearRampToValueAtTime(v, t + Math.max(0.005, dur));
}
function targetTo(param, v, t, tc) {
  holdAt(param, t);
  param.setTargetAtTime(v, t, tc);
}

/** One running programme song with its own buses, echo and texture. */
class Bed {
  constructor(engine, id, t0, arr, { entry = 'fade', speaking = false } = {}) {
    const ctx = engine.ctx;
    const rig = engine.rig;
    this.engine = engine;
    this.id = id;
    this.pal = PALETTES[id];
    this.spb = 60 / this.pal.bpm;
    this.barSec = this.spb * 4;
    this.t0 = t0;
    this.nextBar = 0;
    this.endAt = Infinity;
    this.doneAt = Infinity;
    this.timeline = [{ bar: 0, arr }];
    this.current = arr;
    this.state = {};
    this.entry = entry;
    this.nodes = [];
    this.sources = [];
    const g = (v) => {
      const n = ctx.createGain();
      n.gain.value = v;
      this.nodes.push(n);
      return n;
    };

    this.out = g(0);
    this.out.gain.setValueAtTime(0, Math.max(0, t0 - 0.01));
    this.out.gain.setValueAtTime(dbToGain(arr.gain), t0);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.5;
    this.lp.frequency.value = arr.lp;
    this.nodes.push(this.lp);
    this.sum = g(1);
    this.sum.connect(this.lp).connect(this.out).connect(rig.sum);

    // Ping-pong tape echo (dotted 8th), wobbling slightly like old tape.
    this.echoIn = g(1);
    const time = Math.min(1.5, this.spb * 0.75);
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = time;
    dr.delayTime.value = time;
    const elp = ctx.createBiquadFilter();
    elp.type = 'lowpass';
    elp.frequency.value = 2200;
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
    this.echoWet.connect(rig.sum);
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
      const d = g(speaking ? MIX.duck[grp] : 1);
      d.connect(this.sum);
      const verb = g(this.pal.fx.reverb * SENDS[grp].verb);
      const echo = g(this.pal.fx.echo * SENDS[grp].echo);
      d.connect(verb).connect(rig.reverbIn);
      d.connect(echo).connect(this.echoIn);
      this.duck[grp] = d;
      this.sends[grp] = [verb, echo];
    }

    // Layer gains = the arrangement. Keys get a slow suitcase-Rhodes auto-pan.
    this.layer = {};
    const fade = entry === 'instant' ? 0 : entry === 'xfade' ? this.barSec * 0.5 : this.barSec * 1.5;
    for (const name of LAYERS) {
      const lg = g(0);
      const level = arr.layers[name] || 0;
      lg.gain.setValueAtTime(fade ? 0 : level, t0);
      if (fade) lg.gain.linearRampToValueAtTime(level, t0 + fade);
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
    this.tex = rig.texture(t0, this.pal.tex, this.layer.tex);
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
    for (const name of LAYERS) rampTo(this.layer[name].gain, arr.layers[name] || 0, t, dur);
    rampTo(this.out.gain, dbToGain(arr.gain), t, dur);
    targetTo(this.lp.frequency, arr.lp, t, dur / 2);
  }

  duckTo(on, t) {
    for (const grp of GROUPS) {
      if (on) targetTo(this.duck[grp].gain, MIX.duck[grp], t, MIX.duckAttack);
      else targetTo(this.duck[grp].gain, 1, t + MIX.duckHold, MIX.duckRelease);
    }
  }

  /** Stop at t: no new notes, close the filter, fade; tail=true lets the echo/reverb ring on. */
  fadeOut(t, dur, { tail = true, sweep = true } = {}) {
    this.endAt = Math.min(this.endAt, t);
    targetTo(this.out.gain, 0, t, dur / 4);
    this.out.gain.setValueAtTime(0, t + dur * 1.8);
    if (sweep) {
      holdAt(this.lp.frequency, t);
      this.lp.frequency.exponentialRampToValueAtTime(320, t + dur);
    }
    if (!tail) {
      for (const [verb, echo] of Object.values(this.sends)) {
        targetTo(verb.gain, 0, t, dur / 4);
        targetTo(echo.gain, 0, t, dur / 6);
      }
    } else {
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
    const { events } = barEvents(this.pal, this.id, arr, prev, n, this.state, { noDrums: n === 0 && this.entry === 'fade' });
    const t0 = this.barTime(n);
    // Slow timbral drift over ~23 bars so long beds breathe.
    const drift = 1 + 0.12 * Math.sin((2 * Math.PI * n) / 23);
    if (n > 0 && this.endAt === Infinity) this.lp.frequency.setTargetAtTime(arr.lp * drift, t0, 1.5);
    const jr = rng(hash(this.id, 'jitter', n));
    for (const e of events) {
      const drum = !e.midi;
      const jitter = (jr() - 0.5) * (drum ? 0.008 : 0.012);
      const t = Math.max(t0, t0 + swingAt(e.at, this.pal.swing) * this.spb + (e.strum || 0) + jitter);
      if (t >= this.endAt) continue;
      const dest = this.layer[e.layer];
      const dur = (e.dur || 0.25) * this.spb;
      switch (e.inst) {
        case 'kick': rig.kick(t, e.vel, dest); break;
        case 'snare': rig.snare(t, e.vel, dest, e.p); break;
        case 'hat': rig.hat(t, e.vel, dest, e.open); break;
        case 'shaker': rig.shaker(t, e.vel, dest); break;
        case 'rim': rig.rim(t, e.vel, dest); break;
        case 'tick': rig.tick(t, e.vel, dest, e.tok); break;
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
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch { /* ignore */ }
    }
    for (const l of Object.values(this.layer)) {
      try {
        l.disconnect();
      } catch { /* ignore */ }
    }
  }
}

export class LofiEngine {
  constructor(ctx, destination, { gravePad = false, seed = 24 } = {}) {
    this.ctx = ctx;
    this.rig = new Rig(ctx, { seed });
    this.rig.out.gain.value = MIX.output;
    this.rig.out.connect(destination);
    this.gravePad = gravePad;
    this.bed = null;
    this.beds = new Set();
    this.speaking = false;
    this.pocketBase = 0;
    this.timer = 0;
    this.log = []; // [{t, what}] for the lab page and tests
    // Stings: their own bus (not ducked), with reverb and a short echo.
    this.stingBus = ctx.createGain();
    this.stingBus.connect(this.rig.sum);
    const sv = ctx.createGain();
    sv.gain.value = 0.3;
    this.stingBus.connect(sv).connect(this.rig.reverbIn);
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
    this.bed = null;
  }

  // ------------------------------------------------------------------ cues

  /** cue('story', { programId, emotion, breaking, next, seconds }) at context time `at`. */
  cue(moment, opts = {}, at = this.ctx.currentTime) {
    const action = resolveCue(moment, opts, { gravePad: this.gravePad });
    this.pump(at + LOOKAHEAD);
    this.log.push({ t: at, moment, action: action.kind, detail: action.moment || action.name || '' });
    switch (action.kind) {
      case 'bed': return this.toBed(action.palette, action.moment, at);
      case 'gravePad': return this.toGravePad(action.palette, at);
      case 'sting': return this.sting(action, at);
      case 'ending': return this.ending(action.palette, at);
      default: return this.toSilence(at, action.fade ?? 0.8);
    }
  }

  toBed(id, moment, at) {
    const arr = arrangementFor(id, moment);
    const cur = this.bed;
    if (cur && cur.id === id && cur.endAt === Infinity) {
      if (cur.current.name === moment) return;
      const up = arr.energy > cur.current.energy;
      const req = Math.max(at, cur.dwellUntil || 0);
      const bar = cur.boundaryAfter(req);
      const tb = cur.barTime(bar);
      if (up) {
        // Lift on the bar line; a riser leads in when there is a beat to spare.
        if (tb - cur.spb >= at && arr.energy - cur.current.energy > 0.2) this.rig.riser(tb - cur.spb, cur.spb, 0.6, cur.layer.perc);
        cur.setArrangement(arr, bar, tb, cur.spb);
      } else {
        // Get out of the way on the next beat, over a beat and a half.
        const tbeat = cur.beatAfter(req);
        cur.setArrangement(arr, bar, tbeat, cur.spb * 1.5);
      }
      this.setPocket(arr.pocket, at);
      return;
    }
    let t0;
    let entry = arr.entry || 'fade';
    const pal = PALETTES[id];
    const spb = 60 / pal.bpm;
    if (cur && cur.endAt === Infinity) {
      let tb = cur.barTime(cur.boundaryAfter(at));
      if (tb - at > 1.6) tb = cur.beatAfter(at);
      cur.fadeOut(tb, cur.barSec * 0.75, { tail: true });
      t0 = tb;
      entry = 'xfade';
    } else {
      t0 = at + 0.06;
    }
    const bed = new Bed(this, id, t0, arr, { entry, speaking: this.speaking });
    if (arr.dwellBars) bed.dwellUntil = t0 + arr.dwellBars * bed.barSec;
    // The motif's pickup ("so-do") announces a new song in its own key.
    if (entry === 'xfade' && t0 - spb >= at) this.pickup(bed, t0);
    this.bed = bed;
    this.beds.add(bed);
    this.setPocket(arr.pocket, at);
    bed.schedule(at + LOOKAHEAD);
  }

  pickup(bed, t0) {
    // On the sting bus: the new bed's own output only opens on its downbeat.
    const pal = bed.pal;
    const scale = SCALES[pal.scale];
    const inst = pal.lead.inst === 'chip' ? 'chip' : pal.lead.inst === 'pluck' ? 'pluck' : 'bell';
    const tonic = pal.tonic + pal.lead.oct;
    const g = this.ctx.createGain();
    g.gain.value = this.speaking ? 0.12 : 0.5;
    g.connect(this.stingBus);
    this.rig[inst](t0 - bed.spb, degreeToMidi(tonic, scale, -3), bed.spb * 0.45, 0.6, g, {});
    this.rig[inst](t0 - bed.spb * 0.5, degreeToMidi(tonic, scale, 0), bed.spb * 0.45, 0.65, g, {});
  }

  toSilence(at, fade) {
    const cur = this.bed;
    if (cur) cur.fadeOut(at + 0.02, fade, { tail: fade > 1.2 ? false : true, sweep: true });
    this.bed = null;
  }

  /** Optional grave-story treatment: an almost inaudible low pad that fades away. */
  toGravePad(id, at) {
    this.toSilence(at, MIX.graveFade);
    const arr = arrangementFor(id, 'gravePad');
    const bed = new Bed(this, id, at + 0.06, arr, { entry: 'fade', speaking: this.speaking });
    bed.fadeOut(at + 2.5, arr.fadeOutSec, { tail: false, sweep: false });
    bed.endAt = at + 2.5 + arr.fadeOutSec;
    this.beds.add(bed);
    bed.schedule(at + LOOKAHEAD);
  }

  sting(action, at) {
    const cur = this.bed;
    let t = at + 0.05;
    if (action.stopBed && cur) {
      // Musical exit: on the next beat (but never wait long), the bed ducks out under the sting.
      const tb = action.hard ? at + 0.02 : Math.min(cur.beatAfter(at), at + 0.7);
      cur.fadeOut(tb, action.hard ? 0.15 : cur.spb, { tail: !action.hard });
      this.bed = null;
      t = action.hard ? at + 0.05 : tb;
    }
    const fn = STINGS[action.name];
    return fn ? fn(this, t, action) : t;
  }

  ending(id, at) {
    const cur = this.bed;
    let t = at + 0.05;
    if (cur) {
      t = Math.min(cur.beatAfter(at), at + 0.8);
      cur.fadeOut(t, 0.6, { tail: false, sweep: true });
      this.bed = null;
    }
    return STINGS.endcard(this, t, { palette: id });
  }

  // --------------------------------------------------------------- speech

  setSpeaking(on, at = this.ctx.currentTime) {
    on = Boolean(on);
    if (on === this.speaking) return;
    this.speaking = on;
    for (const bed of this.beds) bed.duckTo(on, at);
    const extra = on ? MIX.pocketSpeech : 0;
    if (on) targetTo(this.rig.pocket.gain, this.pocketBase + extra, at, MIX.duckAttack);
    else targetTo(this.rig.pocket.gain, this.pocketBase, at + MIX.duckHold, MIX.duckRelease);
  }

  setPocket(db, at) {
    this.pocketBase = db ?? 0;
    targetTo(this.rig.pocket.gain, this.pocketBase + (this.speaking ? MIX.pocketSpeech : 0), at, 0.3);
  }
}
