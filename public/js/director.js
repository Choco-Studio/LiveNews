// The gallery director: plays what master control sends (programme episodes
// and commercial breaks), calls the camera shots, graphics and subtitles,
// and keeps the channel running forever.
import { pixelate, loadImage } from './pixelate.js';
import { presenterName, setPresenters } from './cast.js';
import { STINGER_DURATION } from './scenes/cards.js';
import { pickAds, BREAK_BLACK } from './ads/index.js';
import { splitSentences } from './audio/sentences.js';
import { ACTIONS } from './cues.js';
import { openFor } from './scenes/opens.js';
import { VoicePlayer } from './voice/player.js';
import { paceFor, gapAfter, CHANNEL, paceTrace, cutWait, isRepeat } from './pace.js';

const now = () => performance.now() / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => setTimeout(r, 0));

const SMALL = { w: 104, h: 62 }; // studio video wall / over-the-shoulder box
const FULL = { w: 416, h: 234 }; // full screen with room for a slow pan
// Every on-air timing (shot holds, pauses between segments, card holds) comes from the
// programme's pace profile (pace.js: one table for the whole channel, owner 23:10).
const pace = (scene) => paceFor(scene.program?.id);
const STUDIO = new Set(['wide', 'close']);
// A segment's air before its voice runs (characters per second, sentence pauses included): the engine's
// estimated timeline speaks ~15 chars/s; a recorded clip gives its own length.
const CPS_EST = 14.5;
// The greeting ends an intro's headlines (the v2 planner's rule, direction/shots.js GREETING_RE).
const GREETING = /^(good (morning|afternoon|evening)|hello|welcome|this is|i'm|i am|and i'm)\b|\bwelcome to\b/i;

/** Leading intro sentences that tease a story (seg.teases, editorial; else the ones before the greeting). */
function teaserLines(seg, lines) {
  const teases = Array.isArray(seg.teases) ? seg.teases : null;
  let n = 0;
  while (n < lines.length && !GREETING.test(lines[n].trim()) && !(teases && !teases[n])) n++;
  return n === lines.length ? Math.max(0, n - 1) : n; // no greeting found: the last line is it
}

/** Seconds a segment should air, before its voice runs (recorded length, else its characters). */
const estimateSeg = (seg) => (Number.isFinite(seg?.audio?.duration) ? seg.audio.duration : String(seg?.text || '').length / CPS_EST);

export class Director {
  constructor({ audio, channel, v2 = false }) {
    this.audio = audio;
    this.channel = channel;
    setPresenters(channel.presenters);
    this.images = new Map(); // storyId -> { small, full, card }
    this.recentAds = [];
    this.voices = new VoicePlayer({ audio }); // recorded neural voices from the server (voice/player.js)
    this.scene = {
      channel: { name: channel.name, slogan: channel.slogan },
      program: null,
      cast: {},
      shot: 'start',
      shotSince: now(),
      focus: 'A',
      storyId: null,
      wall: { mode: 'logo' },
      anchors: {},
      actions: {}, // slot -> { name, t0, dur } animation currently playing
      lowerThird: null,
      subtitle: null,
      subtitles: true,
      ticker: [],
      rundown: [],
      images: this.images,
      replay: false,
      breaking: null,
      card: null,
      stinger: null,
      panDir: 1,
    };
    // Wave 2 (?v2=1): live direction for the v2 Stage (segment plans, speech clock, v2 shot
    // cues; v2/canvas25d/runtime/direction.js). Loaded only when asked: with this.v2 null
    // every method below behaves exactly as before.
    this.v2 = null;
    if (v2) this.v2ready = import('./v2/canvas25d/runtime/direction.js').then((m) => (this.v2 = new m.LiveDirection({ director: this, channel, audio })), (err) => console.warn('[director] v2 direction unavailable', err));
  }

  setShot(shot, extra = {}) {
    const s = this.scene;
    // Every ad and every montage frame is a new clip even when the shot name
    // repeats, so its clock must restart (or it opens mid-way, at its end slate).
    const restart = shot === 'ad' || shot === 'montage';
    const changed = restart || s.shot !== shot || (extra.focus && extra.focus !== s.focus) || ('storyId' in extra && extra.storyId !== s.storyId) || (this.v2 && 'framing' in extra && (extra.framing ?? null) !== (s.framing ?? null)); // v2: a new framing (single → ots) is a cut
    Object.assign(s, extra);
    if (changed) {
      this.mapRun = shot === 'map' ? (this.mapRun || 0) + 1 : 0; // PACE: map cuts in a row (shots.mapRun)
      if (!(shot === 'wide' && s.shot === 'wide')) this.seenSince = now(); // PACE: a focus re-set of the wide is no visible cut
      s.shot = shot;
      s.shotSince = now();
      if (shot === 'full') s.panDir = Math.random() < 0.5 ? 1 : -1;
      if (this.v2 && !('framing' in extra)) s.framing = s.cameraMove = null; // v2: a framing belongs to the cue that set it
    }
  }

