// Pace & polish (owner: PACE stream): the single source of truth for every
// on-air timing and cooldown of GLOBIT 24. A 24/7 channel people leave on for
// hours must breathe (owner, 18:52 and 23:10): shots of ~4 s at least (median
// 5-7 s), air between segments, cards readable twice, a slower ticker,
// gestures that rest most of the time, music that changes only at block
// boundaries. Each programme has its own personality inside one network
// rhythm (docs/programmes/*.md): NEWS IN 60 brisk but readable, WORLD NOW
// measured, COSMOS slow and contemplative, TECH BYTES lively but never
// frantic, MONEY MINUTE crisp, SEVEN DAYS unhurried and warm.
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
  // the channel's ident (scenes/opens/ident.js: GLOBIT 24, its slogan, and the AI notice under them; compliance.md §3;
  // owner, 18 Oct: "deja solo esta versión"): before every programme, after its break, `hold` s from its stinger's
  // cut, the continuity voice saying "This is GLOBIT 24, AI-produced news."; a filler break (no programme ready) gets
  // one first once `refresh` s have passed since the last, so the stream never runs long without it. It is the
  // channel's own card: never inside a break (the bumper, the spots, the promo and the countdown carry no notice),
  // never over a programme
  ident: Object.freeze({ hold: 5.0, refresh: 600 }),
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
  captions: Object.freeze({ cps: 15, lead: 4, minPage: 1.4, grace: 0.5, roll: 0.22, wipe: 0.3, hold: 0.6, out: 0.3 }),
  // programme name beside the bug after the open (ART_DIRECTION §4: about 8 s); `window` = the director's
  // cap after the open (the tag never comes back later in the programme)
  programTag: Object.freeze({ delay: 0.5, hold: 8, window: 15 }),
  // silence the playout itself adds between the director's call and a heard word (engine start + clip edges,
  // measured 0.16-0.2 s on recorded voices): the director waits gap - voiceLatency
  voiceLatency: 0.18,
  // reading speed used for every "readable twice" hold (words per second at a comfortable read)
  readWps: 3,
});

/** Seconds the channel's ident adds before an item: the stinger into it (half of it before the cut) and its hold. */
export const IDENT_AIR = CHANNEL.ident.hold + CHANNEL.stinger / 2;

/**
 * Does the channel's ident air before this item? Before every programme (a replay too); before a filler break only when
 * `since` (seconds since the last ident) has reached CHANNEL.ident.refresh. Never before an ordinary break: the
 * programme after it opens with one.
 */
