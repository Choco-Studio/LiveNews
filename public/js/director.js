// The gallery director: plays what master control sends (programme episodes
// and commercial breaks), calls the camera shots, graphics and subtitles,
// and keeps the channel running forever.
import { pixelate, loadImage } from './pixelate.js';
import { presenterName, setPresenters } from './cast.js';
import { STINGER_DURATION } from './scenes/cards.js';
import { pickAds } from './ads/index.js';
import { splitSentences } from './audio.js';

const now = () => performance.now() / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => setTimeout(r, 0));

const SMALL = { w: 104, h: 62 }; // studio video wall / over-the-shoulder box
const FULL = { w: 416, h: 234 }; // full screen with room for a slow pan
const MONTAGE_FRAME = 2.6; // seconds per headline in the cold open

export class Director {
  constructor({ audio, channel }) {
    this.audio = audio;
    this.channel = channel;
    setPresenters(channel.presenters);
    this.images = new Map(); // storyId -> { small, full, card }
    this.recentAds = [];
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
  }

  setShot(shot, extra = {}) {
    const s = this.scene;
    const changed = s.shot !== shot || (extra.focus && extra.focus !== s.focus) || ('storyId' in extra && extra.storyId !== s.storyId);
    Object.assign(s, extra);
    if (changed) {
      s.shot = shot;
      s.shotSince = now();
      if (shot === 'full') s.panDir = Math.random() < 0.5 ? 1 : -1;
    }
  }

  /** Transition with the channel stinger; the shot changes under it. */
  async stinger(change) {
    this.scene.stinger = { start: now() };
    this.audio.sfx('whoosh');
    await sleep(STINGER_DURATION * 500);
    change();
    await sleep(STINGER_DURATION * 500);
  }

  breaking(item) {
    this.scene.breaking = { ...item, since: now() };
    this.audio.sfx('breaking');
  }

  skip() {
    this.audio.stop();
  }

  async run() {
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
        await sleep(6000);
        continue;
      }
      lastId = item.id;
      try {
        if (item.kind === 'break') await this.playBreak(item);
        else await this.playEpisode(item);
      } catch (err) {
        console.error('[director]', err);
        await sleep(1500);
      }
    }
  }

  // --- commercial breaks ---------------------------------------------------

  async playBreak(item) {
    const s = this.scene;
    s.lowerThird = null;
    s.subtitle = null;
    if (!item.filler) {
      await this.stinger(() => this.setShot('ident', { card: null }));
      this.audio.sfx('jingle');
      await sleep(3200);
    }
    const ads = pickAds(item.ads || 1, this.recentAds);
    for (const ad of ads) {
      this.recentAds = [...this.recentAds, ad.id].slice(-6);
      await this.stinger(() => this.setShot('ad', { card: { ad, line: -1 } }));
      await this.playAd(ad);
    }
    if (item.next) {
      await this.stinger(() =>
        this.setShot('promo', {
          card: {
            next: item.next,
            label: item.next.ready ? 'UP NEXT' : 'COMING UP',
            footer: item.next.ready ? 'AFTER THE BREAK' : 'STAY WITH US',
          },
        })
      );
      await sleep(4200);
    }
  }

  async playAd(ad) {
    const s = this.scene;
    const started = now();
    this.audio.setVoices?.({ ad: ad.voice });
    const tune = this.audio.playTune?.(ad.tune, { loop: true, volume: 0.45 });
    try {
      for (let i = 0; i < ad.script.length; i++) {
        const line = ad.script[i];
        const wait = line.at - (now() - started);
        if (wait > 0) await sleep(wait * 1000);
        s.card = { ad, line: i };
        await this.audio.speak(line.text, 'ad');
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
  }

  async say(seg, onSentence) {
    const s = this.scene;
    s.anchors[seg.anchor] = { emotion: seg.emotion };
    for (const slot of Object.keys(s.cast)) {
      if (slot === seg.anchor) continue;
      s.anchors[slot] = { emotion: seg.emotion === 'happy' ? 'happy' : seg.emotion === 'serious' || seg.emotion === 'sad' ? 'serious' : 'neutral' };
    }
    await this.audio.speak(seg.text, seg.anchor, {
      onSentence: (sentence, i) => {
        s.subtitle = sentence;
        onSentence?.(i);
      },
    });
    s.subtitle = null;
  }

  async playEpisode(episode) {
    const s = this.scene;
    const imagesReady = this.prepareImages(episode);
    await this.stinger(() => {
      s.program = episode.program;
      s.replay = !!episode.replay;
      s.rundown = episode.rundown || [];
      s.lowerThird = null;
      s.subtitle = null;
      this.setCast(episode);
      this.setShot('title', { storyId: null, card: null });
    });
    this.audio.sfx('jingle');
    await Promise.all([sleep(3200), imagesReady]);

    for (const seg of episode.segments) {
      switch (seg.type) {
        case 'intro':
          await this.playIntro(seg);
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
          await sleep(300);
          await this.stinger(() => this.setShot('endcard', { card: { line1: 'STAY WITH US', line2: `${this.channel.name} · LIVE 24 HOURS` } }));
          this.audio.sfx('outro');
          await sleep(3000);
          break;
        default:
          break;
      }
      await sleep(300);
    }
  }

  /** Cold open: the headlines play as a montage under the presenter's intro. */
  async playIntro(seg) {
    const s = this.scene;
    const frames = Math.min(3, s.rundown.length);
    if (frames < 2) {
      this.setShot('wide', { focus: seg.anchor, wall: { mode: 'rundown' } });
      return this.say(seg);
    }
    this.setShot('montage', { focus: seg.anchor, storyId: null, card: { index: 0 } });
    const started = now();
    let done = false;
    const speech = this.say(seg).then(() => (done = true));
    for (let i = 1; i < frames || !done; i++) {
      await sleep(MONTAGE_FRAME * 1000);
      if (i < frames) this.setShot('montage', { card: { index: i } });
      else if (!done) await speech;
    }
    await speech;
    const minimum = frames * MONTAGE_FRAME - (now() - started);
    if (minimum > 0) await sleep(minimum * 1000);
    await this.stinger(() => this.setShot('wide', { focus: seg.anchor, wall: { mode: 'logo' }, card: null }));
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
      await this.stinger(() => this.setShot('breakingCard', { storyId: seg.storyId, card: { headline: seg.headline, source: seg.source } }));
      this.audio.sfx('breaking');
      await sleep(3500);
    }
    const shotFor = (i) => {
      const beat = beats[Math.min(i, beats.length - 1)];
      const card =
        beat === 'map'
          ? { ...seg.location }
          : beat === 'fact'
            ? { fact: seg.fact, label: /\d/.test(seg.fact) ? 'BY THE NUMBERS' : 'KEY FACT', source: seg.source }
            : null;
      this.setShot(beat, { focus: seg.anchor, storyId: seg.storyId, wall, card });
    };
    await this.stinger(() => {
      s.lowerThird = {
        headline: seg.headline,
        source: seg.source || '',
        anchorName: presenterName(s.cast[seg.anchor]),
        breaking: seg.breaking,
        since: now() + 0.3,
      };
      shotFor(0);
    });
    await this.say(seg, (i) => i > 0 && shotFor(i));
  }
}
