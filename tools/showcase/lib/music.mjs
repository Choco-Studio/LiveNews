// Showcase recorder: background music beds. The music stream has not wired a
// bed engine into the channel yet, so the recorder renders beds offline from
// a music proposal (public/js/music/proposals/lofi or broadcast), driven by
// the timeline the page logged: the same cue(moment, { programId, emotion })
// calls the director will make once the music stream integrates, plus the
// real speech intervals for the engine's own ducking. Pure rules + one page
// function; nothing here touches product code.

/** Moments understood by both proposals' cue sheets (lofi names; broadcast maps 'map' -> 'roundup'). */
export const MOMENTS = ['openTail', 'headlines', 'story', 'map', 'chat', 'outro', 'standby', 'silence'];

const SHOTS_WITHOUT_BEDS = new Set(['ident', 'ad', 'promo', 'breakingCard', 'start']);

/**
 * Timeline (page log, times in ms of the page clock) -> music cues
 * [{ t, moment, opts: { programId, emotion?, fade? }, why }], sorted.
 * Rules (owner: soft beds per programme and moment, never on grave news,
 * never under ads, smooth changes):
 *  - programme open: the open has its own theme -> beds out under the stinger;
 *  - the cut out of the open -> 'openTail' (the bed enters on the open's chord);
 *  - intro (headline montage) -> 'headlines', at least `tailMs` after the cut so
 *    the open-tail phrase completes;
 *  - story -> 'story' with the segment emotion (grave = silence, by the cue
 *    sheet), round-up items -> 'map', breaking -> silence (the channel plays
 *    its own breaking cue);
 *  - chat -> 'chat', outro -> 'outro';
 *  - end card, ident, ads, promo -> silence (each has its own jingle/cue);
 *  - standby -> the channel's standby bed.
 */
export function deriveCues(log, { tailMs = 2400 } = {}) {
  const events = [...log].sort((a, b) => (a.at ?? a.t) - (b.at ?? b.t));
  const cues = [];
  let program = null;
  let inOpen = false;
  let openEnd = -Infinity;
  const add = (t, moment, opts = {}, why = '') => cues.push({ t, moment, opts: { programId: program, ...opts }, why });
  for (const e of events) {
    const t = e.at ?? e.t;
    if (e.ev === 'playEpisode' && e.phase === 'start') {
      program = e.programId ?? program;
      add(e.t, 'silence', { fade: 0.5 }, 'episode stinger: the open plays its own theme');
    } else if (e.ev === 'playBreak' && e.phase === 'start') {
      add(e.t, 'silence', { fade: 0.6 }, 'break: ident, ads and promo carry their own music');
    } else if (e.ev === 'shot') {
      if (e.programId) program = e.programId;
      if (e.shot === 'open') {
        inOpen = true;
        continue;
      }
      if (inOpen) {
        inOpen = false;
        openEnd = t;
        add(t, 'openTail', {}, 'cut out of the open');
      }
      if (e.shot === 'endcard') add(t, 'silence', { fade: 0.8 }, 'end card: the channel sign-off cue');
      else if (e.shot === 'standby') add(t, 'standby', { programId: 'channel' }, 'standby');
      else if (SHOTS_WITHOUT_BEDS.has(e.shot)) add(t, 'silence', { fade: 0.6 }, `${e.shot}: no bed`);
    } else if (e.ev === 'say' && e.phase === 'start') {
      const emotion = e.emotion || 'neutral';
      if (e.type === 'intro') add(Math.max(e.t, openEnd + tailMs), 'headlines', { emotion }, 'intro / headlines');
      else if (e.type === 'story') {
        if (e.breaking) add(e.t, 'silence', { fade: 0.15 }, 'breaking story');
        else if (e.feature === 'roundup') add(e.t, 'map', { emotion }, 'round-up item');
        else add(e.t, 'story', { emotion }, `story (${emotion})`);
      } else if (e.type === 'chat') add(e.t, 'chat', { emotion }, `chat (${emotion})`);
      else if (e.type === 'outro') add(e.t, 'outro', { emotion }, 'outro');
    }
  }
  cues.sort((a, b) => a.t - b.t);
  // Drop consecutive duplicates (same moment, programme and emotion).
  return cues.filter((c, i) => {
    const p = cues[i - 1];
    return !p || p.moment !== c.moment || p.opts.programId !== c.opts.programId || p.opts.emotion !== c.opts.emotion;
  });
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
      LOOK = mod.LOOKAHEAD ?? 0.6;
      const m = new mod.LofiEngine(ctx, out, { sharedStings: true, gravePad: false, seed: 24 });
      music = {
        pump: (t) => m.pump(t),
        cue: (moment, opts, t) => (moment === 'silence' ? m.toSilence(t, opts.fade ?? 0.8) : m.cue(moment, opts, t)),
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
  const t0 = Date.now();
  const wet = await run(true);
  window.__beds = [wet.L, wet.R];
  if (dry) {
    const d = await run(false);
    window.__bedsDry = [d.L, d.R];
  }
  let peak = 0;
  for (const ch of window.__beds) for (let i = 0; i < ch.length; i += 7) peak = Math.max(peak, Math.abs(ch[i]));
  return { ms: Date.now() - t0, samples: len, peak, log: (wet.log || []).slice(-60) };
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
