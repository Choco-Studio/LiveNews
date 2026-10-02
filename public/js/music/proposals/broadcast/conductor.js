// BroadcastMusic: the conductor of the "broadcast" proposal. The director
// calls cue(moment, { programId, emotion, feature }) at segment / shot changes
// and speech(on) when someone starts or stops talking. Each programme's cue
// POLICY (packages.js, from the style bibles) says what a moment gets: a bed,
// silence, "keep what is playing", a sting, an accent, a presence fade or an
// external cue. Silence is the default under main story copy.
//
// Moving between beds, the conductor waits for a musical boundary of the bed
// that is playing and uses one of five transitions:
//
//   xfade   bar-synced equal-power crossfade; the outgoing bed closes a
//           low-pass (18 kHz -> 300 Hz) and throws its last beat into the echo
//   lift    into headlines / round-up: the old bed ducks out in half a bar and
//           the new one lands on the downbeat
//   tail    into grave stories: 1.6 s filter-and-echo fade from the cue itself;
//           out of the headlines: a 0.3 s release on the cut
//   enter   from silence: pad first, bass on bar 2, rhythm on bar 3
//   sting   end card, bumpers, up-next, breaking: one-shot on the boundary
//           (breaking and the lead-ins don't wait: they cut in within 50 ms)
//
// Grave stories: silence, and the next segment gets no bed either (NEWS IN 60
// keeps a lone pad instead). Speech: a look-ahead duck (programme depth, -9 dB
// by default, 120 ms before the first syllable, held 0.9 s through pauses, 0.5 s
// release), a -8 dB "presence pocket" at 2.5 kHz, and GATES that silence the
// layers allowed only between voices (bells, pips, motif peeks).
// Works on any BaseAudioContext: live (start() runs a look-ahead pump) or
// offline (call pump(t) yourself; see render.js).

import { Synth, makeReverb } from './synth.js';
import { Bed, db } from './arranger.js';
import { bedDef, ruleFor, storyMoment, PROGRAMMES, CHANNEL_PKG, STING_MOMENTS, CHANNEL_BEDS } from './packages.js';
import { STINGS, graveDrone } from './stings.js';

const MAX_WAIT = 1.25; // never wait longer than this for a boundary (seconds)

// Loudness targets (integrated LUFS of a bed alone, unducked; the house voice
// is -16 LUFS, so -9 dB of duck puts a -26 bed 19 LU under it).
export const TARGET = {
  headlines: -26, intro: -27, roundup: -27, lighter: -28, chat: -27, number: -28, outro: -27, story: -28, standby: -27, underscore: -31,
  'news-60:story': -36, 'news-60:grave': -38, 'cosmos:lighter': -32, bumper: -16,
};

// Bed trims (dB) per 'programme:moment' so every bed lands on its target.
// Measured with the lab renders (ffmpeg ebur128) and fed back here.
export const TRIM = {
  'world-now:headlines': -6.2, 'world-now:roundup': -4.4, 'world-now:lighter': -5.3,
  'tech-bytes:headlines': -6.7, 'tech-bytes:chat': -6.6, 'tech-bytes:number': -7.8, 'tech-bytes:lighter': -7.6, 'tech-bytes:outro': -6.7,
  'world-now:underscore': 0, 'tech-bytes:underscore': 0,
  'cosmos:headlines': -7.7, 'cosmos:story': -8.7, 'cosmos:lighter': -12.5,
  'money-minute:intro': -1.6, 'money-minute:outro': 0.9, 'money-minute:number': -0.7, 'money-minute:drone': -12.4,
  'news-60:story': -13.4, 'news-60:grave': -14.2,
  'channel:standby': -7.4, 'channel:bumper': 3.8,
  // One-shots. In-programme stings peak (400 ms momentary) at least 6 LU under
  // the -16 LUFS voice; the channel's ident and lead-ins are -16 +/- 1 LUFS
  // integrated (channel-and-breaks.md), the promo about -18, the replay tag -26.
  sting: 0,
  'sting:world-now:signoff': -6, 'sting:pip': -1, 'sting:breaking': -10.5,
  'sting:tech-bytes:endcard': -13.5, 'sting:tech-bytes:number': -12.5, 'sting:tech-bytes:featureEnd': -12.5,
  'sting:money-minute:number': -2, 'sting:money-minute:endcard': -2, 'sting:money-minute:signoff': -2,
  'sting:bumperIn': 0.5, 'sting:countdown': 3, 'sting:bumperOut': 2, 'sting:upNext': -0.5, 'sting:replay': 8.5,
};

