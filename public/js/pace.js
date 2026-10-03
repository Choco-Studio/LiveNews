// Pace & polish (owner: PACE stream): the single source of truth for every
// on-air timing and cooldown of GLOBIT 24. A 24/7 channel people leave on for
// hours must breathe (owner, 18:52 and 23:10): shots of ~4 s at least (median
// 5-7 s), air between segments, cards readable twice, a slower ticker,
// gestures that rest most of the time, music that changes only at block
// boundaries. Each programme has its own personality inside one network
// rhythm (docs/programmes/*.md): NEWS IN 60 brisk but readable, WORLD NOW
// measured, COSMOS slow and contemplative, TECH BYTES lively but never
// frantic, MONEY MINUTE crisp.
//
// Who reads it (docs/PACING.md has the full map):
//   director.js            segment gaps, holds (sign-off, end card, breaking card,
//                          ident, promo), the open's breathing room, strap timing
//   v2 runtime/direction   minimum shot, stinger guard, the plan's gap after a segment
//   v2 direction/shots.js  minimum shot, studio maxima, picture/map windows
//   graphics/*             strap, ticker and caption in/out/dwell
//   gestures / behaviour   (w2-hands / w2-face read `gestures` / `listener`; CONTRACTS)
//   server (config)        per-programme target length mirrored in config/channel.json
//   tools/pace/analyse.mjs the targets every recording is measured against
//
// Pure data + small pure helpers: DOM-free (node tests, the server and the
// analyser import it), no allocation on the frame path (profiles are frozen and
// built once), deterministic per episode (the only variation, a few percent on
// the pauses so the rhythm never sounds mechanical, is seeded by episode id).

/** Network-wide timings: furniture every programme shares (seconds). */
export const CHANNEL = Object.freeze({
  // the channel stinger (scenes/cards.js STINGER_DURATION; test/pace.test.js keeps them equal):
  // the shot changes under it at half time
  stinger: 0.8,
  // breaks (channel-and-breaks.md 3.2/4.2): ident on air from its stinger's cut; inside the break 0.3 s of black and
  // silence then a hard cut between elements (no stinger between two commercials: ads/index.js BREAK_BLACK); UP NEXT promo.
  // Cadence (24/7: no ad fatigue, owner 18:52): at least `minProgrammeBetween` s of programme between two commercial
  // breaks (a short programme inside that window is joined to the next one by the UP NEXT promo and its stinger only),
  // commercials at most `maxAdShare` of an hour of air (server/station.js decides: request in CONTRACTS)
  breaks: Object.freeze({ ident: 4.0, blackGap: 0.3, promo: 5.5, minProgrammeBetween: 420, maxAdShare: 0.15 }),
  // master control unreachable: the standby card retries every `retry` s; after a playout error the director waits
  // `afterError` s before the next item (never a tight loop)
  standby: Object.freeze({ retry: 6, afterError: 1.5 }),
  // ticker flipper (ART_DIRECTION: 1.5 s + 0.4 s per word; owner 18:52: held longer, gentle; brief: >= 6 s per
  // item): push + base + perWord x words gives 6.45 s for 3 words, 8.2 s for 7, 10.0 s for 11 (pages split longer text)
  ticker: Object.freeze({ push: 0.4, base: 4.7, perWord: 0.45, minHold: 6.0, maxHold: 14, bandIn: 0.35, bandDelay: 0.15, bandOut: 0.25 }),
  // lower third (ART_DIRECTION §4: in 0.35 s ease-out, text 0.1 s later, flip 0.3 s, out 0.25 s;
  // name super 5 s; a long headline pages every `page` s: a page of ~7 words read twice)
  strap: Object.freeze({ in: 0.35, textDelay: 0.1, textRise: 0.3, flip: 0.3, out: 0.25, red: 0.45, name: 5, page: 5.5, breakingPage: 4.5 }),
  // captions follow the voice; a page is never shorter than minPage, lingers `hold` after speech
  captions: Object.freeze({ cps: 15, lead: 4, minPage: 1.4, grace: 0.5, roll: 0.22, hold: 0.6, out: 0.22 }),
  // programme name beside the bug after the open (ART_DIRECTION §4: about 8 s); `window` = the director's
  // cap after the open (the tag never comes back later in the programme)
  programTag: Object.freeze({ delay: 0.5, hold: 8, window: 15 }),
  // silence the playout itself adds between the director's call and a heard word (engine start + clip edges,
  // measured 0.16-0.2 s on recorded voices): the director waits gap - voiceLatency
  voiceLatency: 0.18,
  // reading speed used for every "readable twice" hold (words per second at a comfortable read)
  readWps: 3,
});

