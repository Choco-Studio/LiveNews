// Showcase recorder: background music beds. The music stream has not wired a
// bed engine into the channel yet, so the recorder renders beds offline from
// a music proposal (public/js/music/proposals/lofi or broadcast), driven by
// the timeline the page logged: the same cue(moment, { programId, emotion })
// calls the director will make once the music stream integrates, plus the
// real speech intervals for the engine's own ducking. Pure rules + one page
// function; nothing here touches product code.

// Director moments, in the vocabulary of the lofi proposal's cue sheet (v2,
// docs/programmes/*.md): segment moments (headlines, coldOpen, greeting, story,
// roundup, number, finally, chat, outro) carry { segment, emotion, grave,
// breaking }; accents (pip, item, shot, featureEnd, introEnd, signoffEnd) are
// sent only to the programmes whose bible uses them, because a programme
// policy answers an unknown moment with silence.
const ACCENTS = {
  pip: new Set(['world-now']),
  item: new Set(['news-60']),
  shot: new Set(['cosmos']),
  featureEnd: new Set(['tech-bytes']),
  introEnd: new Set(['money-minute']),
};
const GREETING_RE = /^\s*(good (morning|afternoon|evening|night)|hello|hi\b|welcome|this is|i'm|i am|tonight on|you're watching)/i;
const SHOT_KIND = { map: 'map', full: 'picture', fact: 'presenter', close: 'presenter', wide: 'presenter' };
const byTime = (a, b) => (a.at ?? a.t) - (b.at ?? b.t);

/**
 * Timeline (page log, times in ms of the page clock) -> music cues
 * [{ t, moment, opts: { programId, ... }, why }], sorted. The calls the director
 * will make once the music stream integrates: 'open' on the episode stinger
 * (the open plays its own theme), headline lines and pips on the headline
 * sentences, 'greeting' on the first greeting sentence, one segment moment per
 * segment (features: roundup -> 'roundup', lighter -> 'finally', number ->
 * 'number'), 'signoffEnd' after the last word of the outro, 'endcard', silence
 * at the break, 'ad' at every spot, 'upNext' on the promo, 'standby'.
 * Grave stories are 'story' with { emotion, grave: true }: the cue sheet keeps
 * them (and the segment after them) dry.
 */