export class BroadcastMusic {
  /**
   * @param {object} o
   * @param {BaseAudioContext} o.context
   * @param {AudioNode} [o.destination]  defaults to context.destination
   * @param {number} [o.duckDb]          override the programmes' duck depth (0 when the host bus ducks)
   * @param {number} [o.pocketDb=-8]     extra cut at 2.5 kHz while someone speaks
   * @param {'silence'|'pad'} [o.grave]  what plays under grave stories
   * @param {'bible'|'soft'} [o.storyBeds] 'soft' gives neutral stories a felt-not-heard underscore
   */
  constructor({ context, destination, duckDb = null, pocketDb = -8, grave = 'silence', storyBeds = 'bible', seed = 7, lookahead = 1.6, solo = null, mute = null, trim = TRIM } = {}) {
    const c = context;
    this.ctx = c;
    this.synth = new Synth(c);
    this.duckDb = duckDb;
    this.pocketDb = pocketDb;
    this.graveMode = grave;
    this.storyBeds = storyBeds;
    this.seed = seed;
    this.lookahead = lookahead;
    this.solo = solo;
    this.mute = mute;
    this.trim = trim;
    this.programme = 'world-now';
    this.beds = [];
    this.current = null; // { bed, def } or null (silence)
    this.memory = new Map(); // bed id -> next phrase, so a bed resumes where it left off
    this.cooldown = 0; // segments left without a bed (after grave / breaking)
    this.lastPresenceIn = -Infinity;
    this.releaseAt = -1;
    this.talking = false;
    this.speechLog = []; // [time, on] of gate moves, so gates made later start in the right state
    this.lastSting = null;
    this.lastShot = null;
    this.timer = 0;

    this.mix = c.createGain();
    this.revIn = c.createGain();
    const reverb = makeReverb(c);
    const revOut = c.createGain();
    revOut.gain.value = 0.55;
    this.pocket = c.createBiquadFilter();
    this.pocket.type = 'peaking';
    this.pocket.frequency.value = 2500;
    this.pocket.Q.value = 0.8;
    this.pocket.gain.value = 0;
    this.duck = c.createGain();
    // Keep the very top airy but never fizzy, and the sub tidy.
    this.shelf = c.createBiquadFilter();
    this.shelf.type = 'highshelf';
    this.shelf.frequency.value = 6000;
    this.shelf.gain.value = -2;
    this.hp = c.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 32;
    // Beds are thinned at the bottom so they never fight the voice's chest
    // resonance or boom on small speakers.
    this.low = c.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 120;
    this.low.gain.value = -3;
    this.glue = c.createDynamicsCompressor();
    this.glue.threshold.value = -20;
    this.glue.knee.value = 12;
    this.glue.ratio.value = 2.5;
    this.glue.attack.value = 0.02;
    this.glue.release.value = 0.25;
    // Peak safety for the loud channel cues (bumper cards, ident at -16 LUFS);
    // beds at -26 LUFS never reach it.
    this.limit = c.createDynamicsCompressor();
    this.limit.threshold.value = -6;
    this.limit.knee.value = 3;
    this.limit.ratio.value = 20;
    this.limit.attack.value = 0.002;
    this.limit.release.value = 0.12;
    this.out = c.createGain();
    this.revIn.connect(reverb).connect(revOut).connect(this.pocket);
    this.mix.connect(this.pocket).connect(this.duck).connect(this.shelf).connect(this.low).connect(this.hp).connect(this.glue).connect(this.limit).connect(this.out);
    this.out.connect(destination || c.destination);
  }

  get now() {
    return this.ctx.currentTime;
  }

  get moment() {
    return this.current?.def?.moment ?? null;
  }

  // -------------------------------------------------------------- cue sheet