/**
 * Transition vocabulary (durations s, easing names from graphics/layout.js and
 * gfx). Cuts are the default between shots and stories; stingers only for the
 * open, breaks and breaking news (ART_DIRECTION §4).
 */
export const TRANSITIONS = Object.freeze({
  // (only transitions whose numbers reach the screen: the stinger = cards.js STINGER_DURATION (tested), the strap's
  // in / out / flip = graphics STRAP_TIMING, the ticker's push = graphics TICKER_TIMING)
  stinger: Object.freeze({ dur: CHANNEL.stinger, ease: 'inOut', cutAt: 0.5 }),
  strapIn: Object.freeze({ dur: CHANNEL.strap.in, ease: 'out' }),
  strapOut: Object.freeze({ dur: CHANNEL.strap.out, ease: 'in' }),
  strapFlip: Object.freeze({ dur: CHANNEL.strap.flip, ease: 'inOut' }),
  tickerPush: Object.freeze({ dur: CHANNEL.ticker.push, ease: 'inOut' }),
});

// ---------------------------------------------------------------------------
// Programme profiles

/**
 * Fields (seconds unless named otherwise):
 *   length    target [min, max] air time from the open's first frame to the end card's last
 *             (config/channel.json `targetSeconds` mirrors it for the writer); `blocks` = the
 *             editorial arc the writer and the mock follow
 *   open      firstWord: cut from the open to the first spoken word (breathing room)
 *   gaps      perceived pause between two segments (voice offset → voice onset):
 *             story (same reader, next story), handover (next story, other reader), chatTurn
 *             (one chat line to the next), intoChat / outOfChat, roundupItem, beforeFinally,
 *             afterIntro, beforeOutro, block (between editorial blocks: after a round-up, a
 *             "still to come"), afterBreakingCard; `jitter` = seeded ± share of each pause
 *   holds     signoff (last word → stinger), endcard, breakingCard, montage (headline beat floor)
 *   shots     min (no cut faster), cooldown (after a cut, no new cut), median [lo, hi] target,
 *             studioMax, singleSoft (split a single beyond this), picture [min, max], map [min, max],
 *             factMin / factMax (a full-screen figure card: readable twice, never a dead hold),
 *             cutsPerMinMax (outside montages), sameFramingRun (identical framings in a
 *             row allowed: 1 = never twice), sameTypeRun (same full-screen type in a row, round-ups
 *             excepted), mapRun (map cuts in a row, round-ups included: pin flights count),
 *             share { map, single } (most of the programme body one shot type may take),
 *             patternRun (stories in a row with the same beat order), tossEvery (about one
 *             hand-over in this many opens on the two-shot), staticMax (a studio hold longer than
 *             this needs a move or a reaction)
 *   moves     camera moves: max per episode, minGap between two, minDur, maxAmount (scale)
 *   strap     inAfterCut, minOnAir, outAtBlock (clear it in a block pause of at least this)
 *   gestures  speaker budget: perMin (marked gestures per minute of own speech), minGap between two
 *             marked gestures, perSentence, beatsPerMin (tiny beats), rest (share of speech with
 *             hands at rest), grave (perMin on grave stories), repeat (same gesture twice in a row);
 *             and the floor against stiffness (owner 20:40 "few gestures, repetitive"): floor (marked
 *             gestures per minute of own speech on light / neutral turns, at least), floorGrave,
 *             vocabWindow (a marked gesture's name never repeats within that presenter's last N),
 *             startShareMax (share of segments whose first marked gesture lands in their first 2 s)
 *   listener  reactions of the presenter who is not speaking: nodsPerTurn, nodGap, glanceGap,
 *             reactionGap (any visible reaction), maxGazeShare, nodsPerMin [min, max] per minute
 *             of listening (alive, never a nodding dog)
 *   music     bed rules: minBed (a bed plays at least this long), changeOn ('block' | 'segment'),
 *             fadeIn / fadeOut, maxChangesPerMin, dryAfterGrave
 */
