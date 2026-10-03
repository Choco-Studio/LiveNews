// Voice planning (pure, no I/O): which episode segments get a recorded neural
// voice and exactly what the Kokoro worker is asked to say. Text goes through
// the newsreader rewrite and the per-presenter phrasing of
// public/js/voice/speechtext.js (passed in as `speech`, so this module never
// imports browser code itself), the voice itself comes from the casting sheet
// (server/voice/casting.json). The request also yields the content hash that
// names the cached clip, so the same line by the same voice is synthesised once.
import crypto from 'node:crypto';

// Bump when the recipe below changes in a way that changes the audio.
export const RECIPE = 4; // 4: soft breaths in sentence pauses (tools/voice/dsp.py breath_into, owner 3 Oct)

// Segments a presenter reads aloud.
export const SPOKEN = new Set(['intro', 'story', 'chat', 'outro']);

// Clip ids: 'v' + 20 hex characters of the request hash (safe in URLs and file names).
export const ID_RE = /^v[0-9a-f]{20}$/;

// UNIT-8's vocoder smears consonants below this Kokoro speed (casting, measured).
const ROBOT_MIN_SPEED = 0.82;
// How far a phrase may stray from the presenter's calibrated pace. The casting
// speeds already hit each programme's words-per-minute; the planner only adds
// mood, segment type and figures on top. Slower is allowed (grave stories,
// figures); faster only a touch: Kokoro already reads ~200 wpm inside a
// sentence and the channel runs 24/7 at a calm pace (owner, 18:52).
const REL_MIN = 0.88;
const REL_MAX = 1.04;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round3 = (v) => Math.round(v * 1000) / 1000;

/** The planner's segment type for an episode segment. */
export function segmentType(seg) {
  if (seg.type === 'story') {
    if (seg.breaking) return 'breaking';
    if (seg.feature === 'number' || seg.feature === 'roundup' || seg.feature === 'lighter') return seg.feature;
    return 'story';
  }
  return seg.type;
}

/** True when a segment should be voiced: a spoken type with something to say. */
export function isSpoken(seg) {
  return !!seg && SPOKEN.has(seg.type) && typeof seg.text === 'string' && /[\p{L}\p{N}]/u.test(seg.text);
}

/** 'en-gb' -> 'en-GB' (speechtext), anything else stays as given. */
export function plannerLang(lang) {
  const m = /^([a-z]{2})-([a-z]{2})$/i.exec(String(lang || ''));
  return m ? `${m[1].toLowerCase()}-${m[2].toUpperCase()}` : lang || 'en-US';
}

/**
 * The cast entry for a presenter id, falling back to a voice of the right
 * gender and accent when the casting sheet does not know them (a presenter
 * added to config/channel.json later still gets a neural voice).
 */
export function castFor(presenterId, presenter, casting) {
  const own = casting?.[presenterId];
  if (own?.voice) return own;
  const v = presenter?.voice || {};
  const gb = /gb/i.test(v.lang || '');
  if (v.gender === 'robot') return { voice: 'am_echo:0.7+am_fenrir:0.3', speed: 0.85, lang: 'en-us', effect: 'robot-soft' }; // the owner's pick (3 Oct)
  if (v.gender === 'female') return gb ? { voice: 'bf_lily:0.7+bf_alice:0.3', speed: 1, lang: 'en-gb' } : { voice: 'af_sarah:0.7+af_sky:0.3', speed: 1, lang: 'en-us' };
  return gb ? { voice: 'bm_daniel:0.7+bm_fable:0.3', speed: 1.05, lang: 'en-gb' } : { voice: 'am_eric:0.7+am_liam:0.3', speed: 1.05, lang: 'en-us' };
}

/**
 * Phrase plan for the worker: one synthesis call per sentence or major clause
 * (speechtext `groups`), each with the newsreader text to say, the pause after
 * it and its pace relative to the presenter's calibrated speed.
 */