  /**
   * moment: openTail | headlines | frame | greeting | story | chat | lighter |
   *         roundup | item | number | picture | single | featureEnd | outro |
   *         signoff | endcard | standby | bumper | bumperIn | countdown |
   *         upNext | bumperOut | replay | breaking | ads | off
   * opts:   { programId, emotion, feature ('roundup'|'lighter'|'number'),
   *           tape ('up'|'down'|'mixed'|'neutral'), seconds, next, grave, at }
   * Returns what was done ({ bed, def } | { bed, len } | { external } | null).
   */
  cue(moment, opts = {}) {
    const at = Math.max(opts.at ?? this.now, this.now);
    if (opts.programId && PROGRAMMES[opts.programId]) this.programme = opts.programId;
    const pkg = PROGRAMMES[this.programme];

    if (moment === 'replay') return this.oneShot('replay', this.quantize(at, 0.5), CHANNEL_PKG, { exclusive: false });
    if (CHANNEL_BEDS.includes(moment)) return this.playBed(bedDef(this.programme, moment), moment, at);
    if (STING_MOMENTS.includes(moment) && !(moment === 'endcard' && pkg.policy.endcard)) return this.sting(moment, at, opts);
    if (moment === 'off' || moment === 'ads' || moment === 'silence') return this.toSilence(at, { fast: moment === 'ads' });

    const m = storyMoment(moment, opts);
    if (m === 'grave') {
      if (pkg.graveBed) return this.playBed(bedDef(this.programme, pkg.graveBed, opts), m, at, { cut: true });
      this.cooldown = 1;
      return this.toSilence(at, { grave: true });
    }
    return this.apply(ruleFor(this.programme, m, { storyBeds: this.storyBeds }), m, at, opts);
  }

  apply(rule, m, at, opts) {
    if (rule === 'keep') return this.current;
    if (rule == null) {
      this.cooldown = Math.max(0, this.cooldown - 1);
      return this.toSilence(at, {});
    }
    if (typeof rule === 'string') {
      if (this.cooldown > 0) {
        this.cooldown--;
        return this.toSilence(at, {});
      }
      return this.playBed(bedDef(this.programme, rule, opts), m, at);
    }
    if (rule.accent) {
      // An accent (headline pip, item tick) is cued by the director in a gap
      // between voices: the duck lifts at once instead of waiting out its
      // hold, so the gap breathes (the bed rises about 9 dB, to -10 LU under
      // the voice, as world-now.md allows) and the pip is heard. A montage
      // frame also moves the headline harmony on (Bm -> G -> D).
      const cur = this.current;
      this.gap(at);
      if (cur?.def.frames) cur.bed.frame(cur.bed.frameIdx + 1, at + 0.02);
      return this.oneShot(rule.accent, this.quantize(at, 0.5), PROGRAMMES[this.programme], { exclusive: false });
    }
    if (rule.presence) return this.presence(rule.presence, at, opts);
    if (rule.external) {
      this.toSilence(at, {});
      return { external: rule.external };
    }
    if (rule.sting) {
      const shot = this.sting(rule.sting, at, opts, { overlay: rule.overlay || (m === 'signoff' && this.current) });
      if (rule.then && shot) {
        if (this.cooldown > 0) this.cooldown--;
        else this.startBed(bedDef(this.programme, rule.then, opts), shot.t + shot.len * 0.8, 'soft', 1.2, { cued: rule.then });
      }
      return shot;
    }
    return null;
  }

  barOf(def) {
    return (60 / def.bpm) * 4;
  }