const BASE = {
  id: 'default',
  label: 'measured',
  length: { target: [300, 480], blocks: [] },
  open: { firstWord: 0.5 },
  gaps: {
    story: 1.0,
    handover: 0.8,
    chatTurn: 0.5,
    intoChat: 0.65,
    outOfChat: 0.85,
    roundupItem: 0.6,
    beforeFinally: 1.2,
    afterIntro: 0.75,
    beforeOutro: 0.95,
    block: 1.3,
    afterBreakingCard: 0.35,
    jitter: 0.08,
  },
  holds: { signoff: 1.5, endcard: 3.2, breakingCard: 2.6, montage: 3.8 },
  shots: {
    min: 4.0,
    cooldown: 4.0,
    median: [5, 7],
    studioMax: 15,
    singleSoft: 11,
    picture: [4, 8],
    map: [5, 10], // a map with its slow pin move may carry a whole short story (BBC holds 8-12 s)
    factMin: 4,
    factMax: 8, // a figure card read twice (≤ 6 words ≈ 4.6 s) plus room; past it the frame is dead
    cutsPerMinMax: 8,
    sameFramingRun: 1,
    sameTypeRun: 2,
    mapRun: 2,
    share: { map: 0.33, single: 0.6 },
    patternRun: 2,
    tossEvery: 3,
    staticMax: 12,
  },
  moves: { max: 4, minGap: 30, minDur: 4, maxAmount: 0.04 },
  strap: { inAfterCut: 1.0, minOnAir: 4, outAtBlock: 1.1 },
  gestures: { perMin: 5, minGap: 5, perSentence: 1, beatsPerMin: 8, rest: 0.6, grave: 2, repeat: false, floor: 2.5, floorGrave: 1, vocabWindow: 3, startShareMax: 0.6 },
  listener: { nodsPerTurn: 1, nodGap: 6, glanceGap: 2.0, reactionGap: 8, maxGazeShare: 0.45, nodsPerMin: [1, 6] },
  music: { minBed: 25, changeOn: 'block', fadeIn: 1.2, fadeOut: 1.8, maxChangesPerMin: 1.5, dryAfterGrave: true },
};

