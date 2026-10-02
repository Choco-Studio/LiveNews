// BroadcastMusic: the conductor of the "broadcast" proposal. The director
// calls cue(moment, { programId, emotion }) at segment / shot changes and
// speech(on) when someone starts or stops talking; the conductor decides the
// bed, waits for a musical boundary of the bed that is playing, and moves
// between beds with one of five transitions:
//
//   xfade   bar-synced equal-power crossfade; the outgoing bed closes a
//           low-pass (18 kHz -> 300 Hz) and throws its last beat into the echo
//   lift    into headlines / round-up: the old bed ducks out in half a bar and
//           the new one lands on the downbeat with a timpani "do"
//   tail    into grave stories / silence: one bar of filter-and-echo fade
//   enter   from silence: pad first, bass on bar 2, rhythm on bar 3
//   sting   end card, bumpers, up-next, breaking: one-shot on the boundary
//           (breaking and bumper-in don't wait: they cut in within 50 ms)
//
// Speech: a look-ahead duck (-9 dB, 120 ms before the first syllable, held
// through pauses, 0.4 s release) plus a -6 dB "presence pocket" at 2.5 kHz,
// so the bed gets out of the way of consonants rather than just getting quieter.
// Works on any BaseAudioContext: live (start() runs a look-ahead pump) or
// offline (call pump(t) yourself; see render.js).

import { Synth, makeReverb } from './synth.js';
import { Bed, db, timpDo } from './arranger.js';
import { bedDef, storyColour, PROGRAMMES, CHANNEL_PKG, STING_MOMENTS } from './packages.js';
import { STINGS, graveDrone } from './stings.js';

const MAX_WAIT = 1.25; // never wait longer than this for a boundary (seconds)

// Bed trims (dB) so every moment lands on its loudness target (see DESIGN.md:
// headlines -26, story -30, chat -28, round-up -27, outro -26, standby -27
// LUFS, unducked). Measured with tools/render-audio.mjs and fed back here.
export const TRIM = {
  headlines: 0,
  story: 0,
  chat: 0,
  roundup: 0,
  outro: 0,
  standby: 0,
  sting: 0,
};