  playBed(def, cued, at, { cut = false } = {}) {
    if (!def) return this.toSilence(at, {});
    const cur = this.current;
    if (cur && cur.def.id === def.id) {
      if (cued === 'story' || cued === 'light') cur.bed.jumpAt = this.boundary(cur.bed, at); // new story: turn the page
      return cur;
    }
    if (cued === 'openTail') {
      // The open's cut IS the downbeat: no waiting, the tail catches its chord.
      if (cur) this.fadeOut(cur.bed, at, 0.25, { echo: false });
      return this.startBed(def, at, 'fromOpen', 0, { cued: 'headlines' });
    }
    if (def.presence) {
      // Runs through the segment at zero; picture shots fade it in.
      if (cur) this.fadeOut(cur.bed, at, 0.6, { echo: true });
      return this.startBed(def, at, 'cut', 0, { cued, muted: true });
    }
    if (!cur) return this.startBed(def, at + 0.05, 'soft', this.barOf(def) * 1.2, { sweepIn: true, cued });
    if (cut) {
      this.fadeOut(cur.bed, at, 0.4, { echo: false });
      return this.startBed(def, at, 'cut', 0.4, { cued });
    }
    const b = this.boundary(cur.bed, at);
    if (def.moment === 'headlines' || def.moment === 'roundup') {
      this.fadeOut(cur.bed, b, cur.bed.barSec * 0.5, { echo: true });
      return this.startBed(def, b, 'cut', 0.02, { cued });
    }
    this.fadeOut(cur.bed, b, cur.bed.barSec, { echo: true });
    return this.startBed(def, b, 'xfade', cur.bed.barSec, { sweepIn: true, cued });
  }

  startBed(def, origin, entry, fadeIn, { sweepIn = false, cued = def.moment, muted = false } = {}) {
    const phrase = this.memory.get(def.id) ?? 0;
    const trim = this.trim[`${def.programme}:${cued}`] ?? this.trim[`${def.programme}:${def.moment}`] ?? 0;
    const bed = new Bed(this, def, { origin, entry, phrase, seed: this.seed, trim });
    if (muted || fadeIn > 0.03) {
      bed.faderLevel = { t: origin, dur: 0, from: 0, to: 0 };
      bed.fader.gain.setValueAtTime(0, origin);
      bed.wetFader.gain.setValueAtTime(0, origin);
      bed.dlyIn.gain.setValueAtTime(0, origin);
      if (!muted) {
        bed.fade(origin, fadeIn, 1);
        if (sweepIn) bed.sweep(origin, fadeIn, 450, 18000);
      }
    }
    this.beds.push(bed);
    this.current = { bed, def };
    return this.current;
  }

  fadeOut(bed, t, dur, { echo = true } = {}) {
    if (bed.stopAt < Infinity) return;
    bed.fade(t, dur, 0);
    bed.sweep(t, dur, 18000, 300);
    if (echo) bed.echoOutAt(t);
    bed.releaseHeld(t + dur * 0.5);
    bed.stopAt = t + dur;
    bed.endAt = t + dur + 4.5;
    if (bed.def.moment) this.memory.set(bed.def.id, Math.floor((bed.logicalBar + 7) / 8));
    if (this.current?.bed === bed) this.current = null;
  }

  // Grave stories: the bed bows out at once (1.6 s, last beat thrown into the
  // echo) so it is gone within the presenter's first words. Out of the
  // headlines: a 0.3 s release on the cut. Other silences wait for the next
  // boundary (at most 0.6 s) and take three quarters of a bar.
  toSilence(at, { grave = false, fast = false } = {}) {
    const cur = this.current;
    if (cur) {
      if (grave) this.fadeOut(cur.bed, at, 1.6, { echo: true });
      else if (fast || cur.def.moment === 'headlines') this.fadeOut(cur.bed, at, 0.3, { echo: false });
      else this.fadeOut(cur.bed, Math.min(this.boundary(cur.bed, at), at + 0.6), cur.bed.barSec * 0.75, { echo: true });
    }
    if (grave && this.graveMode === 'pad') this.oneShot('drone', at + 0.4, PROGRAMMES[this.programme], { exclusive: false });
    this.current = null;
    return null;
  }

  // COSMOS: the bed runs through a segment and only its bus fades: in over
  // 1.0 s on a picture / map shot, out over 1.5 s on the cut away. No fade-in
  // for shots under 6 s, and at most one fade-in per 10 s, so it never pumps.
  presence(dir, at, opts = {}) {
    const cur = this.current;
    if (!cur || !cur.def.presence) return cur;
    if (dir === 'in') {
      if ((opts.seconds ?? Infinity) < 6 || at - this.lastPresenceIn < 10) return cur;
      this.lastPresenceIn = at;
      cur.bed.fade(at, 1.0, 1);
    } else {
      cur.bed.fade(at, 1.5, 0);
    }
    return cur;
  }