/** Per-programme overrides (deep-merged over BASE). Numbers from the bibles, then the owner's 24/7 rules. */
const PROGRAMMES = {
  'world-now': {
    label: 'measured',
    // 8-10 minutes: headlines, greeting, a strong lead with its analysis exchange, the main
    // stories, a mid-programme "still to come", the round-up, a feature, And finally, a chat
    length: {
      target: [480, 600],
      blocks: ['headlines', 'greeting', 'lead', 'analysis', 'main', 'still-to-come', 'main', 'roundup', 'feature', 'finally', 'chat', 'signoff'],
    },
    open: { firstWord: 0.5 }, // world-now.md: first word 0.5 s after the cut
    gaps: { story: 1.0, handover: 0.85, beforeFinally: 1.2, roundupItem: 0.65 }, // world-now.md: 0.7 s between stories, 1.0 s before And finally
    holds: { signoff: 1.5, endcard: 3.2 },
    shots: { median: [5, 7], studioMax: 15, singleSoft: 11, picture: [4, 8], map: [5, 10] },
    moves: { max: 5, minGap: 40 },
    gestures: { perMin: 5, minGap: 5.5, beatsPerMin: 7, rest: 0.62, grave: 2 },
    listener: { reactionGap: 8 },
  },
  'tech-bytes': {
    label: 'lively, never frantic',
    length: {
      target: [360, 480],
      blocks: ['cold-open', 'greeting', 'lead', 'catch', 'main', 'exchange', 'number', 'still-to-come', 'main', 'exchange', 'finally', 'button', 'signoff'],
    },
    gaps: { story: 0.9, handover: 0.7, chatTurn: 0.42, intoChat: 0.55, outOfChat: 0.75, beforeFinally: 1.0, block: 1.15 }, // tech-bytes.md 0.8 s before And finally
    holds: { signoff: 1.0, endcard: 3.0 },
    shots: { median: [4.5, 6.5], studioMax: 12, singleSoft: 10, picture: [4, 8], map: [5, 9], cutsPerMinMax: 9, share: { map: 0.3, single: 0.55 } },
    moves: { max: 2, minGap: 60 }, // THE CATCH push (the bible's only move), one per exchange
    gestures: { perMin: 6, minGap: 4.5, beatsPerMin: 9, rest: 0.55, grave: 2, floor: 3 },
    listener: { reactionGap: 7, nodsPerMin: [1.5, 7] },
    music: { minBed: 20, maxChangesPerMin: 2 },
  },
  cosmos: {
    label: 'slow and contemplative',
    length: {
      target: [360, 480],
      blocks: ['cold-open', 'greeting', 'lead', 'exchange', 'number', 'main', 'still-to-come', 'main', 'exchange', 'finally', 'idiom', 'signoff'],
    },
    open: { firstWord: 0.7 },
    gaps: { story: 1.3, handover: 1.05, chatTurn: 0.6, intoChat: 0.8, outOfChat: 1.0, beforeFinally: 1.3, afterIntro: 0.9, beforeOutro: 1.15, block: 1.6 },
    holds: { signoff: 1.5, endcard: 3.5 }, // contemplative: the wide lingers after the last word, then the dip
    // cosmos.md: 4 s everywhere, maps 4-6 s, pictures 6-10 s. The map's ceiling is 8.5 s, not the bible's 6: with the
    // owner's 4 s floor and COSMOS' 4.5 s cut cooldown a map can only give way to the reader when 4 + 4.5 s remain, so
    // a shorter map that runs past 6 s cannot be split (the planner cuts it at 4-6 s whenever it can)
    shots: { min: 4.0, cooldown: 4.5, median: [6, 9], studioMax: 15, singleSoft: 11, picture: [6, 10], map: [4, 8.5], factMax: 9, cutsPerMinMax: 7, staticMax: 14 },
    moves: { max: 0, minGap: Infinity }, // cosmos.md: the set camera never moves; only pictures pan
    gestures: { perMin: 3.5, minGap: 6, beatsPerMin: 5, rest: 0.72, grave: 1.5, floor: 1.8, floorGrave: 0.6 }, // cosmos.md: <= 1 per 6 s
    listener: { reactionGap: 10, nodGap: 8, nodsPerMin: [0.6, 4] },
    music: { minBed: 35, fadeIn: 2.0, fadeOut: 2.6, maxChangesPerMin: 1 },
  },
  'money-minute': {
    label: 'crisp',
    length: {
      target: [240, 360],
      blocks: ['intro', 'lead', 'main', 'markets', 'still-to-come', 'main', 'main', 'number', 'signoff'],
    },
    gaps: { story: 0.85, handover: 0.85, block: 1.1, beforeFinally: 1.2, beforeOutro: 0.85 }, // money-minute.md 0.8 s x 3, 1.2 s before the number
    holds: { signoff: 0.6, endcard: 3.0 },
    shots: { median: [5, 7], studioMax: 12, singleSoft: 10, picture: [4, 8], map: [4, 7], cutsPerMinMax: 8 },
    moves: { max: 0, minGap: Infinity }, // money-minute.md: the camera never moves
    gestures: { perMin: 3, minGap: 6, beatsPerMin: 6, rest: 0.7, grave: 1.5, floor: 1.5, floorGrave: 0.5 },
    music: { minBed: 30, maxChangesPerMin: 1 },
  },
  'news-60': {
    label: 'brisk but readable',
    // news-60.md: 55-65 s of air ("NEWS IN 60"); up to 70 s when the six items run long, never two minutes
    length: { target: [55, 70], blocks: ['intro', 'lead', 'items', 'roundup', 'items', 'picture-hold', 'signoff'] },
    open: { firstWord: 0.3 }, // news-60.md: first word 0.3 s after the cut
    gaps: { story: 0.75, handover: 0.75, roundupItem: 0.75, afterIntro: 0.6, beforeOutro: 0.7, block: 0.9, jitter: 0.05 }, // news-60.md 0.7 s between items
    holds: { signoff: 1.0, endcard: 2.6 }, // news-60.md: hold 1 s after the last word
    // news-60.md: ONE map for the round-up, its 2-3 items as pin pans (a run of map shots by design, ~15 s of 60)
    shots: { median: [4, 6], studioMax: 12, singleSoft: 9, picture: [4, 8], map: [4, 8], factMax: 7, cutsPerMinMax: 10, mapRun: 3, share: { map: 0.45, single: 0.6 } },
    moves: { max: 0, minGap: Infinity },
    gestures: { perMin: 2, minGap: 8, beatsPerMin: 5, rest: 0.75, grave: 1, floor: 1, floorGrave: 0.4 },
    listener: { nodsPerMin: [0, 6] }, // solo: no listener
    music: { minBed: 50, maxChangesPerMin: 1.2 },
  },
};