export class BroadcastMusic {
  /**
   * @param {object} o
   * @param {BaseAudioContext} o.context
   * @param {AudioNode} [o.destination]  defaults to context.destination
   * @param {number} [o.duckDb=-9]       bed level while someone speaks
   * @param {number} [o.pocketDb=-6]     extra cut at 2.5 kHz while someone speaks
   * @param {'silence'|'pad'} [o.grave]  what plays under grave stories
   */
  constructor({ context, destination, duckDb = -9, pocketDb = -6, grave = 'silence', seed = 7, lookahead = 1.6, solo = null, mute = null, trim = TRIM } = {}) {
    const c = context;
    this.ctx = c;
    this.synth = new Synth(c);
    this.duckDb = duckDb;
    this.pocketDb = pocketDb;
    this.graveMode = grave;
    this.seed = seed;
    this.lookahead = lookahead;
    this.solo = solo;
    this.mute = mute;
    this.trim = trim;
    this.programme = 'world-now';
    this.beds = [];
    this.current = null; // { bed, def } or null (silence)
    this.memory = new Map(); // bed id -> next phrase, so a bed resumes where it left off
    this.items = 0;
    this.frames = 0;
    this.releaseAt = -1;
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
    this.glue = c.createDynamicsCompressor();
    this.glue.threshold.value = -20;
    this.glue.knee.value = 12;
    this.glue.ratio.value = 2.5;
    this.glue.attack.value = 0.02;
    this.glue.release.value = 0.25;
    this.out = c.createGain();
    this.revIn.connect(reverb).connect(revOut).connect(this.pocket);
    this.mix.connect(this.pocket).connect(this.duck).connect(this.shelf).connect(this.hp).connect(this.glue).connect(this.out);
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
   * moment: openTail | headlines | story | grave | chat | roundup | outro |
   *         endcard | standby | bumperIn | bumperOut | upNext | replay |
   *         breaking | frame | item | off
   * opts:   { programId, emotion, at (context time), next (programme id for upNext) }
   */
  cue(moment, opts = {}) {
    const at = Math.max(opts.at ?? this.now, this.now);
    if (opts.programId && PROGRAMMES[opts.programId]) this.programme = opts.programId;
    const pkg = PROGRAMMES[this.programme];

    if (moment === 'frame' || moment === 'item') return this.accent(moment, at);
    if (moment === 'replay') return this.oneShot('replay', this.quantize(at, 0.5), CHANNEL_PKG, false);
    if (STING_MOMENTS.includes(moment)) return this.sting(moment, at, opts);

    const grave = moment === 'grave' || (moment === 'story' && storyColour(opts.emotion) === 'grave');
    if (grave || moment === 'off' || moment === 'ads' || moment === 'silence') return this.toSilence(at, grave ? pkg : null);

    const def = bedDef(this.programme, moment, opts);
    if (!def) return this.toSilence(at, null);
    const cur = this.current;
    if (cur && cur.def.id === def.id) {
      if (moment === 'story') cur.bed.jumpAt = this.boundary(cur.bed, at); // new story: turn the page
      return cur;
    }
    if (moment === 'openTail') {
      // The open's cut IS the downbeat: no waiting, the tail catches its chord.
      if (cur) this.fadeOut(cur.bed, at, 0.25, { echo: false });
      return this.startBed(def, at, 'fromOpen', 0);
    }
    if (!cur) return this.startBed(def, at + 0.05, 'soft', this.barOf(def) * 1.2, { sweepIn: true });

    const b = this.boundary(cur.bed, at);
    if (moment === 'headlines' || moment === 'roundup') {
      this.fadeOut(cur.bed, b, cur.bed.barSec * 0.5, { echo: true });
      const next = this.startBed(def, b, 'cut', 0.02);
      this.synth.timp(next.bed.fx, b, timpDo(def.tonic), 0.6);
      return next;
    }
    this.fadeOut(cur.bed, b, cur.bed.barSec, { echo: true });
    return this.startBed(def, b, 'xfade', cur.bed.barSec, { sweepIn: true });
  }

  barOf(def) {
    return (60 / def.bpm) * 4;
  }

  startBed(def, origin, entry, fadeIn, { sweepIn = false } = {}) {
    const phrase = this.memory.get(def.id) ?? 0;
    const trim = (this.trim[def.moment] ?? 0) + (def.colour === 'light' ? 0.5 : 0);
    const bed = new Bed(this, def, { origin, entry, phrase, seed: this.seed, trim });
    if (fadeIn > 0.03) {
      bed.faderLevel = { t: origin, dur: 0, from: 0, to: 0 };
      bed.fader.gain.setValueAtTime(0, origin);
      bed.wetFader.gain.setValueAtTime(0, origin);
      bed.fade(origin, fadeIn, 1);
      if (sweepIn) bed.sweep(origin, fadeIn, 450, 18000);
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
    bed.stopAt = t + dur;
    bed.endAt = t + dur + 4.5;
    if (bed.def.moment) this.memory.set(bed.def.id, Math.floor((bed.logicalBar + 7) / 8));
    if (this.current?.bed === bed) this.current = null;
  }

  toSilence(at, gravePkg) {
    const cur = this.current;
    if (cur) {
      const b = Math.min(this.boundary(cur.bed, at), at + 0.6);
      this.fadeOut(cur.bed, b, cur.bed.barSec * (gravePkg ? 1 : 0.75), { echo: true });
    }
    if (gravePkg && this.graveMode === 'pad') this.oneShot('drone', at + 0.4, gravePkg, false);
    this.current = null;
    return null;
  }

  sting(moment, at, opts) {
    const cur = this.current;
    const pkg = moment === 'upNext' ? PROGRAMMES[opts.next || opts.programId] || PROGRAMMES[this.programme]
      : moment === 'bumperIn' || moment === 'bumperOut' ? CHANNEL_PKG
        : PROGRAMMES[this.programme];
    // Breaking and bumpers cut in at once; the end card waits for the downbeat.
    const urgent = moment === 'breaking' || moment === 'bumperIn' || moment === 'upNext';
    let t = urgent || !cur ? at + 0.05 : Math.min(this.boundary(cur.bed, at), at + MAX_WAIT);
    if (cur) this.fadeOut(cur.bed, urgent ? at : t, urgent ? 0.35 : 0.3, { echo: !urgent });
    if (urgent && cur) t = at + 0.12;
    this.current = null;
    return this.oneShot(moment, t, pkg, true);
  }

  oneShot(kind, t, pkg, exclusive) {
    const def = { id: `${pkg.id}:${kind}`, programme: pkg.id, moment: null, pkg, bpm: pkg.bpm, tonic: pkg.tonic, mode: pkg.mode, hr: 1, swing: 0, progs: { A: [pkg.home] }, form: 'A', layers: [], delay: 0.75 };
    const bed = new Bed(this, def, { origin: t, entry: 'cut', seed: this.seed, trim: this.trim.sting ?? 0 });
    const fn = kind === 'drone' ? graveDrone : STINGS[kind];
    const n = kind === 'item' ? this.items++ : kind === 'frame' ? this.frames++ : 0;
    const len = fn(bed, t, pkg, n);
    bed.stopAt = t;
    bed.endAt = t + len + 4.5;
    this.beds.push(bed);
    if (exclusive) this.current = null;
    return { bed, def, len };
  }

  /** Montage frame / round-up item: a light hit on the next 8th of the bed. */
  accent(kind, at) {
    const pkg = PROGRAMMES[this.programme];
    const t = this.quantize(at, 0.5);
    return this.oneShot(kind, t, pkg, false);
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

  /** Someone starts (on) or stops talking at context time `at`. */
  speech(on, at = this.now) {
    const g = this.duck.gain;
    const p = this.pocket.gain;
    if (on) {
      const t = Math.max(this.now, at - 0.12); // look-ahead: ducked before the first syllable
      if (this.releaseAt >= t) {
        g.cancelScheduledValues(t);
        p.cancelScheduledValues(t);
      }
      g.setTargetAtTime(db(this.duckDb), t, 0.045);
      p.setTargetAtTime(this.pocketDb, t, 0.06);
      this.releaseAt = -1;
    } else {
      const t = Math.max(this.now, at + 0.3); // hold through the breath between sentences
      g.setTargetAtTime(1, t, 0.4);
      p.setTargetAtTime(0, t, 0.4);
      this.releaseAt = t;
    }
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