  /**
   * Transition with the channel stinger; the shot changes under it. `cue(cutMs)`
   * starts the new shot's music now, scheduled to be heard on the cut
   * (performance.now() ms), so its first beat is not lost to output latency.
   */
  async stinger(change, cue = null) {
    this.scene.stinger = { start: now() };
    this.audio.sfx('whoosh', { startAt: this.scene.stinger.start * 1000 }); // its felt thump lands on the cut
    const cut = this.scene.stinger.start + STINGER_DURATION / 2;
    try {
      cue?.(cut * 1000);
    } catch (err) {
      console.warn('[director] cue', err);
    }
    await sleep(STINGER_DURATION * 500);
    change();
    // The new shot's clock starts on the planned cut, where its music was scheduled (a late timer must not leave the picture behind it).
    if (this.scene.shotSince > cut) this.scene.shotSince = cut;
    await sleep(STINGER_DURATION * 500);
  }

  breaking(item) {
    this.scene.breaking = { ...item, since: now() };
    this.audio.sfx('breaking', { programId: this.scene.program?.id });
  }

  skip() {
    this.audio.stop();
  }

  async run() {
    if (this.v2ready) await this.v2ready; // v2: the first episode is planned too (no race with the import)
    let lastId = null;
    for (;;) {
      let item = null;
      try {
        const res = await fetch(`/api/next${lastId ? `?after=${encodeURIComponent(lastId)}` : ''}`);
        if (res.status === 200) item = await res.json();
      } catch {
        /* master control unreachable: stand by */
      }
      if (!item) {
        this.setShot('standby', { lowerThird: null, subtitle: null, card: null });
        await sleep(CHANNEL.standby.retry * 1000);
        continue;
      }
      lastId = item.id;
      try {
        if (item.kind === 'break') await this.playBreak(item);
        else await this.playEpisode(item);
      } catch (err) {
        console.error('[director]', err);
        await sleep(CHANNEL.standby.afterError * 1000);
      }
    }
  }

  // --- commercial breaks ---------------------------------------------------

  async playBreak(item) {
    const s = this.scene;
    this.voices.refreshAds(); // advert voice-overs (fetched while the ident runs)
    s.lowerThird = null;
    s.subtitle = null;
    const ads = pickAds(item.ads || 1, this.recentAds);
    this.prewarm(ads, item.filler ? 0 : 1.2); // baked while the ident holds still, not on the spot's first frames
    if (!item.filler) {
      // Cues are scheduled at the stinger's start to be heard on the shot change they belong to.
      await this.stinger(() => this.setShot('ident', { card: null }), (cut) => this.audio.sfx('jingle', { startAt: cut }));
      await sleep(CHANNEL.breaks.ident * 1000 - STINGER_DURATION * 500);
    }
    for (const ad of ads) {
      // Play history; pickAds() prefers unseen ads, then the least recently played.
      this.recentAds = [...this.recentAds, ad.id].slice(-24);
      // The music bed starts on the cut with the picture (its first chord included).
      let bed = null;
      try {
        await this.blackCut('ad', { card: { ad, line: -1 } }, (cut) => (bed = this.audio.playTune?.(ad.tune, { loop: true, volume: 0.45, startAt: cut })));
        await this.playAd(ad, bed);
      } finally {
        bed?.stop?.();
      }
    }
    if (item.next) {
      const card = {
        next: item.next,
        label: item.next.ready ? 'UP NEXT' : 'COMING UP',
        footer: item.next.ready ? 'AFTER THE BREAK' : 'STAY WITH US',
      };
      await this.blackCut('promo', { card }, (cut) => this.audio.sfx('promo', { programId: item.next.id, startAt: cut })); // the signature left hanging in the next programme's key
      await sleep(CHANNEL.breaks.promo * 1000);
    }
  }