function merge(base, over) {
  const out = {};
  for (const k of Object.keys(base)) {
    const b = base[k];
    const o = over?.[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) ? merge(b, o) : o !== undefined ? o : b;
  }
  for (const k of Object.keys(over || {})) if (!(k in out)) out[k] = over[k];
  return out;
}

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) freeze(v);
  return Object.freeze(o);
}

/** Every profile, built once and frozen: { 'world-now': {...}, ..., default: {...} }. */
export const PACE = freeze(Object.fromEntries([['default', merge(BASE, {})], ...Object.entries(PROGRAMMES).map(([id, o]) => [id, merge(BASE, { ...o, id })])]));

/** Programme ids with their own profile. */
export const PROGRAMME_IDS = Object.freeze(Object.keys(PROGRAMMES));

/** The pace profile of a programme (unknown ids: WORLD NOW's measured rhythm). */
export function paceFor(programId) {
  return PACE[programId] || PACE['world-now'];
}

// ---------------------------------------------------------------------------
// Helpers (pure)

/** FNV-1a → [0, 1): the seeded variation of the pauses (same episode, same rhythm). */
function unit(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

const isStory = (s) => s?.type === 'story';
const inRoundup = (s) => isStory(s) && (s.feature === 'roundup' || !!s.roundup);
const isFinally = (s) => isStory(s) && (s.feature === 'lighter' || /^\W*and finally\b/i.test(String(s.text || '')));
// a signpost that closes a block: the mock's / writer's "Still to come: ..." line (a chat segment or a segment the
// writer flags), never ordinary copy such as "shares fell after this announcement" or "a record is coming up"
const SIGNPOST = /^\W*(?:\[[^\]]*\]\s*)*(?:still to come|coming up (?:after|later|next)|after the break|later in the programme)\b/i;
const isSignpost = (s) => !!s && (s.signpost === true || (s.type === 'chat' && SIGNPOST.test(String(s.text || ''))));