export function deriveCues(log, { headlineLead = 0.3 } = {}) {
  const events = [...log].sort(byTime);
  const speech = events
    .filter((e) => e.ev === 'speech' && typeof e.text === 'string' && e.text.trim() && e.volume > 0)
    .map((e) => ({ start: e.t, end: e.cut != null ? Math.min(e.cut, e.end) : e.end, text: e.text }));
  const ends = new Map(events.filter((e) => e.ev === 'say' && e.phase === 'end').map((e) => [e.ref, e.t]));
  const cues = [];
  let program = null;
  let segment = 0;
  let inStory = false;
  const add = (t, moment, opts = {}, why = '') => {
    if (ACCENTS[moment] && !ACCENTS[moment].has(opts.programId ?? program)) return;
    cues.push({ t, moment, opts: { programId: program, ...opts }, why });
  };
  const ms = (s) => s * 1000;
  for (const e of events) {
    const t = e.at ?? e.t;
    if (e.ev === 'playEpisode' && e.phase === 'start') {
      program = e.programId ?? program;
      segment = 0;
      add(e.t, 'open', {}, 'episode stinger: the open plays its own theme');
    } else if (e.ev === 'playBreak' && e.phase === 'start') {
      inStory = false;
      add(e.t, 'silence', { programId: 'channel' }, 'break: the ident jingle and the ads carry their own music');
    } else if (e.ev === 'playAd' && e.phase === 'start') {
      add(e.t, 'ad', { programId: 'channel' }, `ad ${e.adId}`);
    } else if (e.ev === 'shot') {
      if (e.programId) program = e.programId;
      if (e.shot === 'endcard') add(t, 'endcard', {}, 'end card');
      else if (e.shot === 'standby') add(t, 'standby', { programId: 'channel' }, 'standby');
      else if (e.shot === 'promo') add(t, 'upNext', { programId: 'channel', next: e.card?.next ?? null, seconds: 4.2 }, 'promo: the channel plays its up-next cue');
      else if (inStory && SHOT_KIND[e.shot]) add(t, 'shot', { kind: SHOT_KIND[e.shot] }, `shot ${e.shot}`);
    } else if (e.ev === 'say' && e.phase === 'start') {
      segment++;
      const end = ends.get(e.t) ?? Infinity;
      const words = speech.filter((u) => u.start >= e.t - 5 && u.start < end);
      const last = words[words.length - 1];
      const emotion = e.emotion || 'neutral';
      const grave = emotion === 'serious' || emotion === 'sad';
      inStory = e.type === 'story';
      if (e.type === 'intro') {
        if (program === 'cosmos') add(e.t, 'coldOpen', { segment }, 'intro (cosmos cold open)');
        else {
          let n = 0;
          while (n < Math.min(3, words.length) && !GREETING_RE.test(words[n].text)) n++;
          if (!n) add(e.t, 'headlines', { segment }, 'intro');
          for (let i = 0; i < n; i++) {
            add(Math.max(e.t, words[i].start - ms(headlineLead)), 'headlines', { line: i, lines: n, segment }, `headline ${i + 1}/${n}`);
            add(words[i].end + 100, 'pip', { line: i, lines: n }, `pip after headline ${i + 1}`);
          }
          const greet = words[n];
          if (n && greet) add(greet.start - 200, 'greeting', { segment: ++segment }, 'greeting');
        }
        if (last) add(last.end + 100, 'introEnd', {}, 'end of the intro');
      } else if (e.type === 'story') {
        add(e.t - 20, 'item', {}, 'item cut');
        const moment = e.breaking ? 'story' : e.feature === 'roundup' ? 'roundup' : e.feature === 'lighter' ? 'finally' : e.feature === 'number' ? 'number' : 'story';
        add(e.t, moment, { emotion, grave, breaking: Boolean(e.breaking), segment }, `${moment} (${emotion}${e.breaking ? ', breaking' : ''})`);
        if (e.feature === 'lighter' && last) add(last.end + 150, 'featureEnd', {}, 'end of the feature');
      } else if (e.type === 'chat') {
        add(e.t, 'chat', { emotion, grave, segment }, `chat (${emotion})`);
      } else if (e.type === 'outro') {
        add(e.t, 'outro', { emotion, segment }, 'outro');
        if (last) add(last.end + 120, 'signoffEnd', {}, 'after the last word of the sign-off');
      }
    }
  }
  return cues.sort((a, b) => a.t - b.t);
}

/** Speech clips [{ start, end }] (any unit) -> merged regions; gaps under `gap` bridge (no pumping). */
export function speechRegions(clips, gap = 0.6) {
  const sorted = clips.filter((c) => c.end > c.start).map((c) => [c.start, c.end]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] - last[1] < gap) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

/** Grave and ad intervals (seconds, relative to `origin` ms) for the silence checks. */
export function quietIntervals(log, origin) {
  const out = [];
  const open = new Map();
  for (const e of [...log].sort((a, b) => a.t - b.t)) {
    if (e.ev === 'say' && e.phase === 'start' && (e.emotion === 'serious' || e.emotion === 'sad')) open.set(e.t, { kind: 'grave', from: e.t });
    if (e.ev === 'say' && e.phase === 'end' && open.has(e.ref)) {
      const x = open.get(e.ref);
      open.delete(e.ref);
      // The bed fades over 2.5 s into a grave story: judge the part after the fade.
      out.push({ kind: x.kind, from: (x.from - origin) / 1000 + 3, to: (e.t - origin) / 1000 });
    }
    if (e.ev === 'playAd' && e.phase === 'start') open.set(e.t, { kind: 'ad', from: e.t });
    if (e.ev === 'playAd' && e.phase === 'end' && open.has(e.ref)) {
      const x = open.get(e.ref);
      open.delete(e.ref);
      out.push({ kind: 'ad', from: (x.from - origin) / 1000 + 1, to: (e.t - origin) / 1000 });
    }
  }
  return out.filter((x) => x.to - x.from > 0.5);
}

