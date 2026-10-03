// Recorded presenter voices on the client. The server synthesises every
// spoken segment ahead of air (server/voice) and the episode carries
// `seg.audio = { url, duration, words, phrases, levels }` plus `seg.voiceId`.
// This module decides what the director hands to AudioEngine.speak():
//  - the segment's clip, checked and trimmed to what the engine reads;
//  - a clip that finished after the episode was fetched (late lookup by
//    `voiceId`, bounded so a slow server never delays the show);
//  - the advert voice-overs (/api/voice/ads, by advert id and line text);
//  - nothing, so browser TTS reads the (normalised) text, when there is no
//    clip or the viewer asked for browser voices (?voices=browser).
// It also preloads the next clips so a segment starts without a decode gap.
// AudioEngine plays the clip on its speech bus (volume, mute, ducking), anchors
// the mouth timeline, captions (onSentence) and gesture marks to the recorded
// word times and drives the jaw from `levels` (CONTRACTS: voice integration).
// Never throws: any failure just means the browser voice.

const ID_RE = /^v[0-9a-f]{20}$/;
const ADS_TTL_MS = 60_000;

/** ?voices=browser keeps the browser's speechSynthesis (A/B against the neural voices). */
export function forcedBrowser(search = globalThis.location?.search ?? '') {
  try {
    return new URLSearchParams(search).get('voices') === 'browser';
  } catch {
    return false;
  }
}

/**
 * A recorded voice the engine can play, or null: a same-origin /api/voice url
 * (or a ready AudioBuffer), a positive duration, finite word times sorted by
 * time and a sane loudness envelope.
 */
export function validAudio(a) {
  if (!a || typeof a !== 'object') return null;
  const buffer = a.buffer && typeof a.buffer.getChannelData === 'function' ? a.buffer : null;
  const url = typeof a.url === 'string' && /^\/api\/voice\/v[0-9a-f]{20}\.(ogg|webm|wav|mp3|m4a)$/.test(a.url) ? a.url : null;
  if (!buffer && !url) return null;
  const duration = Number(a.duration);
  if (!buffer && !(duration > 0 && duration < 600)) return null;
  const words = (Array.isArray(a.words) ? a.words : [])
    .map((w) => ({ t: Number(w?.t), char: Number(w?.char), len: Number(w?.len) || 0 }))
    .filter((w) => Number.isFinite(w.t) && w.t >= 0 && Number.isInteger(w.char) && w.char >= 0)
    .sort((x, y) => x.t - y.t);
  const out = { ...(url ? { url } : {}), ...(buffer ? { buffer } : {}), duration: duration > 0 ? duration : buffer?.duration ?? 0, words };
  const lv = a.levels;
  if (lv && Number(lv.rate) > 0 && Number(lv.rate) <= 1000 && Array.isArray(lv.values) && lv.values.length) out.levels = { rate: Number(lv.rate), values: lv.values };
  if (Array.isArray(a.phrases)) out.phrases = a.phrases;
  return out;
}

/** Loudness 0..1 of a clip's envelope at `t` seconds (linear between frames; 0 outside). */
export function levelAt(levels, t) {
  if (!levels || !Array.isArray(levels.values) || !(levels.rate > 0) || !Number.isFinite(t)) return 0;
  const x = t * levels.rate;
  const i = Math.floor(x);
  const v = levels.values;
  const a = i >= 0 && i < v.length ? Number(v[i]) || 0 : 0;
  const b = i + 1 >= 0 && i + 1 < v.length ? Number(v[i + 1]) || 0 : 0;
  return Math.min(1, Math.max(0, a + (b - a) * (x - i)));
}