  sting(kind, at, opts = {}, { overlay = false } = {}) {
    const cur = this.current;
    const prog = PROGRAMMES[this.programme];
    const pkg = kind === 'upNext' ? PROGRAMMES[opts.next || opts.programId] || prog
      : kind === 'bumperIn' || kind === 'bumperOut' || kind === 'countdown' ? CHANNEL_PKG
        : prog;
    if (overlay) {
      // Over the bed that is playing (a sign-off fragment, a feature button).
      return this.oneShot(kind, this.quantize(at, 0.5), pkg, { exclusive: false, gate: true, opts });
    }
    // Breaking and the lead-ins cut in at once; the rest waits for the downbeat.
    const urgent = ['breaking', 'bumperIn', 'upNext', 'countdown', 'number'].includes(kind);
    let t = urgent || !cur ? at + 0.05 : Math.min(this.boundary(cur.bed, at), at + MAX_WAIT);
    if (cur) this.fadeOut(cur.bed, urgent ? at : t, urgent ? 0.35 : 0.3, { echo: !urgent });
    if (urgent && cur) t = at + 0.12;
    this.current = null;
    if (kind === 'breaking') this.cooldown = 1;
    if (kind === 'upNext') {
      // The next programme's own bed for four seconds, under its motif.
      const rule = ruleFor(pkg.id, 'headlines');
      const def = typeof rule === 'string' ? bedDef(pkg.id, rule) : null;
      if (def) {
        const run = this.startBed(def, t, 'cut', 0.15, { cued: 'headlines' });
        this.fadeOut(run.bed, t + 3.5, 0.7, { echo: true });
        this.current = null;
      }
    }
    return this.oneShot(kind, t, pkg, { exclusive: true, opts });
  }

  oneShot(kind, t, pkg, { exclusive = true, gate = false, opts = {} } = {}) {
    // The same one-shot twice within 3 s (NEWS IN 60's sign-off bell, then the
    // end card asking for it again) plays once.
    const key = `${pkg.id}:${kind}`;
    if (exclusive || gate) {
      if (this.lastShot && this.lastShot.key === key && t - this.lastShot.t < 3) return null;
      this.lastShot = { key, t };
    }
    const def = { id: `${pkg.id}:${kind}`, programme: pkg.id, moment: null, pkg, bpm: pkg.bpm, tonic: pkg.tonic, mode: pkg.mode, hr: 1, swing: 0, progs: { A: [pkg.home] }, form: 'A', layers: [], delay: 0.75 };
    const trim = (this.trim[`sting:${pkg.id}:${kind}`] ?? this.trim[`sting:${kind}`] ?? this.trim.sting ?? 0);
    const bed = new Bed(this, def, { origin: t, entry: 'cut', seed: this.seed, trim });
    bed.gated = gate;
    const fn = kind === 'drone' ? graveDrone : STINGS[kind];
    if (!fn) return null;
    const len = fn(bed, t, pkg, opts);
    bed.stopAt = t;
    bed.endAt = t + len + 4.5;
    this.beds.push(bed);
    if (exclusive) {
      // A new sting takes over from a previous one still ringing (end card tail into the break bumper).
      const prev = this.lastSting;
      if (prev && prev.endAt > t && prev !== bed) {
        const at = Math.max(this.now, t - 0.05);
        prev.fade(at, 0.4, 0);
        const eg = prev.echoOut.gain;
        eg.cancelScheduledValues(at);
        eg.setValueAtTime(eg.value, at);
        eg.linearRampToValueAtTime(0, at + 0.4);
        prev.endAt = Math.min(prev.endAt, t + 1);
      }
      this.lastSting = bed;
      this.current = null;
    }
    return { bed, def, len, t };
  }

  // Next musical boundary of a bed after `at`: the bar line if it is close,
  // else the half bar, else the next beat (speech must not wait for music).
  boundary(bed, at) {
    const rel = at + 0.04 - bed.origin;
    for (const unit of [bed.barSec, bed.barSec / 2, bed.spb]) {
      const b = bed.origin + Math.ceil(rel / unit) * unit;
      if (b - at <= MAX_WAIT) return b;
    }
    return at + 0.05;
  }