export function planPhrases(text, { speech, persona, personaId, lang, seg, minRel = REL_MIN }) {
  if (!speech?.planSpeech) return null;
  const plan = speech.planSpeech(text, {
    persona,
    lang,
    emotion: seg?.emotion || 'neutral',
    segmentType: seg ? segmentType(seg) : 'story',
    grave: seg?.emotion === 'serious' || seg?.emotion === 'sad',
    cues: Array.isArray(seg?.cues) ? seg.cues.filter((c) => c && c.emotion && !c.slot) : undefined,
  });
  // The planner's speedFactor includes the persona's own pace, which casting
  // already calibrated into the Kokoro speed: keep only what it adds on top.
  const base = speech.PERSONAS?.[personaId]?.speed || persona?.speed || 1;
  const phrases = [];
  for (const g of plan.groups || []) {
    if (!g.text || !/[\p{L}\p{N}]/u.test(g.say || g.spoken || '')) continue;
    phrases.push({
      text: g.text,
      say: g.say,
      pauseAfter: round3(clamp(Number(g.pauseAfter) || 0, 0, 2)),
      speedFactor: round3(clamp((Number(g.speedFactor) || 1) / base, minRel, REL_MAX)),
    });
  }
  return phrases.length ? phrases : null;
}

/**
 * Worker request (without id/out) for one segment read by `presenterId`.
 * `speech` is the speechtext module (or null: the worker then normalises and
 * phrases the text itself), `presets` the tools/voice/presets.json presets
 * (their processing-chain tweaks apply when the cast uses the same voice).
 */
export function segmentRequest(seg, { presenterId, presenter, casting, presets = {}, speech = null }) {
  const cast = castFor(presenterId, presenter, casting);
  const speed = Number(cast.speed) || 1;
  // 'robot' or one of its softer variants (tools/voice/dsp.py ROBOT_PRESETS; owner 3 Oct)
  const robot = /^robot(-(soft|cabin|warm))?$/.test(cast.effect || '') ? cast.effect : null;
  const lang = String(cast.lang || presenter?.voice?.lang || 'en-us').toLowerCase();
  const persona = speech?.PERSONAS?.[presenterId] ? presenterId : presenter ? { ...presenter, id: presenterId } : 'default';
  let phrases = null;
  try {
    phrases = planPhrases(seg.text, {
      speech,
      persona,
      personaId: presenterId,
      lang: plannerLang(lang),
      seg,
      minRel: robot ? Math.max(REL_MIN, ROBOT_MIN_SPEED / speed) : REL_MIN,
    });
  } catch {
    phrases = null; // the worker's own sentence planner takes over
  }
  const req = { text: seg.text, voice: cast.voice, speed, lang, effect: robot || 'none' };
  if (cast.pauses && typeof cast.pauses === 'object') req.pauses = cast.pauses;
  const preset = presets[presenterId];
  if (preset?.chain && preset.voice === cast.voice) req.chain = preset.chain;
  if (phrases) req.phrases = phrases;
  return req;
}

/** Worker request for one advert voice-over line. */
export function adLineRequest(text, { cast, speech = null }) {
  const speed = Number(cast?.speed) || 1;
  const lang = String(cast?.lang || 'en-gb').toLowerCase();
  let phrases = null;
  try {
    phrases = planPhrases(text, {
      speech,
      persona: { id: 'ad', speed: 1, pause: 1.1, variation: 0.4 },
      personaId: null,
      lang: plannerLang(lang),
      seg: { type: 'ad', emotion: 'neutral' },
    });
  } catch {
    phrases = null;
  }
  const req = { text, voice: cast.voice, speed, lang, effect: 'none' };
  if (cast.pauses) req.pauses = cast.pauses;
  if (phrases) req.phrases = phrases.map((p) => ({ ...p, speedFactor: 1 }));
  return req;
}

/** Stable clip id for a request (+ the engine fingerprint, so engine changes re-render). */
export function clipId(req, fingerprint = '') {
  const body = JSON.stringify([RECIPE, fingerprint, req.text, req.voice, req.speed, req.lang, req.effect, req.pauses || null, req.chain || null, req.phrases || null]);
  return `v${crypto.createHash('sha256').update(body).digest('hex').slice(0, 20)}`;
}

/** What a segment carries for the client (CONTRACTS: segment.audio). */
export function clientAudio(id, meta) {
  return {
    url: `/api/voice/${id}.ogg`,
    duration: meta.duration,
    words: meta.words || [],
    phrases: meta.phrases || [],
    ...(meta.levels ? { levels: meta.levels } : {}),
  };
}

/** Rough speech length of a text in seconds (to budget synthesis and timeouts). */
export function estimateSeconds(text) {
  return String(text || '').length / 14.5;
}