  /**
   * Bake the picked spots' static art in idle time before they air (each ad's
   * optional warm(): one pass per idle slot, true when done), so the first
   * frames of a spot never stall on a bake. Browser only; errors are logged.
   */
  prewarm(ads, delay = 0) {
    if (typeof document === 'undefined') return;
    const list = ads.filter((ad) => typeof ad.warm === 'function');
    if (!list.length) return;
    const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 400 }) : (fn) => setTimeout(fn, 30);
    let i = 0;
    const step = () => {
      try {
        while (i < list.length && list[i].warm()) i++;
      } catch (err) {
        console.warn('[director] prewarm', err);
        return;
      }
      if (i < list.length) idle(step);
    };
    setTimeout(() => idle(step), delay * 1000);
  }

  /**
   * Inside a break: 0.3 s of black and silence, then a hard cut to `shot`
   * (channel-and-breaks §3.2/§4.2: no stinger between break elements, so no
   * network logo between two commercials). `cue(cutMs)` schedules the next
   * element's sound to be heard on the cut; the picture clock is pinned to the
   * same instant, so a late timer never leaves the picture behind its bed.
   */
  async blackCut(shot, extra, cue = null) {
    this.setShot('ad', { card: { ad: BREAK_BLACK, line: -1 } });
    const cut = now() + BREAK_BLACK.duration;
    try {
      cue?.(cut * 1000);
    } catch (err) {
      console.warn('[director] cue', err);
    }
    await sleep(BREAK_BLACK.duration * 1000);
    this.setShot(shot, extra);
    this.scene.shotSince = Math.min(this.scene.shotSince, cut);
  }

  async playAd(ad, bed = null) {
    const s = this.scene;
    // The ad's picture clock started at the cut out of the black (blackCut pins
    // shotSince to it): voice-over lines and the bed follow that clock, not this call.
    const started = s.shot === 'ad' && Number.isFinite(s.shotSince) ? s.shotSince : now();
    this.audio.setVoices?.({ ad: ad.voice });
    this.voices.prepareAd(ad);
    const tune = bed ?? this.audio.playTune?.(ad.tune, { loop: true, volume: 0.45, startAt: started * 1000 });
    try {
      for (let i = 0; i < ad.script.length; i++) {
        const line = ad.script[i];
        const wait = line.at - (now() - started);
        if (wait > 0) await sleep(wait * 1000);
        s.card = { ad, line: i };
        await this.audio.speak(line.text, 'ad', { audio: this.voices.adLine(ad, line.text, ad.script[i + 1]?.text) });
      }
      s.card = { ad, line: -1 };
      const rest = ad.duration - (now() - started);
      if (rest > 0) await sleep(rest * 1000);
    } finally {
      tune?.stop();
    }
  }

  // --- programmes ------------------------------------------------------------

  async prepareImages(episode) {
    const ids = episode.rundown.filter((r) => r.hasImage && !this.images.has(r.storyId)).map((r) => r.storyId);
    for (const id of ids) {
      try {
        const img = await loadImage(`/api/img/${id}`);
        await frame();
        const small = pixelate(img, SMALL.w, SMALL.h, { colors: 16 });
        await frame();
        const full = pixelate(img, FULL.w, FULL.h, { colors: 24 });
        const card = document.createElement('canvas');
        card.width = 384;
        card.height = 216;
        card.getContext('2d').drawImage(full, -16, -9);
        this.images.set(id, { small, full, card });
      } catch (err) {
        console.warn('[director] image', id, err.message);
      }
    }
    const keep = new Set(episode.rundown.map((r) => r.storyId));
    if (this.images.size > 40) for (const id of this.images.keys()) if (!keep.has(id)) this.images.delete(id);
  }

  setCast(episode) {
    const s = this.scene;
    s.cast = episode.cast;
    s.anchors = Object.fromEntries(Object.keys(episode.cast).map((slot) => [slot, { emotion: 'neutral' }]));
    const voices = {};
    for (const [slot, id] of Object.entries(episode.cast)) voices[slot] = this.channel.presenters[id]?.voice;
    this.audio.setVoices?.(voices);
    this.v2?.episode(episode); // v2: scene.episode; every segment is planned in idle time
  }

  /** Start a presenter animation (see cues.js) or change an expression. */
  perform(slot, cue) {
    const s = this.scene;
    if (!s.cast?.[slot]) return;
    if (cue.emotion) s.anchors[slot] = { ...s.anchors[slot], emotion: cue.emotion };
    if (cue.action && ACTIONS[cue.action]) s.actions[slot] = { name: cue.action, t0: now(), dur: ACTIONS[cue.action].dur };
  }

  /** Cues the writer did not provide: greet, show the pictures, hand over. */
  defaultCues(seg) {
    if (seg.cues?.length) return seg.cues;
    if (seg.type === 'intro' || seg.type === 'outro') return [{ char: 0, action: 'wave' }];
    if (seg.type === 'chat') return [{ char: 0, action: this.scene.cast.B ? 'look_partner' : 'nod' }];
    if (seg.type === 'story') {
      const grave = seg.emotion === 'serious' || seg.emotion === 'sad';
      return [{ char: 0, action: seg.hasImage ? 'point_screen' : grave ? 'lean_in' : 'raise_hand' }];
    }
    return [];
  }

  async say(seg, onSentence) {
    const s = this.scene;
    s.anchors[seg.anchor] = { emotion: seg.emotion };
    for (const slot of Object.keys(s.cast)) {
      if (slot === seg.anchor) continue;
      s.anchors[slot] = { emotion: seg.emotion === 'happy' ? 'happy' : seg.emotion === 'serious' || seg.emotion === 'sad' ? 'serious' : 'neutral' };
    }
    // Gestures fire when the voice reaches their character (the engine's
    // speech timeline, re-synced on TTS word boundaries; after the last word
    // they fire as the speech ends).
    const cues = this.defaultCues(seg);
    // The server's recorded voice (or one that finished after the episode was fetched); null = browser voice.
    // PACE: the lookup started in the pause before this segment (voiceAhead), so a late clip's lookup sits inside the gap
    const ahead = this.voiceAhead?.seg === seg ? this.voiceAhead.job : null;
    this.voiceAhead = null;
    const recorded = await (ahead ?? this.voices.audioFor(seg));
    const v2 = this.v2?.begin(seg, recorded ?? null); // v2: scene.segPlan (timed for the voice that plays) + its shot cues
    const v2marks = v2?.speak?.marks || []; // v2 cuts that fall inside a sentence
    await this.audio.speak(seg.text, seg.anchor, {
      audio: recorded, // recorded voice from the server, when the episode has one (voice contract)
      onSentence: (sentence, i) => {
        s.subtitle = sentence;
        v2?.sentence(i);
        onSentence?.(i);
      },
      marks: [...cues.map((cue) => cue.char), ...v2marks],
      onMark: (i) => (i < cues.length ? this.perform(cues[i].slot || seg.anchor, cues[i]) : v2?.speak?.onMark(i - cues.length)),
    });
    v2?.end();
    s.subtitle = null;
  }

  async playEpisode(episode) {
    const s = this.scene;
    this.episode = episode; // PACE: the pause after each segment and the look-ahead of chats need the running order
    this.voices.episode(episode); // warm up the first recorded voices while the open plays
    const imagesReady = this.prepareImages(episode);
    // Each programme has its own opening titles and theme tune. The tune starts
    // on the open's own clock (the shot change, dt = 0), so its final chord
    // lands on the title lock-up and its button on the cut, `duration` later.
    const open = openFor(episode.program.id);
    let tune = null;
    await this.stinger(() => {
      s.program = episode.program;
      s.replay = !!episode.replay;
      s.rundown = episode.rundown || [];
      s.lowerThird = null;
      s.subtitle = null;
      this.setCast(episode);
      this.setShot('open', { storyId: null, card: null });
    }, (cut) => (tune = this.audio.playTune?.(open.tune, { volume: 0.6, startAt: cut }))); // scheduled at the stinger's start, heard from the cut
    this.introduced = new Set();
    // The open never waits for pictures: its length is the theme's (the lock-up is still from 3.2 s
    // and the cut lands on the last hit). Pictures keep loading in the background; a story whose
    // picture is not ready yet falls back to its source wall / the montage's neutral field.
    imagesReady.catch(() => {});
    await sleep(open.duration * 1000 - STINGER_DURATION * 500);
    tune?.stop?.();
    s.programTagUntil = now() + CHANNEL.programTag.window;

    for (const seg of episode.segments) {
      const index = episode.segments.indexOf(seg);
      switch (seg.type) {
        case 'intro':
          await this.playIntro(seg, episode.segments[index + 1]);
          break;
        case 'story':
          await this.playStory(seg);
          break;
        case 'chat': {
          s.lowerThird = null;
          // v2: the plan's own opening shot now (no default wide on air while a late clip is looked up);
          // default path: the wide, or the speaker's close when one wide would pass the studio maximum
          const op = this.v2 ? this.v2Opening(seg, index) : null;
          if (op) this.setShot(op.shot, { focus: op.focus, wall: { mode: 'logo' }, card: null, framing: op.framing, cameraMove: op.move });
          else this.setShot(this.v2 ? 'wide' : this.chatShot(seg, index), { focus: seg.anchor, wall: { mode: 'logo' }, card: null });
          await this.say(seg);
          break;
        }
        case 'outro': {
          s.lowerThird = null;
          const op = this.v2 ? this.v2Opening(seg, index) : null;
          if (op) this.setShot(op.shot, { focus: op.focus, wall: { mode: 'logo' }, storyId: null, card: null, framing: op.framing, cameraMove: op.move });
          else this.setShot('wide', { focus: seg.anchor, wall: { mode: 'logo' }, storyId: null, card: null }); // the bibles' sign-off WIDE (solo too: money-minute.md, news-60.md)
          await this.say(seg);
          // world-now.md: the sign-off holds on the wide with the programme's sign-off cue under it (the brass 3→1),
          // then the stinger to the end card; the cue starts 0.15 s after the last word (a sting never overlaps
          // speech), so the hold is never dead air
          this.audio.sfx('outro', { programId: s.program?.id, startAt: performance.now() + 150 });
          await sleep(pace(s).holds.signoff * 1000); // the sign-off's hold on the wide (world-now.md 1.5 s)
          await this.stinger(() => {
            this.setShot('endcard', { card: { line1: 'STAY WITH US', line2: `${this.channel.name} · LIVE 24 HOURS` } });
          });
          await sleep(pace(s).holds.endcard * 1000);
          continue;
        }
        default:
          break;
      }
      // Air between segments (owner 18:52): the pace profile's pause for this pair (story, hand-over,
      // chat turn, block, before And finally...), minus the silence the playout adds by itself (a voice
      // engine start-up: only when a voice plays, not in mute / blips)
      const { kind, gap } = gapAfter(episode, index);
      if (gap >= pace(s).strap.outAtBlock && kind !== 'signoff') s.lowerThird = null; // a block pause clears the strap
      const latency = this.audio?.mode === 'tts' ? CHANNEL.voiceLatency : 0;
      // the next segment's recorded voice is looked up during the pause, not after it (air = max(gap, lookup))
      const following = episode.segments[index + 1];
      if (following) this.voiceAhead = { seg: following, job: Promise.resolve(this.voices.audioFor(following)).catch(() => null) };
      await sleep(Math.max(60, (gap - latency) * 1000));
    }
  }

  /** Cold open: the headlines play as a montage under the presenter's intro. */
  async playIntro(seg, next = null) {
    const v2intro = this.v2?.intro?.(seg); // v2: montage cut on the spoken teaser, greeting on its planned shot
    if (v2intro) return v2intro;
    const s = this.scene;
    const P = pace(s);
    // PACE (critics r1): the montage is voice-paced (owner 20:40 (1)): one frame per TEASED line (seg.teases, else the
    // lines before the greeting), cut on its line's first word and held at least holds.montage (readable twice; a cut
    // the line reaches sooner waits for it), the greeting on the wide. No teaser (NEWS IN 60's "This is NEWS IN 60.
    // I'm Sam Night.") means no montage, and nothing ever holds a headline frame over silence.
    const frames = Math.min(3, teaserLines(seg, splitSentences(seg.text)), s.rundown.length);
    if (frames < 2) {
      this.setShot('wide', { focus: seg.anchor, wall: { mode: 'rundown' } });
      await sleep(P.open.firstWord * 1000); // the first line a breath after the open
      return this.say(seg);
    }
    const cardOf = (k) => {
      const id = Array.isArray(seg.teases) ? seg.teases[k] : null;
      const at = id ? s.rundown.findIndex((r) => r?.storyId === id) : -1;
      return at >= 0 ? at : k;
    };
    this.setShot('montage', { focus: seg.anchor, storyId: null, card: { index: cardOf(0) } });
    let pending = null;
    let greeted = false;
    const cut = (apply) => {
      clearTimeout(pending);
      pending = null;
      const wait = P.holds.montage - (now() - s.shotSince);
      if (wait > 0.02) pending = setTimeout(() => ((pending = null), apply()), wait * 1000);
      else apply();
    };
    await sleep(P.open.firstWord * 1000); // the first line a breath after the open
    await this.say(seg, (i) => {
      if (i > 0 && i < frames) cut(() => this.setShot('montage', { card: { index: cardOf(i) } }));
      else if (i === frames) cut(() => ((greeted = true), this.setShot('wide', { focus: seg.anchor, wall: { mode: 'logo' }, card: null })));
    });
    // a greeting too short for the last frame's floor stays on the montage: the story cuts straight from it (or its
    // breaking stinger covers it); a studio wide set now would air for just the after-intro pause (owner 20:40 (2))
    clearTimeout(pending);
    if (!greeted && next?.type !== 'story') this.setShot('wide', { focus: seg.anchor, wall: { mode: 'logo' }, card: null });
  }

  /** Default path: the air (s) of the chats and sign-off right after segment `index` that stay on the wide. */
  wideTail(index) {
    const segs = this.episode?.segments || [];
    if (index < 0 || !this.scene.cast?.B) return segs[index + 1]?.type === 'outro' ? estimateSeg(segs[index + 1]) + pace(this.scene).holds.signoff : 0;
    let t = 0;
    for (let j = index + 1; j < segs.length && (segs[j].type === 'chat' || segs[j].type === 'outro'); j++) t += estimateSeg(segs[j]) + (j < segs.length - 1 ? gapAfter(this.episode, j).gap : pace(this.scene).holds.signoff);
    return t;
  }

  /** Default path: seconds the shot on air has been seen (a focus re-set of the wide is no cut: it keeps counting). */
  onAir() {
    const s = this.scene;
    const since = s.shot === 'wide' && Number.isFinite(this.seenSince) ? Math.min(this.seenSince, s.shotSince) : s.shotSince;
    return now() - since;
  }

  /**
   * v2 path: the opening shot the plan gives a chat or the sign-off, set by the director at once (the
   * plan's cue 0 then finds it on air): no default framing flashes while a late clip is looked up.
   */
  v2Opening(seg, index) {
    try {
      const e = this.v2?.planAt?.(index)?.events?.find((x) => x.kind === 'shot');
      if (e && STUDIO.has(e.shot)) return { shot: e.shot, framing: e.framing ?? null, focus: e.focus && e.focus in (this.scene.cast || {}) ? e.focus : seg.anchor, move: e.move ?? null };
    } catch {
      /* the director's own wide */
    }
    return null;
  }

  /**
   * Default path: a chat plays on the wide, unless the wide (with the chats and the sign-off that
   * follow it on the same wide) would pass the programme's studio maximum: then this line goes on
   * the speaker's close when it can hold the minimum shot (and the wide on air has held the cooldown).
   */
  chatShot(seg, index) {
    const s = this.scene;
    if (!s.cast?.B) return 'close';
    const P = pace(s);
    const segs = this.episode?.segments || [];
    const gap = (j) => (j < segs.length - 1 ? gapAfter(this.episode, j).gap : P.holds.signoff);
    const onWide = s.shot === 'wide';
    const held = onWide ? this.onAir() : 0;
    let run = held + estimateSeg(seg) + gap(index);
    for (let j = index + 1; j < segs.length && (segs[j].type === 'chat' || segs[j].type === 'outro'); j++) run += estimateSeg(segs[j]) + gap(j);
    if (run <= P.shots.studioMax + 0.5) return 'wide';
    const alone = estimateSeg(seg) + gap(index) >= P.shots.min;
    const sameClose = s.shot === 'close' && s.focus === seg.anchor; // never the close already on air (a jump)
    return alone && !sameClose && (!onWide || held >= P.shots.cooldown) ? 'close' : 'wide';
  }

  /**
   * One visual "beat" per sentence: presenter first, then the location map,
   * the picture and the key-fact card, as the story allows.
   */
  storyBeats(seg, hasImg) {
    const s = this.scene;
    let anchorShot = seg.shot === 'wide' && s.cast.B ? 'wide' : 'close';
    // a story the chats follow stays off the wide: the exchange (and the sign-off) take it fresh, never one 25 s wide
    const segs = this.episode?.segments || [];
    if (anchorShot === 'wide' && segs[segs.indexOf(seg) + 1]?.type === 'chat') anchorShot = 'close';
    // PACE (critics r1): a story change is always a visible cut: never the wide already on air (a focus re-set of the
    // wide shows nothing new), never the same presenter's close again (a jump cut)
    // (pace.js isRepeat: the default path's wide is one camera whoever has the focus)
    // (a number of the day that opens on its card outside WORLD NOW puts the card between: no repeat to avoid)
    const asSeen = (shot, focus) => ({ shot, focus: shot === 'wide' ? null : focus });
    const onCard = seg.feature === 'number' && !!seg.fact && s.program?.id !== 'world-now' && s.shot !== 'fact';
    let swapped = false;
    if (!onCard && isRepeat(s.program?.id, [asSeen(s.shot, s.focus)], asSeen(anchorShot, seg.anchor))) {
      anchorShot = anchorShot === 'close' ? 'wide' : 'close';
      swapped = true;
    }
    // a round-up item opens on its map (the v2 planner's map to map), but after shots.mapRun maps in a row an item
    // shows its picture, else its reader in vision (never a 40 s run of one shot type)
    if ((seg.feature === 'roundup' || seg.roundup) && seg.location) return [(this.mapRun || 0) < pace(s).shots.mapRun ? 'map' : hasImg ? 'full' : anchorShot];
    const number = seg.feature === 'number' && !!seg.fact;
    const beats = [anchorShot];
    if (number) beats.push('fact'); // the number of the day shows its card early (the v2 plans)
    if (seg.location) beats.push('map');
    if (hasImg) beats.push('full');
    if (seg.fact && !number) beats.push('fact');
    if (seg.shot === 'full' && hasImg && beats[1] !== 'full') {
      beats.splice(beats.indexOf('full'), 1);
      beats.splice(1, 0, 'full');
    }
    // outside WORLD NOW it opens on its card (tech-bytes / cosmos / money-minute .md), unless a card is already on air
    if (number && s.program?.id !== 'world-now' && s.shot !== 'fact') beats.unshift(...beats.splice(beats.indexOf('fact'), 1));
    // a wide forced by the close on air that the chats / sign-off would carry on (one 20 s wide): the story opens on its
    // picture or map instead, then its presenter's close (the close on air is a shot away: no jump)
    if (swapped && anchorShot === 'wide' && this.wideTail(segs.indexOf(seg)) > 0) {
      const v = beats.findIndex((b) => b === 'full' || b === 'map');
      if (v > 0) beats.splice(0, 1, beats.splice(v, 1)[0], 'close');
    }
    // And finally ends on its picture or its presenter, never on a map
    if ((seg.feature === 'lighter' || /^\W*and finally\b/i.test(String(seg.text || ''))) && hasImg && beats.indexOf('map') > beats.indexOf('full')) {
      beats.splice(beats.indexOf('map'), 1);
      beats.splice(1, 0, 'map');
    }
    return beats;
  }

  async playStory(seg) {
    const s = this.scene;
    const P = pace(s);
    const hasImg = !!this.images.get(seg.storyId);
    const lines = splitSentences(seg.text);
    // PACE (critics r1): the pause before the next segment's cut, the segment's estimated air (re-estimated from the
    // voice's own pace at every sentence) and at most one beat per cooldown of it
    const index = this.episode?.segments?.indexOf(seg) ?? -1;
    const after = index >= 0 ? gapAfter(this.episode, index).gap : P.gaps.story;
    const starts = [];
    let chars = 0;
    for (const l of lines) {
      starts.push(chars);
      chars += l.length + 1;
    }
    const est = estimateSeg(seg);
    let spoke = null; // when sentence 0 started
    let sentAt = null; // when the sentence on air started
    // seconds until the next segment's cut, from now: the sentences left at the voice's own pace so far, less what
    // the sentence on air has already spoken (a cut the cooldown delayed comes in mid-sentence)
    const left = () => {
      if (spoke == null) return est + after;
      const done = starts[sentence] ?? chars;
      const span = sentAt - spoke;
      // (a short first sentence and its pause say little about the pace: the voice's own rate only past 2.5 s / 30 chars)
      const rate = span > 2.5 && done > 30 ? done / span : chars / Math.max(0.5, est);
      return Math.max(0, (chars - done) / rate - (now() - sentAt)) + after;
    };
    // (beats spaced by the median band's lower bound: the cooldown is a floor, not the rhythm; owner 18:52 median 5-7 s.
    // The band's middle was tried: it dropped the map of every short COSMOS story, so the lower bound stays)
    const spacing = Math.max(P.shots.cooldown, P.shots.median[0]);
    const beats = this.storyBeats(seg, hasImg).slice(0, Math.max(1, Math.min(lines.length, Math.floor((est + after) / spacing))));
    const finallyStory = seg.feature === 'lighter' || /^\W*and finally\b/i.test(String(seg.text || ''));
    // And finally never ends on a map: the map hands back to the presenter when a sentence is left for it, else it goes
    // (by the estimate: the return must air the minimum plus the late-beat margin, else the map is not taken at all)
    if (finallyStory && beats.length > 1 && beats[beats.length - 1] === 'map') {
      const at = (k) => ((starts[k] ?? chars) / chars) * est; // when sentence k starts
      const back = beats.length; // the return sentence
      const fits = lines.length > back && est + after - at(back) >= P.shots.min + 1 && at(back) - at(back - 1) >= P.shots.min;
      if (fits) beats.push(beats[0]);
      else beats.pop();
    }
    const wall = hasImg ? { mode: 'image', storyId: seg.storyId } : { mode: 'source', source: seg.source, category: seg.category || 'general' };

    if (seg.breaking) {
      await this.stinger(() => {
        this.setShot('breakingCard', { storyId: seg.storyId, card: { headline: seg.headline, source: seg.source } });
      }, (cut) => this.audio.sfx('breaking', { programId: s.program?.id, startAt: cut }));
      await sleep(pace(s).holds.breakingCard * 1000); // the card is on air for at most 3 s (stinger tail + hold): a calm colour change, not a show
    }
    let pending = null;
    let opening = false; // default path: the opening cut still waits for the cooldown (later beats wait for it)
    let watch = null; // default path: the max-hold timer of the shot on air
    // v2: shots come from the plan's cues (cue.k > 0 arrive through shotFor at their sentence or word)
    const v2cues = this.v2?.shots(seg, hasImg, (cue) => shotFor(cue.k, cue)) || null;
    const cardFor = (beat) =>
      beat === 'map'
        ? { ...seg.location }
        : beat === 'fact'
          ? { fact: seg.fact, label: /\d/.test(seg.fact) ? 'BY THE NUMBERS' : 'KEY FACT', source: seg.source }
          : null;
    const shotFor = (i, cue = null) => {
      if (!cue) return cutTo(i, beats[Math.min(i, beats.length - 1)]);
      if (i === 0 && cue.keep && STUDIO.has(s.shot)) return 0; // v2: a short pickup ("Thanks, Ada.") stays on the studio shot on air; the card comes with its line
      const beat = cue.shot;
      const apply = () => this.setShot(beat, { focus: cue.focus || seg.anchor, storyId: seg.storyId, wall, card: cardFor(beat), framing: cue.framing, cameraMove: cue.move });
      // Hold every shot for at least the profile's minimum before cutting away (cut cooldown); the opening cut too when
      // a studio shot is on air (NEWS IN 60's 2.5 s intro wide: the story's voice starts over it, no dead pause)
      clearTimeout(pending);
      const held = now() - s.shotSince;
      const MIN_SHOT = P.shots.cooldown;
      const wait = i === 0 && !STUDIO.has(s.shot) ? 0 : cutWait(s.program?.id, now() - held, now());
      if (wait <= 0.05) apply();
      else pending = setTimeout(apply, wait * 1000);
      return i === 0 ? Math.max(0, wait) : 0;
    };
    // ---- default path (PACE, critics r1)
    const anchorShot = STUDIO.has(beats[0]) ? beats[0] : seg.shot === 'wide' && s.cast.B ? 'wide' : 'close';
    const maxOf = (shot) => (shot === 'fact' ? P.shots.factMax : shot === 'full' ? P.shots.picture[1] : shot === 'map' ? P.shots.map[1] : STUDIO.has(shot) ? P.shots.studioMax : Infinity);
    // what replaces a shot past its maximum: a card, picture or map gives way to the presenter, a studio shot to the
    // other studio shot (the default path has no MCU-L: a solo show's other studio shot is its wide)
    // (a wide that the chats / sign-off after this story would carry on is no relief: it only moves the long hold; the
    // story's picture is, else its map unless it is And finally, else nothing: critic r1, a 19.8 s wide)
    // `run`: the air (s) the relief would take from its cut to the next segment's cut
    const relief = (shot, run = 0) => {
      if (!STUDIO.has(shot)) return anchorShot;
      const tail = shot === 'close' ? this.wideTail(index) : 0;
      if (shot === 'wide' || tail <= 0 || run + tail <= P.shots.studioMax + 0.5) return shot === 'close' ? 'wide' : 'close';
      return (hasImg && 'full') || (seg.location && !finallyStory && 'map') || null;
    };
    const apply = (beat) => {
      this.setShot(beat, { focus: seg.anchor, storyId: seg.storyId, wall, card: cardFor(beat) });
      // max hold: when this shot would run past its maximum before the next segment's cut (at the voice's estimated
      // pace), it gives way at the middle of its run, both parts at least the cooldown (a timer: mid-sentence if need be)
      clearTimeout(watch);
      const since = s.shotSince;
      const own = left();
      // a wide that the chats / the sign-off after this story would carry on (they play on the wide): their air counts,
      // and the relief comes late enough in this story to leave its close the minimum before them (critic r1: a 25.9 s wide)
      const tail = beat === 'wide' ? this.wideTail(index) : 0;
      const total = own + tail;
      const max = maxOf(beat);
      if (total > max + 0.5 && own >= 2 * P.shots.cooldown) {
        const at = tail > 0 ? Math.max(P.shots.cooldown, Math.min(max - 0.5, own - P.shots.min - 0.5)) : Math.max(P.shots.cooldown, Math.min(max - 0.5, total / 2));
        const r = relief(beat, own - at);
        if (r) watch = setTimeout(() => s.shotSince === since && s.shot === beat && cutTo(-1, r), at * 1000);
      }
    };
    // the opening cut waits for the cooldown when a studio shot is on air (the voice starts over it); a later beat is
    // taken only when it can air the minimum shot before the next segment's cut, else it is dropped (no 2 s beat at a
    // story's end); i = -1: the max-hold relief (its timer already checked the room)
    const cutTo = (i, beat) => {
      clearTimeout(pending);
      const held = this.onAir();
      const MIN_SHOT = P.shots.cooldown;
      const wait = (i === 0 && !STUDIO.has(s.shot)) || i < 0 ? 0 : cutWait(s.program?.id, now() - held, now()); // pace.js cooldown
      // (1 s of margin: the voice's real length is only estimated until it has spoken a while; a later beat that might
      // air under the minimum is better dropped: critic r1, a 3.2 s picture at a story's end)
      if (i > 0 && left() - wait < P.shots.min + 1) return 0;
      if (wait > 0.05) {
        opening = i === 0;
        pending = setTimeout(() => ((opening = false), apply(beat)), wait * 1000);
      } else apply(beat);
      return Math.max(0, wait);
    };
    // at a sentence start with no beat of its own: a shot that has drifted past its maximum (a slower voice) gives way
    const guard = (i) => {
      const held = this.onAir();
      const rest = left();
      if (held < P.shots.cooldown || rest < P.shots.cooldown + 1 || held + rest <= maxOf(s.shot) + 0.5) return;
      const r = relief(s.shot, rest);
      if (r) cutTo(i, r);
    };
    let sentence = 0;
    // Between stories the director simply cuts; the stinger is kept for opens, breaks and breaking news.
    const presenter = s.cast[seg.anchor];
    const showName = !this.introduced?.has(presenter);
    this.introduced?.add(presenter);
    const delay = shotFor(0, v2cues?.[0]);
    s.lowerThird = {
      headline: seg.headline,
      source: seg.source || '',
      anchorName: presenterName(presenter),
      showName,
      breaking: seg.breaking,
      kicker: seg.kicker, // editorial's topic label for the strap tag (graphics request)
      category: seg.category,
      since: now() + delay + pace(s).strap.inAfterCut, // ART_DIRECTION §5: the strap enters about 1 s after the (real) cut
    };
    paceTrace({ k: 'strap', at: s.lowerThird.since * 1000 }); // analyser: when the strap really wipes in
    await this.say(seg, (i) => {
      sentence = i;
      sentAt = now();
      if (i === 0) spoke = now();
      if (i === 0 || v2cues || opening) return;
      if (i < beats.length && beats[i] !== s.shot) shotFor(i);
      else guard(i);
    });
    clearTimeout(watch);
    clearTimeout(pending);
  }
}