/** The word being said at `t` (index into words, -1 before the first). */
export function wordAt(words, t) {
  let lo = 0;
  let hi = (words?.length ?? 0) - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export class VoicePlayer {
  /**
   * @param {object} o
   * @param {object} o.audio      AudioEngine (preload(url) is used when present)
   * @param {Function} [o.fetch]  fetch (tests inject one)
   * @param {boolean} [o.enabled] false = always browser voices (default: unless ?voices=browser)
   * @param {number} [o.lookupMs] longest wait for a late clip's timing
   */
  constructor({ audio = null, fetch = globalThis.fetch?.bind(globalThis), enabled = !forcedBrowser(), lookupMs = 700 } = {}) {
    this.audio = audio;
    this.fetch = fetch;
    this.enabled = enabled;
    this.lookupMs = lookupMs;
    this.segments = [];
    this.ads = {};
    this.adsAt = -Infinity;
    this.adsJob = null;
    this.misses = new Map(); // voiceId -> time of the last failed lookup (don't hammer the server)
    this.stats = { recorded: 0, late: 0, browser: 0, ads: 0 };
  }

  /** A new episode is about to air: remember its order and warm up its first clips. */
  episode(ep) {
    this.segments = Array.isArray(ep?.segments) ? ep.segments : [];
    if (!this.enabled) return;
    let n = 0;
    for (const seg of this.segments) {
      const a = validAudio(seg?.audio);
      if (!a?.url) continue;
      this.preload(a.url);
      if (++n >= 2) break;
    }
  }

  preload(url) {
    try {
      this.audio?.preload?.(url);
    } catch { /* best effort */ }
  }

  // Warm up the clips of the next two voiced segments after `seg`.
  preloadAfter(seg) {
    const i = this.segments.indexOf(seg);
    if (i < 0) return;
    let n = 0;
    for (let k = i + 1; k < this.segments.length && n < 2; k++) {
      const a = validAudio(this.segments[k]?.audio);
      if (a?.url) {
        this.preload(a.url);
        n++;
      }
    }
  }

  async getJson(url, ms) {
    if (typeof this.fetch !== 'function') return null;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = 0;
    try {
      const res = await Promise.race([
        this.fetch(url, ctrl ? { signal: ctrl.signal } : undefined),
        new Promise((_, rej) => {
          timer = setTimeout(() => {
            ctrl?.abort();
            rej(new Error('timeout'));
          }, ms);
        }),
      ]);
      if (!res?.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The recorded voice for a segment, or null (browser voice). A clip that was
   * still rendering when the episode was fetched is looked up by `voiceId`
   * (at most `lookupMs`); a hit is stored on the segment for everyone else
   * (v2 direction, replays).
   */
  async audioFor(seg) {
    try {
      if (!this.enabled || !seg) return this.browser();
      let a = validAudio(seg.audio);
      if (!a && typeof seg.voiceId === 'string' && ID_RE.test(seg.voiceId)) {
        const missed = this.misses.get(seg.voiceId);
        if (!(missed && Date.now() - missed < 15_000)) {
          a = validAudio(await this.getJson(`/api/voice/${seg.voiceId}.json`, this.lookupMs));
          if (a) {
            seg.audio = a;
            this.stats.late++;
          } else this.misses.set(seg.voiceId, Date.now());
          if (this.misses.size > 200) this.misses.delete(this.misses.keys().next().value);
        }
      }
      this.preloadAfter(seg);
      if (!a) return this.browser();
      this.stats.recorded++;
      return a;
    } catch {
      return this.browser();
    }
  }

  browser() {
    this.stats.browser++;
    return null;
  }

  /** Fetch the advert voice-over manifest (at most once a minute; never waits long). */
  refreshAds(force = false) {
    if (!this.enabled) return Promise.resolve(this.ads);
    if (this.adsJob) return this.adsJob;
    if (!force && Date.now() - this.adsAt < ADS_TTL_MS) return Promise.resolve(this.ads);
    this.adsJob = this.getJson('/api/voice/ads', 2500).then((m) => {
      if (m && typeof m === 'object') this.ads = m;
      this.adsAt = Date.now();
      this.adsJob = null;
      return this.ads;
    });
    return this.adsJob;
  }

  /** Recorded voice-over for one advert line (exact text), or null. Preloads the line after it. */
  adLine(ad, text, next = null) {
    if (!this.enabled || !ad?.id) return null;
    const lines = this.ads?.[ad.id];
    const a = validAudio(lines?.[text]);
    const after = next ? validAudio(lines?.[next]) : null;
    if (after?.url) this.preload(after.url);
    if (a) this.stats.ads++;
    return a;
  }

  /** Warm up an advert's first lines before its spot starts. */
  prepareAd(ad) {
    const lines = this.ads?.[ad?.id];
    if (!this.enabled || !lines || !Array.isArray(ad.script)) return;
    for (const line of ad.script.slice(0, 2)) {
      const a = validAudio(lines[line.text]);
      if (a?.url) this.preload(a.url);
    }
  }
}
