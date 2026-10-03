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
import { paceFor, gapAfter, CHANNEL, paceTrace } from './pace.js';

const now = () => performance.now() / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => setTimeout(r, 0));

const SMALL = { w: 104, h: 62 }; // studio video wall / over-the-shoulder box
const FULL = { w: 416, h: 234 }; // full screen with room for a slow pan
// Every on-air timing (shot holds, pauses between segments, card holds) comes from the
// programme's pace profile (pace.js: one table for the whole channel, owner 23:10).
const pace = (scene) => paceFor(scene.program?.id);

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
    try {
      cue?.((this.scene.stinger.start + STINGER_DURATION / 2) * 1000);
    } catch (err) {
      console.warn('[director] cue', err);
    }
    await sleep(STINGER_DURATION * 500);
    change();
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
    const recorded = await this.voices.audioFor(seg);
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
      tune = this.audio.playTune?.(open.tune, { volume: 0.6, startAt: performance.now() });
    });
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
        case 'chat':
          s.lowerThird = null;
          this.setShot('wide', { focus: seg.anchor, wall: { mode: 'logo' }, card: null });
          await this.say(seg);
          break;
        case 'outro':
          s.lowerThird = null;
          this.setShot(s.cast.B ? 'wide' : 'close', { focus: seg.anchor, wall: { mode: 'logo' }, storyId: null, card: null });
          await this.say(seg);
          await sleep(pace(s).holds.signoff * 1000); // the sign-off's hold on the wide (world-now.md 1.5 s)
          await this.stinger(() => {
            this.setShot('endcard', { card: { line1: 'STAY WITH US', line2: `${this.channel.name} · LIVE 24 HOURS` } });
            this.audio.sfx('outro', { programId: s.program?.id, startAt: performance.now() });
          });
          await sleep(pace(s).holds.endcard * 1000);
          continue;
        default:
          break;
      }
      // Air between segments (owner 18:52): the pace profile's pause for this pair (story, hand-over,
      // chat turn, block, before And finally...), minus the silence the playout adds by itself.
      const { kind, gap } = gapAfter(episode, index);
      if (gap >= pace(s).strap.outAtBlock && kind !== 'signoff') s.lowerThird = null; // a block pause clears the strap
      await sleep(Math.max(60, (gap - CHANNEL.voiceLatency) * 1000));
    }
  }

  /** Cold open: the headlines play as a montage under the presenter's intro. */
  async playIntro(seg, next = null) {
    const v2intro = this.v2?.intro?.(seg); // v2: montage cut on the spoken teaser, greeting on its planned shot
    if (v2intro) return v2intro;
    const s = this.scene;
    const frames = Math.min(3, s.rundown.length);
    if (frames < 2) {
      this.setShot('wide', { focus: seg.anchor, wall: { mode: 'rundown' } });
      return this.say(seg);
    }
    this.setShot('montage', { focus: seg.anchor, storyId: null, card: { index: 0 } });
    const started = now();
    const MONTAGE_FRAME = pace(s).holds.montage; // a headline frame holds long enough to read twice
    let done = false;
    const speech = sleep(pace(s).open.firstWord * 1000).then(() => this.say(seg)).then(() => (done = true)); // the first line after a breath
    for (let i = 1; i < frames || !done; i++) {
      await sleep(MONTAGE_FRAME * 1000);
      if (i < frames) this.setShot('montage', { card: { index: i } });
      else if (!done) await speech;
    }
    await speech;
    const minimum = frames * MONTAGE_FRAME - (now() - started);
    if (minimum > 0) await sleep(minimum * 1000);
    // PACE (owner 20:40): a story cuts straight from the montage's last frame (or its breaking stinger covers it); a
    // studio wide set here would air for just the after-intro pause, a flash before the next shot
    if (next?.type !== 'story') this.setShot('wide', { focus: seg.anchor, wall: { mode: 'logo' }, card: null });
  }

  /**
   * One visual "beat" per sentence: presenter first, then the location map,
   * the picture and the key-fact card, as the story allows.
   */
  storyBeats(seg, hasImg) {
    const anchorShot = seg.shot === 'wide' && this.scene.cast.B ? 'wide' : 'close';
    const beats = [anchorShot];
    if (seg.location) beats.push('map');
    if (hasImg) beats.push('full');
    if (seg.fact) beats.push('fact');
    if (seg.shot === 'full' && hasImg && beats[1] !== 'full') {
      beats.splice(beats.indexOf('full'), 1);
      beats.splice(1, 0, 'full');
    }
    return beats;
  }

  async playStory(seg) {
    const s = this.scene;
    const hasImg = !!this.images.get(seg.storyId);
    const sentences = splitSentences(seg.text).length;
    const beats = this.storyBeats(seg, hasImg).slice(0, Math.max(1, sentences));
    const wall = hasImg ? { mode: 'image', storyId: seg.storyId } : { mode: 'source', source: seg.source, category: seg.category || 'general' };

    if (seg.breaking) {
      await this.stinger(() => {
        this.setShot('breakingCard', { storyId: seg.storyId, card: { headline: seg.headline, source: seg.source } });
        this.audio.sfx('breaking', { programId: s.program?.id, startAt: performance.now() });
      });
      await sleep(pace(s).holds.breakingCard * 1000); // the card is on air for at most 3 s (stinger tail + hold): a calm colour change, not a show
    }
    let pending = null;
    // v2: shots come from the plan's cues (cue.k > 0 arrive through shotFor at their sentence or word)
    const v2cues = this.v2?.shots(seg, hasImg, (cue) => shotFor(cue.k, cue)) || null;
    const shotFor = (i, cue = null) => {
      const beat = cue ? cue.shot : beats[Math.min(i, beats.length - 1)];
      const card =
        beat === 'map'
          ? { ...seg.location }
          : beat === 'fact'
            ? { fact: seg.fact, label: /\d/.test(seg.fact) ? 'BY THE NUMBERS' : 'KEY FACT', source: seg.source }
            : null;
      const apply = () => this.setShot(beat, { focus: cue?.focus || seg.anchor, storyId: seg.storyId, wall, card, ...(cue && { framing: cue.framing, cameraMove: cue.move }) });
      // Hold every shot for at least the profile's minimum before cutting away (cut cooldown).
      clearTimeout(pending);
      const held = now() - s.shotSince;
      const MIN_SHOT = pace(s).shots.cooldown;
      if (i === 0 || held >= MIN_SHOT) apply();
      else pending = setTimeout(apply, (MIN_SHOT - held) * 1000);
    };
    // Between stories the director simply cuts; the stinger is kept for opens, breaks and breaking news.
    const presenter = s.cast[seg.anchor];
    const showName = !this.introduced?.has(presenter);
    this.introduced?.add(presenter);
    shotFor(0, v2cues?.[0]);
    s.lowerThird = {
      headline: seg.headline,
      source: seg.source || '',
      anchorName: presenterName(presenter),
      showName,
      breaking: seg.breaking,
      kicker: seg.kicker, // editorial's topic label for the strap tag (graphics request)
      category: seg.category,
      since: now() + pace(s).strap.inAfterCut, // ART_DIRECTION §5: the strap enters about 1 s after the cut
    };
    paceTrace({ k: 'strap', at: s.lowerThird.since * 1000 }); // analyser: when the strap really wipes in
    await this.say(seg, (i) => i > 0 && !v2cues && shotFor(i));
    clearTimeout(pending);
  }
}