/**
 * Which pause sits between two segments: the gap's NAME in the profile.
 * prev/next = episode segments ({ type, anchor, feature, roundup, text }).
 */
export function gapKind(prev, next) {
  if (!prev || !next) return 'story';
  if (next.type === 'outro') return 'beforeOutro';
  if (prev.type === 'intro') return 'afterIntro';
  if (isSignpost(prev)) return 'block'; // a signpost closes a block
  if (next.type === 'chat' && prev.type === 'chat') return 'chatTurn';
  if (next.type === 'chat') return 'intoChat';
  if (prev.type === 'chat') return isFinally(next) ? 'beforeFinally' : 'outOfChat';
  if (isFinally(next)) return 'beforeFinally';
  if (inRoundup(prev) && inRoundup(next)) return 'roundupItem';
  if (inRoundup(prev) !== inRoundup(next)) return 'block';
  if (next.block) return 'block';
  return prev.anchor && next.anchor && prev.anchor !== next.anchor ? 'handover' : 'story';
}

/**
 * The pause (s) the viewer should hear between segment `i` and segment `i + 1`
 * of an episode, seeded per episode: { kind, gap }. The director waits
 * `gap - already` where `already` is the silence the voice leaves itself.
 */
export function gapAfter(episode, i) {
  const segs = episode?.segments || [];
  const P = paceFor(episode?.program?.id);
  // after the last segment (the sign-off) the shot holds before the stinger to the end card
  if (i >= segs.length - 1) return { kind: 'signoff', gap: P.holds.signoff };
  const kind = gapKind(segs[i], segs[i + 1]);
  const base = P.gaps[kind] ?? P.gaps.story;
  const j = P.gaps.jitter || 0;
  const k = j ? 1 + j * (2 * unit(`${episode?.id || ''}:${i}:gap`) - 1) : 1;
  return { kind, gap: Math.round(base * k * 1000) / 1000 };
}

/** Words in a string (graphics text, captions). */
export function wordCount(text) {
  const m = String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%$£€¥-]*/gu);
  return m ? m.length : 0;
}

/** Seconds to read `text` comfortably TWICE (owner 18:52) at CHANNEL.readWps, plus `pad`, at least `min`. */
export function readTwice(text, { min = 0, pad = 0.6 } = {}) {
  return Math.max(min, (2 * wordCount(text)) / CHANNEL.readWps + pad);
}

/** Ticker item hold for `words` words (s, push included): base + perWord, clamped to [minHold, maxHold]. */
export function tickerHold(words) {
  const T = CHANNEL.ticker;
  return Math.min(T.maxHold, Math.max(T.minHold, T.push + T.base + T.perWord * Math.max(0, words | 0)));
}

/**
 * A full-screen fact/number card hold: readable twice, never under the programme's factMin nor
 * over its factMax (past it the card is a dead frame: the reader comes back).
 */
export function factHold(text, programId) {
  const S = paceFor(programId).shots;
  return Math.min(S.factMax, readTwice(text, { min: S.factMin, pad: 0.8 }));
}

/**
 * The longest a shot may hold on air (s): maps their window, pictures the picture window, figure
 * cards factMax, studio shots studioMax. (The v2 max-hold guard and the analyser use the same rule.)
 */
export function shotMax(programId, shot) {
  const S = paceFor(programId).shots;
  if (shot === 'map') return S.map[1];
  if (shot === 'full') return S.picture[1];
  if (shot === 'fact') return S.factMax;
  return S.studioMax;
}

/**
 * Cut cooldown: may a cut happen at `t` when the shot on air started at
 * `since`? `force` (a montage beat, a breaking stinger) ignores it.
 */
export function cutAllowed(programId, since, t, { force = false } = {}) {
  if (force) return true;
  return t - since >= paceFor(programId).shots.cooldown - 1e-6;
}