  quantize(at, beats) {
    const bed = this.current?.bed;
    if (!bed) return at + 0.03;
    const unit = bed.spb * beats;
    return bed.origin + Math.ceil((at + 0.03 - bed.origin) / unit) * unit;
  }

  // ----------------------------------------------------------------- speech

  duckDepth() {
    return this.duckDb ?? PROGRAMMES[this.programme]?.duckDb ?? -9;
  }

  /** Someone starts (on) or stops talking at context time `at`. Cheap to poll. */
  speech(on, at = this.now) {
    if (Boolean(on) === this.talking) return;
    this.talking = Boolean(on);
    const g = this.duck.gain;
    const p = this.pocket.gain;
    if (on) {
      const t = Math.max(this.now, at - 0.12); // look-ahead: ducked before the first syllable
      if (this.releaseAt >= t) {
        g.cancelScheduledValues(t);
        p.cancelScheduledValues(t);
      }
      g.setTargetAtTime(db(this.duckDepth()), t, 0.045);
      p.setTargetAtTime(this.pocketDb, t, 0.06);
      for (const bed of this.beds) bed.setGate(true, t);
      this.logSpeech(t, true);
      this.releaseAt = -1;
    } else {
      // Hold through the breaths between sentences (0.9 s), then bloom slowly:
      // the bed only comes up in a real gap, and never pumps.
      const t = Math.max(this.now, at + 0.9);
      g.setTargetAtTime(1, t, 0.5);
      p.setTargetAtTime(0, t, 0.5);
      for (const bed of this.beds) bed.setGate(false, t);
      this.logSpeech(t, false);
      this.releaseAt = t;
    }
  }

  /**
   * A known gap between voices (the director cues an accent there): if nobody
   * is talking, release the duck and open the gates now (0.15 s time constant)
   * instead of after the 0.9 s hold. The next speech(true) ducks again with
   * its usual look-ahead.
   */
  gap(at = this.now) {
    if (this.talking) return;
    const t = Math.max(this.now, at);
    if (this.releaseAt <= t) return; // already released
    for (const p of [this.duck.gain, this.pocket.gain]) p.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(1, t, 0.15);
    this.pocket.gain.setTargetAtTime(0, t, 0.15);
    for (const bed of this.beds) bed.setGate(false, t);
    // Rewrite the pending release in the log so gates made later agree.
    for (let k = this.speechLog.length - 1; k >= 0; k--) {
      if (!this.speechLog[k][1] && this.speechLog[k][0] > t) this.speechLog[k][0] = t;
    }
    this.releaseAt = t;
  }

  logSpeech(t, on) {
    this.speechLog.push([t, on]);
    if (this.speechLog.length > 64) this.speechLog.splice(0, this.speechLog.length - 64);
  }

  /** Puts a new gate in the state speech dictates at `from`, plus every later move. */
  primeGate(param, from) {
    let open = 1;
    for (const [t, on] of this.speechLog) {
      if (t <= from) open = on ? 0 : 1;
      else param.setTargetAtTime(on ? 0 : 1, t, on ? 0.03 : 0.25);
    }
    param.setValueAtTime(open, Math.max(0, from - 0.001));
  }

  // ------------------------------------------------------------- scheduling

  pump(until = this.now + this.lookahead) {
    for (const bed of this.beds) bed.pump(until);
    const now = this.now;
    this.beds = this.beds.filter((bed) => {
      if (bed.endAt > now) return true;
      bed.dispose();
      return false;
    });
  }

  /** Live mode: keep the beds scheduled ahead of the clock. */
  start() {
    if (this.timer) return;
    const tick = () => {
      try {
        this.pump();
      } catch (err) {
        console.warn('[music] pump failed', err);
      }
    };
    tick();
    this.timer = setInterval(tick, 200);
  }

  stop(fade = 1) {
    const t = this.now;
    for (const bed of this.beds) if (bed.stopAt === Infinity) this.fadeOut(bed, t, fade, { echo: false });
    this.current = null;
  }

  dispose() {
    clearInterval(this.timer);
    this.timer = 0;
    for (const bed of this.beds) bed.dispose();
    this.beds = [];
    try {
      this.out.disconnect();
    } catch { /* ignore */ }
  }
}