export function identBefore(item, since = Infinity) {
  if (item?.kind === 'episode') return true;
  return item?.kind === 'break' && !!item.filler && since >= CHANNEL.ident.refresh;
}

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
 *             this needs a move or a reaction), pan { speed, ease } (the full-screen picture's drift)
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
    link: 0.4, // between the parts of a correspondent link (the hand-over, the piece, the prompt, the answer, the thanks)
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
    // the full-screen picture's pan (picturePan): px/s once under way, s of ease from rest (bibles: at most 4 px/s;
    // 3 px/s is one whole pixel every 10 frames at 30 fps)
    pan: { speed: 3, ease: 1.2 },
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
    // 9-10 minutes (owner 4 Oct: longer, and not presenter after presenter; within the owner's 10-minute ceiling of
    // 23:10): headlines, greeting, a strong lead
    // handed to a correspondent (the link: piece over the place's footage, a prompt, the answer), the main stories,
    // a mid-programme "still to come", a second link to another desk, the round-up, a feature, And finally, a chat
    length: {
      target: [540, 600],
      blocks: ['headlines', 'greeting', 'lead', 'link', 'main', 'still-to-come', 'main', 'link', 'roundup', 'feature', 'finally', 'chat', 'signoff'],
    },
    open: { firstWord: 0.5 }, // world-now.md: first word 0.5 s after the cut
    gaps: { story: 1.0, handover: 0.85, beforeFinally: 1.2, roundupItem: 0.65 }, // world-now.md: 0.7 s between stories, 1.0 s before And finally
    holds: { signoff: 1.5, endcard: 3.2 },
    shots: { median: [5, 7], studioMax: 15, singleSoft: 11, picture: [4, 8], map: [5, 10], quoteCard: true, stillToCome: true, numbers: true, known: true, timeline: true, change: true, proportion: true, next: true, who: true }, // quoteCard: IN THEIR WORDS on a story's sourced quote; stillToCome: the signpost over its stories; numbers / known / timeline / change / proportion / next / who: BY THE NUMBERS, WHAT WE KNOW, HOW WE GOT HERE, FROM → TO, IN PROPORTION, WHAT HAPPENS NEXT and WHO'S WHO boards
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
    // the format round (owner 4 Oct): STILL TO COME over its stories, BY THE NUMBERS and WHAT WE KNOW boards, IN
    // THEIR WORDS on a sourced quote, and IN PLAIN ENGLISH while Ada translates a story's jargon
    shots: { median: [4.5, 6.5], studioMax: 12, singleSoft: 10, picture: [4, 8], map: [5, 9], cutsPerMinMax: 9, share: { map: 0.3, single: 0.55 }, quoteCard: true, stillToCome: true, numbers: true, known: true, timeline: true, change: true, proportion: true, next: true, who: true, terms: true },
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
    // the format round (owner 4-5 Oct): STILL TO COME over its stories, BY THE NUMBERS and WHAT WE KNOW boards, IN
    // THEIR WORDS on a sourced quote, and UNIT-8's definition card
    shots: { min: 4.0, cooldown: 4.5, median: [6, 9], studioMax: 15, singleSoft: 13, picture: [6, 10], map: [4, 8.5], factMax: 9, cutsPerMinMax: 7, staticMax: 14, pan: { speed: 2, ease: 1.6 }, quoteCard: true, stillToCome: true, numbers: true, known: true, timeline: true, change: true, proportion: true, next: true, who: true, terms: true },
    moves: { max: 0, minGap: Infinity }, // cosmos.md: the set camera never moves; only pictures pan
    gestures: { perMin: 3.5, minGap: 6, beatsPerMin: 5, rest: 0.72, grave: 1.5, floor: 1.8, floorGrave: 0.6 }, // cosmos.md: <= 1 per 6 s
    listener: { reactionGap: 10, nodGap: 8, nodsPerMin: [0.6, 4] },
    music: { minBed: 35, fadeIn: 2.0, fadeOut: 2.6, maxChangesPerMin: 1 },
  },
  'money-minute': {
    label: 'crisp',
    length: {
      target: [240, 360],
      blocks: ['intro', 'lead', 'plain-english', 'main', 'still-to-come', 'main', 'in-brief', 'number', 'signoff'],
    },
    gaps: { story: 0.85, handover: 0.85, block: 1.1, beforeFinally: 1.2, beforeOutro: 0.85 }, // money-minute.md 0.8 s x 3, 1.2 s before the number
    holds: { signoff: 0.6, endcard: 3.0 },
    // the format round (owner 4 Oct, 9 Oct for MONEY MINUTE): STILL TO COME over its stories, BY THE NUMBERS and WHAT WE
    // KNOW boards, IN THEIR WORDS on a sourced quote, and IN PLAIN ENGLISH while Penny translates a story's jargon
    shots: { median: [5, 7], studioMax: 12, singleSoft: 10, picture: [4, 8], map: [4, 7], cutsPerMinMax: 8, quoteCard: true, stillToCome: true, numbers: true, known: true, timeline: true, change: true, proportion: true, next: true, who: true, terms: true },
    moves: { max: 0, minGap: Infinity }, // money-minute.md: the camera never moves
    gestures: { perMin: 3, minGap: 6, beatsPerMin: 6, rest: 0.7, grave: 1.5, floor: 1.5, floorGrave: 0.5 },
    music: { minBed: 30, maxChangesPerMin: 1 },
  },
  'world-weather': {
    label: 'calm and continuous',
    // WORLD WEATHER is one continuous shot: the camera follows the presenter along the map wall (scenes/weather);
    // between two segments a short breath only, the walk to the next zone runs under the next first words
    length: { target: [270, 480], blocks: ['intro', 'zones', 'warnings', 'tomorrow', 'signoff'] },
    open: { firstWord: 0.6 },
    gaps: { weather: 0.55 },
    holds: { signoff: 1.2, endcard: 3.0 },
    moves: { max: 0, minGap: Infinity }, // no camera moves of the studio kind: the weather centre tracks him itself
    music: { minBed: 40, maxChangesPerMin: 1 },
  },
  'seven-days': {
    label: 'unhurried, warm',
    // seven-days.md: the week at the weekend, retold from the archive (server/weeklywriter.js): calmer than WORLD NOW,
    // room to read HOW THE WEEK UNFOLDED and the week's numbers, and a minute for the seven days in sixty seconds
    length: {
      target: [330, 480],
      blocks: ['headlines', 'greeting', 'story-of-the-week', 'coverage', 'latest', 'expert', 'week-in-60', 'desks', 'numbers', 'words', 'finally', 'signoff'],
    },
    open: { firstWord: 0.6 },
    // a little more air than WORLD NOW between stories; the round-up's days keep their own brisk step so the
    // seven days fit their minute
    gaps: { story: 1.15, handover: 0.95, chatTurn: 0.55, intoChat: 0.7, outOfChat: 0.95, roundupItem: 0.7, beforeFinally: 1.4, afterIntro: 0.85, beforeOutro: 1.1, block: 1.5 },
    holds: { signoff: 1.8, endcard: 3.4 }, // the week's last word lingers on the wide before the end card
    // a day of the round-up stays on its picture for its whole sentence (shot: 'full'); the boards are read twice:
    // HOW THE WEEK UNFOLDED carries up to five days (timelineSteps)
    shots: { median: [5.5, 8], studioMax: 15, singleSoft: 11, picture: [4.5, 9], map: [5, 10], factMin: 4.5, factMax: 10, cutsPerMinMax: 7, staticMax: 13, quoteCard: true, numbers: true, known: true, timeline: true, timelineSteps: 5, change: true },
    moves: { max: 3, minGap: 45 },
    gestures: { perMin: 4.5, minGap: 6, beatsPerMin: 6, rest: 0.66, grave: 1.5, floor: 2 },
    listener: { reactionGap: 9, nodsPerMin: [0.8, 5] },
    music: { minBed: 30, fadeIn: 1.6, fadeOut: 2.2, maxChangesPerMin: 1.2 },
  },
  'full-time': {
    label: 'punchy, never shouty',
    // full-time.md §4: 6-8 minutes; MATCHDAY, MIDWEEK or PREVIEW in that order of blocks (a block without material is
    // skipped). Lively like TECH BYTES (two presenters, a magazine), the results read crisply; SCORE CENTRE and COMING
    // UP are board segments (the board on air for the segment, its rows and leaves timed to the voice: director.js
    // playBoardSegment), held up to scoresMax
    length: {
      target: [360, 480],
      blocks: ['headlines', 'greeting', 'lead', 'score-centre', 'breakdown', 'grounds', 'number', 'moment', 'coming-up', 'signoff'],
    },
    open: { firstWord: 0.5 },
    gaps: { story: 0.85, handover: 0.75, chatTurn: 0.45, intoChat: 0.6, outOfChat: 0.8, beforeFinally: 1.1, block: 1.1 },
    holds: { signoff: 1.2, endcard: 3.0 },
    // the boards (full-time.md §5): a story's strongest, never the same type twice in a row: the scoreline, THE MOMENT
    // ON THE BOARD, WHO'S WHO, IN PROPORTION, WHAT HAPPENS NEXT, WHAT WE KNOW; IN THEIR WORDS on a sourced quote. No
    // BY THE NUMBERS (THE NUMBER is its own segment), no timeline or FROM → TO (the bible's boards are these), and no
    // plain KEY FACT card (factCard false: a story without one of its boards stands on its picture; THE NUMBER keeps
    // its card)
    // the visual-variety round (owner, 18 Oct): WHERE THEY STAND and THE RUN from a story's own words, the sport's slate
    // and MOMENT OF THE DAY's board (slate, moment), SCORE CENTRE in two pictures (the stadium's board, then the wall,
    // so no picture holds past 12 s: scoresMax), up to 10 cuts a minute; studio shots planned to 11 s, a single split past
    // 9 (the voice runs a little past its plan and a cut lands on a word: planned at 12, singles aired 12.4-13.5 s)
    shots: { median: [4.5, 6.5], studioMax: 11, singleSoft: 9, picture: [4, 8], map: [4, 8], cutsPerMinMax: 10, scoresMax: 12, factCard: false, quoteCard: true, score: true, chalk: true, fixtures: true, proportion: true, next: true, who: true, known: true, standing: true, form: true, slate: true, moment: true },
    moves: { max: 2, minGap: 60 },
    gestures: { perMin: 5.5, minGap: 5, beatsPerMin: 8, rest: 0.58, grave: 2, floor: 2.5 },
    listener: { reactionGap: 7, nodsPerMin: [1.2, 6] },
    music: { minBed: 25, maxChangesPerMin: 1.5 },
  },
  'pay-attention': {
    label: 'quick and warm, a game',
    // pay-attention.md §4: 300-345 s at the voices' rate, up to 360 s with a tie-break (targetSeconds [290, 360]). The
    // open, the welcome and the players, three rounds of three questions (TODAY OR NOT TODAY: six headlines), the
    // scores at half time, DOUBLE OR NOTHING, the result and the week's table, the sign-off. A game moves: short
    // turns between the host and the players, a question played as one board segment (director.js: the countdown
    // on the bed's half notes, the lock-ins and buzzes on its clock, the reveal on its last tick)
    length: {
      target: [290, 360],
      blocks: ['open', 'welcome', 'round', 'round', 'scores', 'round', 'double', 'result', 'table', 'signoff'],
    },
    open: { firstWord: 0.5 },
    // the quiz's own pauses (gapKind: both segments are the quiz's): quizTurn between two lines of one exchange,
    // quizReact before a player's reaction (a reply comes quickly), quizNext before the next question, quizCard
    // from a round's card into its first question, quizBlock before a round, the scores, DOUBLE OR NOTHING or the
    // result; inside a question the director keeps its own beats (the countdown's clock)
    gaps: { story: 0.8, handover: 0.5, chatTurn: 0.4, quizTurn: 0.45, quizReact: 0.35, quizNext: 0.75, quizCard: 0.55, quizBlock: 0.95, beforeOutro: 0.85, jitter: 0.05 },
    holds: { signoff: 1.2, endcard: 3.0 },
    // the shots (director.js playQuiz, quizplay.js planQuizShots): the quiz's wide, the host's single, the players'
    // singles and the boards; never faster than the network's 4 s; a studio shot at most 12 s; a question board holds
    // its whole question (quizMax: PICTURE THIS runs about 27 s from its frame to its reveal). The median band is the
    // measured one (18 editions, 4.1-5.5 s), inside the owner's floor: the players' faces on every question (their
    // answers, the verdicts, the reactions) and the boards back for the reveals hold the network's 4 s, the reading
    // boards 9-23 s
    shots: { median: [4, 6.5], studioMax: 12, singleSoft: 10, cutsPerMinMax: 10, quiz: true, quizMax: 40 },
    moves: { max: 2, minGap: 60 }, // the visual-variety round: a push in on the welcome's wide, a pull out on the sign-off's (quizplay.js); the rest locked off
    gestures: { perMin: 5, minGap: 4.5, beatsPerMin: 7, rest: 0.6, grave: 2, floor: 2.5 },
    listener: { reactionGap: 7, nodsPerMin: [1, 6] },
    music: { minBed: 20, maxChangesPerMin: 2 },
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
  if (prev.type === 'quiz' && next.type === 'quiz') return quizGap(prev, next);
  if (next.type === 'outro') return 'beforeOutro';
  if (prev.type === 'intro') return 'afterIntro';
  if (next.type === 'cross') return 'link'; // a correspondent link: the two-way keeps its turns close
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

// PAY ATTENTION's parts that open a block (pay-attention.md §4): a round's card, the scores, DOUBLE OR NOTHING, the
// tie-break, the result
const QUIZ_BLOCK = new Set(['round', 'scores', 'don', 'tie', 'result']);
/** The pause between two of PAY ATTENTION's segments (server/quiz/writer.js parts). */
function quizGap(prev, next) {
  if (next.part === 'signoff') return 'beforeOutro';
  if (QUIZ_BLOCK.has(next.part)) return 'quizBlock';
  if (next.part === 'react' || next.part === 'pick') return 'quizReact';
  if (prev.part === 'round' || prev.part === 'tie') return 'quizCard';
  if (next.part === 'frame') return 'quizNext';
  return 'quizTurn';
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
 * BY THE NUMBERS (pace shots.numbers): a story's figures as a board when it states two or more (seg.numbers, each
 * spoken: the writer keeps only those), at most three, one per value; null otherwise (its fact card as before),
 * and on the number of the day.
 */
export function numbersBoard(seg, programId) {
  if (!paceFor(programId).shots.numbers || !Array.isArray(seg?.numbers) || seg.feature === 'number') return null; // the number of the day keeps its own card
  if (changeBoard(seg, programId)) return null; // a figure that moved says it better as FROM → TO
  const seen = new Set();
  const rows = seg.numbers.filter((n) => n?.value && n.label && !seen.has(n.value) && seen.add(n.value)).slice(0, 3);
  return rows.length >= 2 ? rows : null;
}

/**
 * FROM → TO (pace shots.change): one figure that moved, as the story says it ("from 4.5% to 4.75%"): seg.change
 * { from, to, label }, the writer's, grounded; null otherwise (never on the number of the day, which keeps its card).
 */
export function changeBoard(seg, programId) {
  const c = seg?.change;
  if (!paceFor(programId).shots.change || !c || seg.feature === 'number') return null;
  return typeof c.from === 'string' && c.from.trim() && typeof c.to === 'string' && c.to.trim() && typeof c.label === 'string' && c.label.trim() ? c : null;
}

/** WHAT WE KNOW (pace shots.known): a story's key points as a board (seg.known: two or three); null otherwise. */
export function knownBoard(seg, programId) {
  if (!paceFor(programId).shots.known || !Array.isArray(seg?.known)) return null;
  const points = seg.known.filter((k) => typeof k === 'string' && k.trim()).slice(0, 3);
  return points.length >= 2 ? points : null;
}

/**
 * HOW WE GOT HERE (pace shots.timeline): a story's dated steps as a board (seg.timeline: two or three
 * { when, what } in order, the writer's, grounded; SEVEN DAYS's HOW THE WEEK UNFOLDED up to shots.timelineSteps,
 * a day each); null otherwise, or when the story has a WHAT WE KNOW board (one card a story).
 */
export function timelineBoard(seg, programId) {
  const S = paceFor(programId).shots;
  if (!S.timeline || !Array.isArray(seg?.timeline) || knownBoard(seg, programId)) return null;
  const steps = seg.timeline.filter((p) => p && typeof p.when === 'string' && p.when.trim() && typeof p.what === 'string' && p.what.trim()).slice(0, S.timelineSteps || 3);
  return steps.length >= 2 ? steps : null;
}

/**
 * The plain fact card's words (KEY FACT, or BY THE NUMBERS with one figure): seg.fact, unless the programme shows only
 * its boards (pace shots.factCard false: FULL TIME, full-time.md §5), where only THE NUMBER keeps its card.
 */
export function plainFact(seg, programId) {
  if (!seg?.fact) return null;
  return paceFor(programId).shots.factCard === false && seg.feature !== 'number' ? null : seg.fact;
}

const str = (x) => typeof x === 'string' && x.trim() !== '';
const CHALK_SPORTS = new Set(['football', 'american-football', 'rugby']);

/** FULL TIME's scoreline (pace shots.score): seg.score { a, b, sa, sb, ... } from the sport shape (full-time.md §3.5). */
export function scoreBoard(seg, programId) {
  const c = seg?.score;
  if (!paceFor(programId).shots.score || !c) return null;
  return str(c.a) && str(c.b) && Number.isFinite(Number(c.sa)) && Number.isFinite(Number(c.sb)) && String(c.sa) !== '' && String(c.sb) !== '' ? c : null;
}

/** THE MOMENT ON THE BOARD (pace shots.chalk): seg.chalk { yards | metres, sport, label? }, one of the three grounds, 1-70. */
export function chalkBoard(seg, programId) {
  const c = seg?.chalk;
  if (!paceFor(programId).shots.chalk || !c || !CHALK_SPORTS.has(c.sport)) return null;
  const d = Number(c.yards ?? c.metres);
  return d >= 1 && d <= 70 ? c : null;
}

/** IN PROPORTION (pace shots.proportion): seg.share { value, fraction, lead, label, qualifier? }, the writer's, said. */
export function shareBoard(seg, programId) {
  const c = seg?.share;
  if (!paceFor(programId).shots.proportion || !c) return null;
  return str(c.value) && str(c.label) && Number(c.fraction) > 0 && Number(c.fraction) < 1 ? c : null;
}

/** WHAT HAPPENS NEXT (pace shots.next): seg.next { when, date?, what }, a dated step ahead the presenter says. */
export function nextBoard(seg, programId) {
  const c = seg?.next;
  if (!paceFor(programId).shots.next || !c) return null;
  return str(c.when) && str(c.what) ? c : null;
}

/** WHO'S WHO (pace shots.who): seg.who [{ name, role }], two or three people the presenter names. */
export function whoBoard(seg, programId) {
  if (!paceFor(programId).shots.who || !Array.isArray(seg?.who)) return null;
  const people = seg.who.filter((p) => p && str(p.name) && str(p.role)).slice(0, 3);
  return people.length >= 2 ? people : null;
}

/** WHERE THEY STAND (pace shots.standing): seg.standing { team, text }, the story's own words on a side's place. */
export function standingBoard(seg, programId) {
  const c = seg?.standing;
  if (!paceFor(programId).shots.standing || !c) return null;
  return str(c.team) && str(c.text) ? c : null;
}

/** THE RUN (pace shots.form): seg.form { team, count, label, cells }, the story's own words on a side's run. */
export function formBoard(seg, programId) {
  const c = seg?.form;
  if (!paceFor(programId).shots.form || !c) return null;
  return str(c.team) && str(c.label) && Number(c.count) >= 2 ? c : null;
}

// a story's boards, strongest first (full-time.md §5: the scoreline, then WHERE THEY STAND / THE RUN (the visual-variety
// round), WHO'S WHO / IN PROPORTION / WHAT HAPPENS NEXT / WHAT WE KNOW; FROM → TO before them, HOW WE GOT HERE last)
const BOARD_ORDER = [
  ['score', scoreBoard],
  ['standing', standingBoard],
  ['form', formBoard],
  ['chalk', chalkBoard],
  ['change', changeBoard],
  ['who', whoBoard],
  ['share', shareBoard],
  ['next', nextBoard],
  ['known', knownBoard],
  ['timeline', timelineBoard],
];

/** Every board a story carries, strongest first: [{ kind, value }]. */
export function storyBoards(seg, programId) {
  const out = [];
  for (const [kind, fn] of BOARD_ORDER) {
    const value = fn(seg, programId);
    if (value) out.push({ kind, value });
  }
  return out;
}

/**
 * The board a story's card shows: its strongest, unless that is the same type as the board shown last (`last`, the
 * director's memory) and it has another (full-time.md §5: boards rotate). A story whose only board repeats the last
 * one's type still shows it: a result or a story's points are worth a repeat, a story without its board is not.
 */
export function pickBoard(seg, programId, last = null) {
  const all = storyBoards(seg, programId);
  return all.find((b) => b.kind !== last) || all[0] || null;
}

/** The board a story's card carries beside its figures board (pickBoard's, without the rotation memory). */
export function storyBoard(seg, programId) {
  return pickBoard(seg, programId)?.value || null;
}

/** A board's words, for its hold (read twice). */
function boardText(b) {
  const v = b.value;
  switch (b.kind) {
    case 'score':
      return `${v.a} ${v.sa} ${v.b} ${v.sb} FT`;
    case 'chalk':
      return v.label || `${v.yards ?? v.metres} ${v.yards !== undefined ? 'YARDS' : 'METRES'}`;
    case 'standing':
      return `${v.team} ${v.text}`;
    case 'form':
      return `${v.team} ${v.count} ${v.label} ${v.cells || ''}`;
    case 'change':
      return `${v.label} ${v.from} ${v.to}`;
    case 'who':
      return v.map((p) => `${p.name} ${p.role}`).join(' ');
    case 'share':
      return [v.lead, v.value, v.label, v.qualifier].filter(Boolean).join(' ');
    case 'next':
      return `${v.when} ${v.what}`;
    case 'known':
      return v.join(' ');
    case 'timeline':
      return v.map((p) => `${p.when} ${p.what}`).join(' ');
    default:
      return '';
  }
}

/** What a story's card shows, for its hold: FROM → TO, the figures board's rows, else the story's board, else the fact. */
export function factText(seg, programId, last = null) {
  const change = changeBoard(seg, programId);
  if (change && !scoreBoard(seg, programId) && !chalkBoard(seg, programId)) return `${change.label} ${change.from} ${change.to}`;
  const board = numbersBoard(seg, programId);
  if (board) return board.map((n) => [n.qualifier, n.value, n.label].filter(Boolean).join(' ')).join(' ');
  const b = pickBoard(seg, programId, last);
  if (b) return boardText(b);
  return plainFact(seg, programId) || seg?.numbers?.[0]?.value || '';
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
  if (shot === 'scores') return S.scoresMax || 40; // SCORE CENTRE: a board segment, on air for its whole segment
  if (shot === 'quiz') return S.quizMax || 40; // PAY ATTENTION's boards: a question on air from its frame to its reveal
  return S.studioMax;
}

/**
 * The slow pan over a full-screen picture (the rostrum move over a still: studio.js draws the picture `mx` × `my` px
 * larger than the screen, `dir` ±1 picks the way), `dt` s after its cut: whole-pixel offsets { ox, oy }. One axis
 * only (a diagonal in whole pixels steps x and y on different frames: a staircase judder on every edge), the
 * picture held at its vertical centre; the move eases in from rest (it never lurches off the cut at full speed, as
 * the old 16 s ease-out did at ~7 px/s), then drifts at the profile's speed (shots.pan px/s: 3 px/s steps one pixel
 * every 10 frames at 30 fps, a regular cadence) and eases out only if it reaches the far side, so a picture is
 * never seen to stop dead on air. Pure.
 */
export function picturePan(dt, mx, my, dir = 1, programId = null) {
  const pan = paceFor(programId).shots.pan;
  const v = Math.max(0.1, pan.speed);
  const e = Math.max(0.05, pan.ease);
  const span = Math.max(0, mx);
  // travel (px) after t s: a smoothstep ramp to speed v over e s, then constant speed, mirrored at the far end
  const ramp = (t) => (t <= 0 ? 0 : t >= e ? v * (t - e / 2) : v * (t * t * t / (e * e) - (t * t * t * t) / (2 * e * e * e)));
  const cruise = span / v + e; // the time (s) the full travel takes with both ramps
  const t = Math.max(0, dt);
  const x = Math.max(0, Math.min(span, t >= cruise ? span : t <= cruise / 2 ? ramp(t) : span - ramp(cruise - t)));
  const ox = Math.round(dir > 0 ? x : span - x);
  return { ox, oy: Math.round(Math.max(0, my) / 2) };
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