/**
 * Seconds to wait before a cut at `t` is allowed (0 = now). The legacy director's
 * MIN_SHOT hold and the v2 studio cuts share this rule.
 */
export function cutWait(programId, since, t) {
  return Math.max(0, paceFor(programId).shots.cooldown - (t - since));
}

/**
 * Shot repetition: is `next` ({ shot, framing, focus }) a repeat the profile forbids
 * after the `recent` shots on air (most recent last)? Identical framings of the same
 * presenter twice in a row are never allowed (a jump cut); the same full-screen type
 * more than `sameTypeRun` times in a row is not either (round-up maps excepted).
 */
export function isRepeat(programId, recent, next, { roundup = false } = {}) {
  if (!next || !recent?.length) return false;
  const P = paceFor(programId).shots;
  const last = recent[recent.length - 1];
  const studio = (s) => s.shot === 'wide' || s.shot === 'close';
  if (studio(next) && studio(last) && (next.framing || next.shot) === (last.framing || last.shot) && (next.focus || null) === (last.focus || null)) return P.sameFramingRun < 2;
  if (studio(next) || roundup) return false;
  let run = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i].shot === next.shot; i--) run++;
  return run >= P.sameTypeRun;
}

/**
 * Gesture budget for a speaker's turn of `seconds` of speech (w2-hands reads this):
 * { marked, beats, minGap } — marked gestures (arm strokes on meaningful words) and
 * tiny beats allowed in that turn; grave turns use the grave rate.
 */
export function gestureBudget(programId, seconds, { grave = false } = {}) {
  const G = paceFor(programId).gestures;
  const min = Math.max(0, seconds) / 60;
  const rate = grave ? G.grave : G.perMin;
  // a turn of a few seconds may still carry one marked gesture when the rate allows any
  const marked = Math.max(rate > 0 && seconds >= G.minGap ? 1 : 0, Math.floor(rate * min + 0.35));
  return { marked, beats: Math.floor(G.beatsPerMin * min + 0.5), minGap: G.minGap, perSentence: G.perSentence, repeat: G.repeat };
}

/** Listener reaction rules (w2-face reads this): { nodsPerTurn, nodGap, glanceGap, reactionGap, maxGazeShare }. */
export function listenerRules(programId) {
  return paceFor(programId).listener;
}

/**
 * Estimated air time (s) of an episode under its profile: speech (recorded
 * durations, else words at `wpm`) + the profile's gaps + open, holds, end card.
 * tools/pace/simulate.mjs and the tests measure scripts with it against
 * `length.target`; wave 3's producer should budget its blocks with it (not wired
 * into the server yet: docs/PACING.md section 8).
 */
export function estimateAir(episode, { wpm = 165, open = 4.0 } = {}) {
  const segs = episode?.segments || [];
  const P = paceFor(episode?.program?.id);
  let t = open + P.open.firstWord;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const d = Number.isFinite(s?.audio?.duration) ? s.audio.duration : (wordCount(s?.text) * 60) / wpm;
    t += d;
    if (s?.breaking) t += CHANNEL.stinger + P.holds.breakingCard;
    if (i + 1 < segs.length) t += gapAfter(episode, i).gap;
  }
  return t + P.holds.signoff + CHANNEL.stinger + P.holds.endcard;
}

/**
 * Timeline trace for the pace analyser: when the showcase recorder's page
 * instrumentation is present (window.__sc.log), push one event; otherwise a
 * no-op (nothing is kept, so a 24/7 page never grows).
 */
export function paceTrace(ev) {
  const sc = typeof globalThis !== 'undefined' ? globalThis.__sc : null;
  if (!sc || !Array.isArray(sc.log)) return;
  try {
    ev.ev = 'pace';
    ev.t = typeof performance !== 'undefined' ? performance.now() : Date.now();
    sc.log.push(ev);
  } catch {
    /* tracing must never break playout */
  }
}