/**
 * Runs IN THE BROWSER (page.evaluate) on a page of the channel's own origin:
 * imports the proposal, drives it on an OfflineAudioContext with the cues and
 * speech regions (seconds from the render start), renders, and keeps the
 * stereo result in window.__beds (and window.__bedsDry: the same cues with no
 * speech, for measuring the duck). Returns a small summary.
 */
export async function renderBedsInPage({ engine, cues, speech, seconds, sampleRate, dry }) {
  const sr = sampleRate;
  const len = Math.max(1, Math.ceil(seconds * sr));
  let version = engine;
  const run = async (withSpeech) => {
    const ctx = new OfflineAudioContext(2, len, sr);
    const out = ctx.createGain();
    out.connect(ctx.destination);
    let music;
    let LOOK = 0.6;
    if (engine === 'broadcast') {
      const mod = await import('/js/music/proposals/broadcast/index.js');
      const m = new mod.BroadcastMusic({ context: ctx, destination: out, grave: 'silence' });
      LOOK = 1.6;
      music = {
        pump: (t) => m.pump(t),
        cue: (moment, opts, t) => m.cue(moment === 'map' ? 'roundup' : moment, { ...opts, at: t }),
        speak: (on, t) => m.speech(on, t),
        log: () => m.log ?? [],
      };
    } else {
      const mod = await import('/js/music/proposals/lofi/engine.js');
      const sheet = await import('/js/music/proposals/lofi/cuesheet.js');
      LOOK = mod.LOOKAHEAD ?? 0.6;
      const v2 = Boolean(sheet.SEGMENT_MOMENTS);
      version = v2 ? 'lofi v2 (programme bibles)' : 'lofi v1';
      const m = new mod.LofiEngine(ctx, out, { sharedStings: true, gravePad: false });
      // The first cue sheet knew fewer moments: map the director's calls down to it.
      const V1 = { pip: null, item: null, shot: null, featureEnd: null, introEnd: null, signoffEnd: null, open: 'silence', greeting: null, ad: 'silence', finally: 'story', coldOpen: 'headlines', upNext: 'silence', roundup: 'map', number: 'story' };
      music = {
        pump: (t) => m.pump(t),
        cue: (moment, opts, t) => {
          let mm = moment;
          let o = opts;
          if (!v2 && mm in V1) {
            mm = V1[mm];
            if (!mm) return;
            if (moment === 'finally' || moment === 'number') o = { ...opts, emotion: 'happy' };
          }
          m.cue(mm, o, t);
        },
        speak: (on, t) => m.setSpeaking(on, t),
        log: () => m.log,
      };
    }
    const events = cues.map((c) => ({ t: Math.max(0, c.t), cue: c.moment, opts: c.opts }));
    if (withSpeech) {
      for (const [a, b] of speech) {
        events.push({ t: Math.max(0, a - 0.08), speak: true }); // the duck leads the first syllable slightly
        events.push({ t: Math.max(0, b), speak: false });
      }
    }
    events.sort((x, y) => x.t - y.t || (x.cue ? -1 : 1));
    for (const e of events) {
      music.pump(e.t + LOOK);
      if (e.cue) music.cue(e.cue, e.opts, e.t);
      else music.speak(e.speak, e.t);
    }
    music.pump(seconds + 2);
    const buf = await ctx.startRendering();
    return { L: buf.getChannelData(0), R: buf.getChannelData(1), log: music.log() };
  };
  const wet = await run(true);
  window.__beds = [wet.L, wet.R];
  if (dry) {
    const d = await run(false);
    window.__bedsDry = [d.L, d.R];
  }
  let peak = 0;
  for (const ch of window.__beds) for (let i = 0; i < ch.length; i += 7) peak = Math.max(peak, Math.abs(ch[i]));
  return { version, samples: len, peak, log: (wet.log || []).slice(-80) };
}

/** Runs in the browser: base64 of a slice of window.__beds / __bedsDry channel `ch`. */
export function bedChunkInPage([which, ch, from, count]) {
  const src = which === 'dry' ? window.__bedsDry : window.__beds;
  const a = src[ch].subarray(from, from + count);
  const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
