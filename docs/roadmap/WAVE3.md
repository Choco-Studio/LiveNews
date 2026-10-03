# WAVE 3 PLAN: long live programmes, slides, experts and re-staged interviews, natural voices

Written by the wave-3 architect on 2026-10-02 (read-only on the repo). The streams are in `$SP/v2/wave3-plan.json`, which has the
same shape as wave2-plan.json. `$SP` = `/tmp/claude-0/-home-user-LiveNews/bb6f89cc-3d0e-5d2d-a7ac-e8a89a5d11d7/scratchpad`.

**Precedence:** the owner's words (OWNER_FEEDBACK.md, newest first), then this plan's long-form rules, then the older style bibles
(docs/programmes/*.md were written for 1-3 minute episodes), then PLAN.md (wave 2). Where an old bible gives a running time or
a story count, wave 3 replaces it. Where it gives a voice, camera, set, graphics or tone rule, it still holds.

## 0. What the owner asked (translated) and what wave 3 assumes

- **A. Much longer programmes.** "If the programme ends in 3 minutes we have nothing." Measured today in the offline demo:
  WORLD NOW is 8 stories and 272 words (about 2.0 minutes of speech), and TECH BYTES is 4 stories and 196 words (about 1.5
  minutes). The owner wants blocks of realistic length, more possibilities per programme (deeper stories, recurring features,
  variety over hours) and a calm pace. Production must stay **live and ahead of air**: rolling, chunked production, budgets,
  graceful fallbacks, and a mock that also makes long, varied episodes.
- **B. Many more slides.** Full-screen and wall templates, driven only by episode data, in adult broadcast design.
- **C. Guests.** Two features of equal rank.
  - **23:00: re-staged real interviews.** The owner approved the responsible-design rules. When a story carries a real
    person's actual words, the channel re-stages them. The person appears as a pixel character on the wall (remote box) or in
    the guest chair, voicing ONLY those sourced words. The presenter's questions and links are framed around them, and the
    screen says "RECREATION — WORDS FROM PUBLIC STATEMENTS" with a source credit.
  - **23:05: the channel's own experts.** "Don't forget the EXPERTS — that brings the programme to life." A persistent,
    recurring roster of fictional analysts and correspondents. They are clearly the channel's own staff, with distinct
    personalities, specialities, looks and voices. They analyse strictly within the facts of the sources, and they are
    scheduled regularly in the long programmes.
  - Both use one **character-customisation system**: a validated look spec plus an optional face spec, rendered by the v2 rig.
    A **booking pipeline** prepares looks and voices well ahead of air and caches them, so recurring people keep their look.
- **D. Voices, next level.** Soft chuckles in light banter (never in grave stories), breaths, micro-pauses, emphasis, question
  intonation, small reactions between presenters, a face that smiles or laughs in sync, and captions that never print the
  noises.
- **E. Gesture restraint.** A density budget, so hands rest most of the time.

**Preconditions (orchestrator, before phase 1):**
- every wave-1 fix round and wave-2 stream has finished and is committed;
- the wave-2 post-merge INTEG round has flipped the v2 Stage to the default;
- the 22:50 montage fix (item 3: cut on the actual voice onsets, preload, designed fallback, never black) has landed with its
  test;
- the 22:40 photo-search tool is either done or running as a separate task. Wave 3 does not own it; the gallery slide uses
  whatever pictures exist.

The orchestrator also adds two headers to CONTRACTS.md: "## wave-3 architect (pointer to WAVE3.md)" and
"### wave-3 hub edit log".

Wave 3 builds capabilities only. Nothing is authored per episode or per story. Every choice is a seeded function of live
episode data.

## 1. Programme lengths and the hourly clock (proposal; owner to confirm, §13)

Speech share is about 80 % of a block. Words = speech minutes × the bible's wpm.

| Programme | Block (target, range) | Parts (target each) | Speech | Stories | Features in the block (only when the sources support them) |
|---|---|---|---|---|---|
| NEWS IN 60 | 60 s (55-75 s), at :00 and :30 | 1 | ~55 s | 5-6 | unchanged (round-up); the top-of-hour summary |
| WORLD NOW | **26 min (18-28)**, with one internal break of ~2 min | P1 Headlines & the lead 6.5 · P2 The big stories 6.5 · BREAK 2 · P3 Around the world 5.5 · P4 And finally 4.5 | ~19 min (~3,100 words at 165 wpm) | 12-16 | headlines, lead package, ANALYSIS (expert), FROM OUR CORRESPONDENT (regional desk), IN THEIR WORDS (re-staging), AROUND THE WORLD map tour, EXPLAINER or TIMELINE, BUSINESS + markets board, WEATHER WATCH (from weather stories), PHOTO OF THE DAY, GOOD NEWS, AND FINALLY + chat |
| TECH BYTES | **14 min (11-15)** | P1 Lead + THE CATCH 5 · P2 Deep dive 5 · P3 Quick bytes 3.5 | ~11 min (~1,900 words) | 8-10 | THE CATCH, THE TEARDOWN (explainer steps), VERSUS, TIMELINE, THE ANALYST (expert), IN THEIR WORDS (CEOs, researchers), BY THE NUMBERS, QUICK BYTES (headline grid), AND FINALLY |
| COSMOS DESK | **14 min (11-15)** | P1 Lead + explainer 5 · P2 Reading + expert 5 · P3 Our planet + close 3.5 | ~10.5 min (~1,500 words at 145 wpm) | 6-8 | THE READING (number), IMAGE OF THE DAY, MISSION TIMELINE, THE EXPERT (planetary or climate scientist), IN THEIR WORDS (mission scientists), SPACE WEATHER (story-based; optional data adapter), OUR PLANET, AND FINALLY |
| MONEY MINUTE | **9 min (7-10)** ("Minute" stays a promise of brevity, not a stopwatch: owner to confirm the name) | P1 The tape + lead 4.5 · P2 The economist + number 4 | ~7 min (~1,200 words at 170 wpm) | 5-6 | THE TAPE (markets board from stated figures), CHART, THE ECONOMIST (expert at the board), IN THEIR WORDS (central bankers, CEOs), WHAT IT MEANS FOR YOU (sourced only), NUMBER OF THE DAY last |
| IN THEIR WORDS (new, optional, §13) | 12 min (9-13) | P1 2 interviews 6 · P2 1-2 interviews + expert 6 | ~9.5 min | 3-5 | 3-4 re-stagings of the day's most quoted public figures plus one expert analysis. Airs only when the quote desk has ≥ 3 eligible speakers with ≥ 40 sourced words each; otherwise its slot is skipped |

**Soft clock** (Europe/London, `config/schedule.json`, owner w3-produce):

| Time | Item |
|---|---|
| :00 | NEWS IN 60 |
| :01:30 | WORLD NOW (~25 min with its internal break) |
| :27 | break |
| :30 | NEWS IN 60 |
| :31:30 | TECH BYTES / COSMOS DESK / IN THEIR WORDS, rotating, ~14 min |
| :45:30 | break |
| :47:30 | MONEY MINUTE, ~9 min (weekdays 06-22) |
| :56:30 | break, idents and the on-screen schedule until :00 |

- The station lands the fixed points (:00 and :30 NEWS IN 60) within ±90 s. It does this by sizing optional parts at plan
  time, dropping optional parts late, and stretching or shrinking breaks.
- Overnight (00-06 London) a lighter edition runs: WORLD NOW with 2-3 parts (~14 min) and no MONEY MINUTE, to save AI budget.
- Weekends (Sat/Sun) WORLD NOW's P3 becomes WEEK IN REVIEW, built from the aired-story archive.
- `rotation` stays as the fallback when `schedule.clock` is off.

**Depth, never padding.** A story's treatment scales with its **dossier** (§3.1): its words, outlets, quotes, figures, places
and pictures. A thin story gets one beat. A rich story gets a package: lead, background, numbers, map, photo, explainer,
analysis chat, reaction, and IN THEIR WORDS. When the day's material is thin, the block runs short (optional parts are
dropped) and the clock is held with breaks and interstitials. The grounding rule ("only facts in the sources") is unchanged;
the sources are just richer.

## 2. Architecture (who does what, at runtime)

```
feeds ─► NewsDesk ─► DOSSIERS (article body + same-event outlets)            [w3-produce: news.js]
                       │
                       ├─► QUOTE DESK: quotes + attribution + eligibility     [w3-guests: server/guests/quotes.js]
                       ▼
 Station scheduler (EDF over AI/voice tasks, lead target, soft clock)          [w3-produce: station.js, server/production/**]
   └─ for each block:
      PLAN  (AI 'plan' stage; merged with part 1)      → normalizePlan        [w3-format]
      BOOK  experts (roster) + re-staged speakers      → bookings (look, voice) [w3-guests + w3-voice guestcast]
      for each part k (in deadline order, while earlier parts air):
        WRITE (AI 'part' stage)  → normalizePart (beats, visuals, quotes filled verbatim by the server, sounds)   [w3-format]
          └ deadline missed → DETERMINISTIC WRITER (same plan, grounded by construction)                          [w3-demo]
        REVIEW (AI, risk-based)  → re-normalize                                                                    [w3-format rules]
        ASSETS (pictures verified, gallery images)                                                                 [w3-produce]
        VOICE  (deadline-ordered; paralinguistics; overlays)                                                       [w3-voice]
      → part state 'ready'; GET /api/episode/:id/part/:n serves it
Client:
  PartFeed (prefetch part n+1 when part n starts, preload pictures and clips)  [w3-air: public/js/air/**]
  Director: plays parts → segments (story beats, chat, quote, feature, bumper, break, intro, outro); fallback ladder  [w3-air]
  Planners (context, gestures with density budget, behaviour with 3-way eyelines and sounds)                           [w3-air]
  Stage: seats A/B + guest chair, remote link (wall box, split, full), camera framings, shot grammar incl. slide beats   [w3-studio]
  Slides (full-screen + wall renderers), graphics (guest strap, RECREATION label, bumpers)                             [w3-slides]
  Guest looks from LookSpec/FaceSpec (kit) + lookFor                                                                   [w3-guests]
  Voice: recorded clips with sounds and overlays; speechFrame.para for the face                                        [w3-voice]
```

The deterministic writer (today's mock, rebuilt) has two jobs: it is the **offline demo writer** and the **production
fallback** when the AI misses a deadline. Its output is grounded by construction: it only re-uses source words and fixed
format phrases.

## 3. Data contracts

All new fields are optional for old readers. Clients ignore what they do not know. Servers never remove fields clients read.

### 3.1 Story dossier (w3-produce writes it, everyone reads it)

`story.dossier`, built for the candidates of a block within the picture-desk budget. One page fetch serves both the
pictures and the text.

```
dossier = {
  built: ISO,
  sources: [ { id: 'src0' | 'src1'..., kind: 'feed' | 'page' | 'cluster', outlet, title, summary,
               body: string (cleaned article paragraphs, ≤ 4,000 chars), url? } ],
  text: string,    // grounding text: title. summary. body. + other outlets' title. summary. (≤ 9,000 chars)
  depth: { words, outlets, quotes, figures, places, pictures, score: 0..1 }
}
```

- Every validator grounds against `story.dossier?.text`, falling back to `title. summary` as today (w3-format switches
  `sourceOf`).
- Presenters paraphrase. The deterministic writer may read at most 2 body sentences (≤ 50 words) verbatim per story, with
  attribution, and prefers the summary.

### 3.2 Quote desk (w3-guests: `server/guests/quotes.js`, deterministic)

`story.quotes = [Quote]`, extracted from the dossier. It extends facts.js `quotesIn`/`speakerOf`: multi-sentence quotes,
"said X, the minister", and titles such as "Lisbon's mayor, Ana Silva".

```
Quote = { id: 'q_<storyId>_<n>', storyId, sourceId, outlet, text, words, span: [start, end] (in that source's text),
          speaker: { key, name|null, role|null, org|null, named: bool,
                     kind: 'official'|'politician'|'executive'|'scientist'|'spokesperson'|'expert'|'public'|'victim'|'relative'|'witness'|'child'|'unknown' },
          said: 'said'|'told <outlet>'|'statement'|'interview'|'wrote'|'posted'|null,
          eligible: { restage: bool, card: bool, reasons: [string] } }
```

`eligible.restage` follows §6. Anything not eligible for re-staging can still be a quote card (`card`), subject to the
existing groundQuote rules.

### 3.3 Block (episode) and parts (w3-produce serves; w3-format normalises; w3-air plays)

`GET /api/next[?after=id]` returns the block shell. Ready parts are complete; the others are stubs.

```
block = { kind: 'episode', id, createdAt, program: {id,title,tagline,theme}, cast: {A, B?}, provider, pipeline,
  format: { id, targetSec, minSec, maxSec, clockTarget?: ISO },
  title, rundown: [ {storyId, headline, source, category, hasImage, kicker?, part: n} ],   // planned order
  guests: { G1: Booking, G2: Booking, ... },        // every booking of the block, as early as known (pre-warm looks)
  parts: [ Part | { n, label, state: 'planned'|'producing'|'dropped', required, estSec, eta? } ],
  outro: { safe: Segment },                          // generic sign-off written with part 1: the block can end at any time
  segments: [...ready parts' segments..., outro.safe],  // BACK-COMPAT: an old client airs a shorter programme
  storyIds, replay? }
Part = { n, label, state: 'ready', required: bool, estSec, provider, fallback?: 'deterministic', reviewed: bool,
         guests: ['G1'], segments: [Segment], rundown: [...] }
```

- `GET /api/episode/:id/part/:n?wait=20&playing=m` answers 200 with the Part when it is ready. Otherwise it long-polls for
  ≤ `wait` seconds, then answers 202 `{ state, eta }`. A dropped part is 410 `{ state: 'dropped' }`; an unknown one is 404.
- `playing` tells the scheduler that part m is on air now. It is the first client's playhead; older playheads are ignored.
- `GET /api/episode/:id` (loopback/dev) returns the full block. SSE `part` events carry `{ episodeId, n, state }`.
- `/api/status.production` reports `{ lead, voiceLead, budget, tasks, fallbacks }`.
- **Ordering guarantees:**
  - part n never refers to an optional later part;
  - `bumper` segments tease only stories of REQUIRED later parts, which always air through the AI or the deterministic writer;
  - intro headlines come only from parts 1-2;
  - the post-break part opens with a "welcome back" line of its own.

### 3.4 Segments (w3-format validates; existing fields unchanged)

`type` is one of:
- `intro` and `outro`, as today;
- `story`: a presenter reads. New: `beat` = `lead|detail|background|numbers|explainer|timeline|context|photo|roundup|brief`,
  and `visual?`;
- `chat`: a conversational line. `anchor` may be `A`, `B` or a guest key `G1`..`G3`; `with?` names who is addressed (for
  eyelines); `role?` = `catch|analysis|reaction|button|link`;
- **`quote`**: a re-staged real person. `anchor: 'G1'`. The **`text` is filled by the server from the quote desk**; the AI
  only sends `{ quoteId, from?, to? }` (word indexes). The segment also carries
  `quoteRef: { id, sourceId, outlet, said }`, `recreation: true` and `staging: 'wall'|'split'|'chair'`;
- **`feature`**: a recurring-feature item read by a presenter or an expert, with `feature` and a usually required `visual`;
- **`bumper`**: "still to come" or "after the break". `items` = storyIds of required later parts; `visual: rundown`;
- **`break`**: `{ type: 'break', ads: 1-3 }`, an internal commercial break.

Common new fields:
- `storyId` on every beat of a story;
- `sounds?` (§3.7);
- `grave` (bool, set by the validator);
- `optional` (bool: the client may skip it when its voice is late).

A correspondent "report" is a `story` with `anchor: 'G1'`. Guests have no cue slot: `[A:nod]`/`[B:nod]` still work while a
guest speaks, and guest gestures are planner-only.

### 3.5 VisualSpec and slide templates (schema validators: w3-format `public/js/format/visuals.js`; renderers: w3-slides)

`visual = { template, data, place: 'full'|'wall'|'auto', sync: 'sentence'|'whole', at?: sentenceIndex, hold?: s }`.
- Every datum must be grounded in the dossier: numbers with `numbersGrounded`, labels with `claimGrounded`, dates in the text,
  places through the gazetteer.
- Invalid data drops the visual, never the segment.
- `sync: 'sentence'` reveals step i on sentence i of the segment.
- The client may also derive visuals from older fields: `numbers` → numbers, `map[]` → pins, `quote` → quote,
  `rundown` → grid/rundown.

| template | data (limits) | wall variant |
|---|---|---|
| explainer | `{ title ≤28, steps: [{ head ≤24, body ≤70 }] 2-4 }` | current step |
| timeline | `{ title ≤28, events: [{ when ≤14, what ≤40 }] 3-6 }`; dates are in the text | current event |
| versus | `{ title ≤28, left: { label ≤18, value?, points ≤3×36 }, right: {...} }` | values only |
| bullets (what we know / don't) | `{ title ≤28, columns: [{ label, items ≤3×44 }] 1-2 }`; "don't know" items come only from source sentences with an uncertainty marker ("unclear", "not yet known", "did not say") | — |
| quote | `{ text ≤140, by, role?, outlet }` (groundQuote) | yes |
| gallery | `{ title?, images: [{ storyId, n }] 2-4, captions ≤40, credit }` | one image |
| chart | `{ kind: 'bar'|'line', title ≤28, unit, series: [{ label ≤14, value }] 2-8, source }`; every value is a stated figure (facts.js series extraction) | bar sparkline |
| pins | `{ title?, pins: [{ place, lat, lon, label ≤18 }] 2-6 }` | mini map |
| grid | `{ label, items: [{ headline, kicker, storyId }] 4-6 }` | — |
| markets | `{ rows: [{ name ≤14, value ≤10, change?, dir: up|down|flat }] 2-6, asOf?, source }`; stated figures only, unless an operator data adapter is configured | 2 rows |
| weather | `{ kind: 'weather'|'space', items: [{ place, lat, lon, hazard: storm|heat|flood|snow|wind|fire|cold, label ≤18 }] 1-6 }` or `{ kind: 'space', kp?, flare?, label, source }` | mini |
| rundown | `{ label: 'COMING UP'|'STILL TO COME'|'AFTER THE BREAK', items: [{ headline, kicker }] 2-4 }` (client: ready parts only) | — |
| location | `{ name, role, desk?, place?, kind: expert|correspondent|restaged }`: the guest card | yes |
| numbers | existing `numbers[]` (+ qualifier) | yes |
| photo | `{ storyId, n?, caption ≤48, credit }` (photo of the day / image of the day) | yes |

- Full slides use y 24-148. The band y ≥ 150 belongs to strap, captions and ticker.
- Slides follow docs/ART_DIRECTION.md, the 24/7 pace rules (readable twice, eased in and out, no linear moves) and each
  programme's accent.

### 3.6 Guests: Booking, LookSpec, FaceSpec, roster (w3-guests; voices by w3-voice)

```
Booking = { key: 'G1', id: 'ex_<roster id>' | 'rp_<hash(name+org)>' | 'gn_<hash>', kind: 'expert'|'correspondent'|'restaged',
  name, role, org?, desk?, presence: 'chair'|'remote', staging: 'chair'|'wall'|'split'|'remote-full',
  backdrop: 'bureau'|'press'|'neutral'|'observatory'|'trading'|'lab', place?: {name, lat, lon},
  label: { line, credit? },   // restaged: 'RECREATION — WORDS FROM PUBLIC STATEMENTS' + 'SOURCE: <OUTLET>'; expert: 'GLOBIT 24 ECONOMICS EDITOR'
  look: LookSpec, face?: FaceSpec, likeness: 'none'|'generic'|'caricature',
  voice: { voice, speed, lang, pauses?, effect: null }, persona: { energy, smile, headMotion, gestures: 'restrained'|'calm'|'expressive' },
  quotes?: [quoteId], version: 1, source: 'roster'|'ai'|'generic' }

LookSpec v1 = { v: 1, presentation: 'man'|'woman'|'neutral', age: 'young-adult'|'adult'|'middle'|'senior', build: 'slight'|'average'|'broad'|'heavy',
  skin: 'porcelain'|'light'|'medium'|'tan'|'brown'|'deep'        // → palette ramps only (P.*; no new colours)
  hair: { style: 'bald'|'shaved'|'crop'|'short-side'|'short-textured'|'quiff'|'curly-short'|'coily-short'|'afro'|'bob'|'long-straight'|'long-wavy'|'ponytail'|'bun'|'braids'|'locs'|'headscarf'|'hijab'|'turban',
          colour: 'black'|'dark-brown'|'brown'|'auburn'|'red'|'blonde'|'grey'|'white'|'salt-pepper', parting: 'left'|'right'|'centre'|'none', receding: 0..1 },
  facialHair: { style: 'none'|'stubble'|'moustache'|'goatee'|'short-beard'|'full-beard', colour? },
  glasses: 'none'|'rect'|'round'|'half-rim'|'thick',
  wear: { outfit: 'suit'|'blazer'|'open-collar'|'knit'|'turtleneck'|'cardigan'|'lab-coat'|'plain-uniform', main: <palette ramp name>, accent: <palette name>, tie: 'none'|'plain'|'stripe' },
  accessories: subset of ['earrings-small','necklace-fine','pocket-square','lapel-pin','watch'] }
FaceSpec v1 (optional sculpt; sliders −1..1, mapped to clamped deltas of the head/eyes/brows/nose/mouth/ears params):
  { shape: 'oval'|'round'|'square'|'long'|'heart', jaw, chin, cheekbones, cheeks, forehead,
    eyes: { size, spacing, tilt, colour }, brows: { thickness, arch }, nose: { length, width }, lips: { width, fullness }, ears: { size },
    lines: { forehead: 0..1, crowFeet: 0..1, nasolabial: 0..1 } (capped by age), marks: { freckles: bool } }
```

- **Clamps (respectful caricature):** every slider moves its base parameter by at most ±12 %, and nose and ears by at most
  ±6 %. No feature is exaggerated beyond that.
- **Validation:** unknown values fall back to defaults. `public/js/guests/spec.js` is shared by server and client:
  `validateLook`, `validateFace`, `clampForLikeness`, `seedLook(id)`.
- **Look build:** `buildGuestLook(booking) → look` (client kit) is deterministic for (spec, id). It costs ≤ 5 ms and is
  cached by id.
- **Roster** (`config/experts.json`, owned by w3-guests): 8 recurring experts, all fictional. Names must pass a famous-name
  check before air (owner approval, §13). Each entry has `{ id, name, role, desk, specialities[], programmes[],
  presence, backdrop, persona, look, face, voiceHint }`. Their look specs are **frozen** and never regenerated, so viewers
  recognise them.
  - Proposed desks: Economics Editor (markets, central banks); Diplomatic Correspondent (geopolitics, diplomacy); Climate &
    Environment Correspondent; Planetary Scientist (COSMOS contributor); Security & Hardware Analyst (TECH BYTES); Health
    Correspondent; Culture Correspondent (lighter, good news, photo of the day); regional desks (Asia-Pacific, Africa,
    Americas) as remote "GLOBIT 24 · <REGION> DESK".
  - Experts never claim to be on the scene ("I'm standing here"), never "spoke to sources", never use "LIVE" labels.
- **Booking timing:** bookings are made at plan time, at least one part ahead (typically 5-20 min before air).
  - Experts come from the roster, instantly.
  - For re-staged speakers, the AI 'book' stage writes a look spec and a face spec, but only for named public figures with a
    known public profile (`likeness: 'caricature'`). Everyone else gets a seeded generic look (`likeness: 'none'`).
  - Bookings are cached in `data/guests/<id>.json` for 30 days, so a recurring public figure keeps the same look.
  - A booking that is late at air time becomes generic-look + generic-voice. Booking never blocks.
- **Voice:** `server/voice/guestcast.js` (w3-voice), `castGuestVoice(spec, { taken })`, picks a Kokoro blend from
  presentation, age and accent region.
  - It keeps a minimum distance from every presenter and from the other guests of the block (metrics.py).
  - It never imitates a real voice.
  - Experts' blends live in `server/voice/casting.json` by expert id.

### 3.7 Sounds (paralinguistics) (cues.js SOUNDS: w3-voice; policy: w3-format; rendering: w3-voice; face: w3-air)

- **Writer syntax:** the existing cue syntax with a new category, `SOUNDS = { breath, chuckle, soft_laugh, mm, hm, beat }`.
  - `[chuckle]` is the speaker. `[B:mm]` is the listener reacting while A speaks (an overlay clip).
  - `laugh` stays the existing head ACTION.
- **Parser:** `parseCues(text)` now returns `{ text, cues, sounds: [{ char, slot, sound }] }` (`cues` is unchanged).
  `embedCues(text, cues, sounds?)` round-trips them for the review stage.
- **Segment:** the validator writes `seg.sounds = [{ char, slot|null, kind }]` after applying the programme's `sounds`
  policy. The text never contains them, so captions never print them.
- **Audio:** `seg.audio.sounds = [{ t, dur, kind }]` are rendered inside the clip.
  `seg.audio.overlays = [{ url, t, dur, slot, kind }]` are listener reactions the client mixes at clip time t (-6 dB).
  Breaths are added by the engine automatically and also appear in `audio.sounds`.
- **speechFrame(t, slot)** adds `para: kind|null` and `paraPhase: 0..1` for the face. The browser-TTS fallback ignores
  sounds, except `beat`, which becomes a pause.
- **Policy (w3-format, channel.json `sounds`):**
  - never in a grave segment, the segment after one, a `quote` segment (re-staged people get NO sounds, ever), or a
    breaking story;
  - laughs (chuckle, soft_laugh) only in chat/button/lighter/outro dry lines, ≤ 1 per chat exchange, ≤ 1 per part per
    presenter, ≤ 1 per 3 minutes per voice;
  - COSMOS: no laughs ("nobody laughs"). UNIT-8: no sounds except `beat`. NEWS IN 60: `beat` only;
  - `mm`/`hm` ≤ 1 per chat turn; `beat` ≤ 1 per sentence.

### 3.8 AI stages (w3-format prompts and validators; w3-produce runs them; w3-demo answers them deterministically)

- **`plan`** (merged with part 1 by default). The input is the candidates with depth scores, quote-desk summaries
  (eligible speakers, quote ids, word counts), the programme format, the roster (ids and specialities), the variety memory
  (recent features, experts, templates, openers), `targetSec` and the clock.
  The output:
  ```
  { title, parts: [{ n, label, required, targetSec, items: [{ storyId, treatment: 'package'|'story'|'brief'|'roundup'|'feature',
    beats: [...], feature?, expert?: rosterId, interview?: { speakerKey, quoteIds: [...], staging } }] }], teases: [storyIds] }
  ```
  `normalizePlan` enforces the format grammar, eligibility (§6), feature rules, variety and durations. Unsupported items are
  dropped, never invented.
- **`part`.** The input is the plan, this part's dossiers and quote lists, the bookings, what already aired in this block
  (headlines and opening phrases), and the per-programme rules. The output is `{ segments: [...] }` (§3.4).
  `normalizePart` fills quote text verbatim and validates.
- **`review`** (risk-based): always on parts with `quote` segments, guest lines, the lead, or figures in visuals. Elsewhere
  it runs only when the budget allows; deterministic validators always run.
- **`book`**: `{ speakerKey, name, role, org, storyContext } → { look, face, likeness }`, validated by spec.js.
- Providers see `request.stage` ∈ {plan, part, review, book}. The inbox provider passes any stage through.

## 4. Runtime flow: a WORLD NOW block, minute by minute

| When (relative to the block's air start T) | What happens |
|---|---|
| T − 20..−10 min | The scheduler starts the block (the previous block is airing). Dossiers and the quote desk run, then the PLAN+P1 call and bookings: experts instantly; a re-staged speaker's 'book' call is queued with deadline = P2's air time − 60 s. |
| T − 8 min | P1 is written and validated (review if risky), then assets, then voice: first segments first; later clips attach late, as today. P1 becomes **ready**. The block is airable (station queue). |
| T − 8..0 | P2 write (deadline = T + est(P1) − voice(P2 first 2 segments) − 60 s margin). |
| T | Client: `/api/next` → shell with P1 (+ P2 if ready) and all known bookings; looks are pre-warmed in idle callbacks; the open plays. |
| T + 0:10 | Client: `GET part/2?playing=1` (prefetch). The server now knows P1 is on air, and the deadlines tighten to reality. |
| T + 6:30 | P1 ends → P2 (ready) → its end → the internal break (`break` segment) → P3 … |
| any time | **Server deadline miss**: WRITE → deterministic writer for that part (same plan, grounded); REVIEW → skipped and logged (deterministic checks always ran); BOOK → generic look/voice; VOICE → late clips attach; at air time a required segment uses browser TTS, an optional segment is skipped. |
| part k+1 not ready when part k ends (client ladder) | (1) up to 1.5 s of air; (2) up to 3 interstitials of 8-12 s each from data already on hand, with no new speech (the story so far grid, photo of the day from aired pictures, aired-pins map, markets board from aired figures), music bed only; (3) an unscheduled internal break of 1-2 ads + "STAY WITH US" (not in NEWS IN 60); (4) the safe outro → end card → next item. If the part arrives meanwhile, it resumes at the next boundary. **Never black, never a stall, never a promise broken.** |
| breaking news mid-block | The next unwritten part opens with it ("We are getting news…"), written by the AI or the deterministic writer. The graphics' breaking strap behaves as today. |

- **Scheduler rules (w3-produce):**
  - earliest deadline first across all blocks;
  - AI tasks are serialised per provider (codex is serial) and voice tasks per worker lane;
  - never start a WRITE earlier than air − `AHEAD_MAX_S` (1,500 s), to keep the news fresh, unless lead < target and the
    queue is idle;
  - **lead** = seconds of ready content after the playhead: target ≥ `LEAD_TARGET_S` 600, emergency below `LEAD_MIN_S`
    240 (light mode);
  - **voice lead** target ≥ 120 s.
- **Clock alignment:** the plan gets `targetSec` = next fixed point − estimated block start − break. When the block runs
  long, optional parts are dropped late (state 'dropped'). When it runs short, an interstitial or a longer break fills the gap.
- **Replays and multiple clients:** blocks keep their parts. History-based `next(afterId)` stays. A replay re-airs the
  ready parts.

## 5. Budgets

**AI calls per hour (daytime clock; plan merged with part 1, risk-based review):**

| Block | Calls |
|---|---|
| NEWS IN 60 ×2 | 2 × (write + review) = 4 |
| WORLD NOW | plan+P1, P2, P3, P4 + reviews of P1, P2 and any part with quotes or guests (2-3) + 0-2 bookings = 7-9 |
| TECH BYTES / COSMOS | plan+P1, P2, P3 + 2 reviews + 0-1 booking = 5-6 |
| MONEY MINUTE | plan+P1, P2 + 2 reviews = 4 |
| **Total** | **≈ 20-23 calls/hour** |

- **Time:** codex exec takes 60-90 s per call, serially, so 20-35 minutes of AI time per hour. Budget defaults:
  `AI_CALLS_PER_HOUR=24` and AI busy time ≤ 60 %.
- **Tokens:** plan ~9k in / 2.5k out; part ~8k / 3k; review ~7k / 3k; book ~1.5k / 0.5k. That is about 180k in and 60k out
  per hour, or **4-5 M input and ~1.4 M output tokens per day** (owner question, §13).
- **Light mode,** applied in order when the projection exceeds the budget or lead < `LEAD_MIN_S`:
  1. review only parts with quotes or guests;
  2. feature-only parts (markets board, photo of the day, weather watch, quick bytes) are written by the deterministic
     writer;
  3. drop optional parts;
  4. overnight edition lengths.
- A second, parallel-capable provider (openai-compatible) can take parts concurrently when configured.

**Voice:**
- Speech is about 45-48 min per hour. Kokoro runs at RTF 0.3-0.7 when idle and 1.5-3 under load (CONTRACTS voice engine).
  Recommended: `VOICE_WORKERS=2` with `KOKORO_THREADS=2`, and `VOICE_CACHE_MB=800` (~28 h of speech, 6 h pinned).
- The voice queue is ordered by air deadline, not FIFO.
- Non-verbal clips (chuckle, mm, hm, breath variants) are rendered once per voice at start-up and cached. That is about
  30 per voice; the 8 presenters + 8 experts give about 480 clips of ~0.5 s each.

**Client:**
- the three-shot ≤ 8 ms p95; remote split ≤ 9 ms p95;
- a full slide ≤ 2 ms per frame and a wall slide ≤ 1 ms, with no per-frame allocation;
- ≤ 12 guest looks cached (LRU);
- images: LRU by bytes (≤ 64 MB) instead of 40 entries;
- heap growth < 10 % per hour after warm-up (soak).

## 6. Responsible design (approved by the owner 23:00): HARD RULES, enforced in code

1. **Experts are the default guest.** The channel's fictional analysts and correspondents discuss ONLY facts in the
   dossiers. Their lines are grounded like story text (numbers, quotations, `inventedClaim`). They never claim first-hand
   observation, never cite unnamed sources, never speak for a real person, never give opinions on real people or politics,
   never give financial or medical advice, and never predict beyond what the sources say. They are always labelled as
   GLOBIT 24 staff.
2. **Real people voice only their own sourced public statements.** A `quote` segment's text is a contiguous word span of a
   quotation the quote desk attributes to that speaker in that story's sources.
   - The AI sends only `quoteId` + `from/to`, and the server fills the words.
   - Trims only drop whole leading or trailing sentences or clauses. Never trim inside a clause (never lose a "not", a
     qualifier or a number's unit), and never splice two quotes into one line.
   - Each line is ≤ 60 words, and each person ≤ 150 words per block.
3. **Always labelled.** While a re-staged person is on screen (chair, wall or split), graphics show
   "RECREATION — WORDS FROM PUBLIC STATEMENTS" and "SOURCE: <OUTLET>" (plus "STATEMENT" / "TO REPORTERS" when known).
   The presenter's link states the provenance on first appearance ("In a statement reported by the Pixelburg Post, she
   said:").
4. **Respectful likeness.** Likeness is at most a caricature (`clampForLikeness`). Re-staged people are performed as
   follows:
   - neutral or serious expressions only;
   - beats and nods only (no expressive gestures);
   - no sounds;
   - a generic synthetic voice, never an imitation;
   - no mocking props, wardrobe or framing.
5. **Never re-staged:**
   - victims, relatives of victims, witnesses of tragedies;
   - children and minors;
   - private individuals ("public" kind);
   - anonymous sources; the recently deceased;
   - people accused or on trial in a criminal story;
   - anyone in a grave story (deaths, violence, disaster, illness), where by default a quote card is used instead (§13).
   Unnamed spokespeople may appear with a generic look (`likeness: 'none'`) labelled by role.
6. **Questions add nothing.** The presenter's questions and links around quotes contain no claim beyond the sources and no
   presupposition. They are topic prompts the quote actually addresses (content-word overlap + review). They never imply
   the person answered GLOBIT 24.
7. **Political balance.** In a story naming two or more political sides, re-staging needs sourced statements from at least
   two sides. Otherwise quote cards are used.
8. **Rejected means not aired.** The review stage and the deterministic validator reject:
   - an invented quote;
   - a quote attributed to the wrong person;
   - a quote moved to another story;
   - reported speech ("X said that…") that the person's sourced words do not support.
   A rejected interview beat becomes a quote card or is dropped. It never airs unverified.
9. **Kill switches and audit.**
   - `guests.restage: false` (global or per programme) turns every re-staging into quote cards.
   - Every re-staged line is appended to `data/guests/audit.jsonl` with the source outlet/URL, span, booking id and air
     time. `/api/status` counts them.
10. **Tests:** an adversarial suite (test/w3-guests-policy.test.js) covers invented, wrong-speaker, spliced, mid-clause
    trims, moved quotes, victims, children, grave stories, politics balance, and sounds on re-staged lines. It must stay
    green.

## 7. Voices, next level (w3-voice), with measurable acceptance

- **Markers from the writer** (§3.7) plus **automatic prosody:**
  - breaths at phrase starts after pauses ≥ 0.35 s, with a seeded persona probability: 25-40 % of eligible starts, none for
    UNIT-8;
  - emphasis on `ctx`-style stressed words (the same text model as direction/context.js), as phrase splitting + a 5-10 %
    duration stretch + 1-2 dB of gain automation on the word;
  - question intonation: yes/no questions get a rising tilt of +2..+4 semitones over the last 250-400 ms (DSP pitch shift
    on that tail only); wh-questions fall;
  - micro-pauses: `beat` = 0.25 s, plus pause jitter ±15 % seeded.
- **Non-verbals per voice:**
  - chuckle: 2-4 breathy pulses at 4-6 Hz, 0.35-0.7 s, -8..-14 dB under speech, made from a Kokoro "hm/heh" render shaped
    by DSP with aspiration noise;
  - soft_laugh: 0.6-1.0 s, same recipe, more pulses;
  - mm/hm: Kokoro renders with an envelope;
  - breath: band-passed shaped noise, 0.2-0.4 s at -30..-26 dB, through the voice's tone curve.
  - The voice stream auditions alternatives and keeps the most natural.
- **Face sync** (w3-air): chuckle/soft_laugh → `happy` emotion + a small `laugh` head gesture (amp 0.3) +
  squint, timed by `audio.sounds[].t`. mm → listener micro-nod + closed-mouth smile 0.2. breath → mouth slightly open,
  shoulders 1 px.
- **Acceptance (numeric, in tests and measure.py):**
  - STOI of the words with markers vs the same text without ≥ 0.95 (the words are not degraded);
  - yes/no questions: F0 slope over the last 300 ms ≥ +6 st/s in ≥ 80 % of them, and wh-questions ≤ 0;
  - stressed words: duration +5..12 % and RMS +1..2 dB vs the same word unstressed;
  - non-verbal level and duration within the ranges above;
  - 0 clicks (metrics.clicks), true peak ≤ -2.5 dBTP, -16 LUFS ±0.5 unchanged;
  - laughs appear only where the policy allows (0 in grave, quote, COSMOS, UNIT-8);
  - caption text equals the spoken words (no marker text ever reaches captions or TTS);
  - lip sync: `para` events within ±40 ms of the audio;
  - an owner A/B sample reel (tools/record.mjs) before the feature is on by default (`PARA=0` / `?para=0` off switch).

## 8. Gesture restraint (E), and requests to w2-hands and w2-face

**Density budget**, implemented by w3-air in direction/gestures.js and behaviour.js, prefix-stable across parts:
- "marked" = arm gestures, excluding tiny beats and nods;
- rates per speaker over their own speech time: WORLD NOW ≤ 1.5/min, TECH BYTES Max ≤ 2/min and Ada ≤ 1/min, COSMOS
  ≤ 1/min, MONEY MINUTE ≤ 0.75/min, NEWS IN 60 ≤ 2 per episode; grave stories ≤ 0.5/min;
- experts ≤ 1/min; re-staged real people: beats and nods only (amp ≤ 0.6);
- cooldown ≥ 5 s between marked gestures of one speaker and ≥ 8 s for the same name; never the same name twice in a row;
  ≤ 2 uses of a name in any 60 s;
- ≥ 65 % of each speaker's speaking time with no marked gesture active (hands at rest or tiny beats);
- listeners: ≤ 1 nod per 20 s; glance at turn starts and hand-overs only (the owner-approved behaviour).
- The test computes these rates over a fixture long block.

**Requests to w2-hands** (running now; whatever lands before wave 3 is reused, otherwise w3-air does it):
1. a per-speaker rolling budget that spans a whole block and stays stable when parts are appended (allocation for part n
   depends only on parts ≤ n);
2. tiny-beat variants (small wrist lifts, finger shifts) so rest is never dead;
3. an `amp`-driven restrained tier for guests;
4. `planGestures` must not crash on guest slots (`G1`) and must use a restrained default for unknown looks.

**Requests to w2-face:** three-way eyelines (host ↔ guest in chair, host → wall for remote), remote guests looking into
their own camera, and idle tables that wrap past 900 s (already requested by w2-integ).

## 9. Variety over hours

- **Server variety memory** (w3-format `server/format/variety.js`, persisted to `data/variety.json`, 6 h window): features
  per programme, beat patterns per slot, visual templates, experts, re-staged speakers, story openers (first 4 words),
  chat lines (existing `recentLines`), bumper and sign-off phrasings.
  - The plan prompt gets "recently used". The validator enforces caps. The deterministic writer chooses using it, seeded.
  - Rules: the same optional feature never runs in consecutive blocks of a programme (always-on features such as THE TAPE
    are exempt); an expert appears ≤ once per 2 h per programme unless the speciality requires it; no visual template
    twice in a row within a part; beat order varies across stories.
- **Client:** shots seeded per segment, music beds and idents rotate (existing).
- **Metrics** (6 h simulated run, w3-demo `tools/demo/sim.mjs`):
  - no template > 25 % of visuals;
  - no non-formula spoken sentence repeated within 3 h;
  - ≥ 1 expert appearance per long block;
  - ≥ 1 re-staging per 2 long blocks when the fixture material allows;
  - feature recurrence within the rules.

## 10. Streams, phases, ownership, hub files

| Port | Stream | Phase | Owns (summary; full lists in wave3-plan.json) |
|---|---|---|---|
| 8701 | **w3-produce**: rolling production engine | 1 | server/station.js, producer.js (hub), index.js, config.js, usage.js, news.js, images.js, pictures.js, providers/index.js (chain with deadlines), server/production/** (new), config/schedule.json (new), .env.example |
| 8702 | **w3-format**: long-form formats and editorial | 1 | server/writer.js (hub), facts.js, gazetteer.js, channel.js, config/channel.json (hub), server/format/** (new), public/js/format/** (new shared schema/visual validators), docs/programmes/*.md (long-form addenda) + docs/programmes/in-their-words.md |
| 8703 | **w3-demo**: deterministic writer (offline + production fallback) and fixture corpus | 1 | server/providers/mock.js, mock/** (new), inbox.js, config/fixtures/**, config/feeds.fixture.json, tools/demo/** (new) |
| 8704 | **w3-guests**: experts, quote desk, booking, character customisation | 1 | server/guests/** (new), config/experts.json (new), public/js/guests/** (new), v2 cast/guest/** (new), cast/index.js, head.js, face.js, glasses.js, docs/programmes/guests-and-experts.md |
| 8705 | **w3-voice**: paralinguistics, expert and guest voices | 1 | tools/voice/**, server/voice/**, public/js/voice/**, public/js/audio.js + audio/{sentences,visemes,voices,loudness}.js, public/js/cues.js (hub) |
| 8706 | **w3-slides**: slides, on-screen graphics, sonic packaging | 1 | public/js/slides/** (new), scenes/cards.js, scenes/worldmap.js, scenes/opens.js + opens/**, graphics/**, gfx/**, font.js, audio/themes.js (bumper and feature stings, interstitial beds), public/js/studio.js (hub) |
| 8707 | **w3-studio**: guests on set (chair, remote link), cameras, shot grammar | 2 | v2 studio/** (incl. wall.js), camera.js, direction/shots.js, runtime/stage.js, runtime/host.js, scene.js, character.js, pixbuf.js |
| 8708 | **w3-air**: long-form playout, ladder, director, performance planners | 2 | public/js/director.js (hub), main.js (hub), public/js/air/** (new), runtime/direction.js, cueclock.js, watchdog.js, direction/context.js, index.js, gestures.js, behaviour.js, expression.js, speech.js, idle.js, gestures/**, tools/soak/** (new), tools/showcase/** |
| 8709 | post-merge INTEG + 6 h soak (orchestrator, with w3-air's critics) | 3 | — |

**Phases.**
- **Phase 1** runs 6 streams in parallel. If usage is tight, split it:
  - 1a: produce, format, guests (the critical contracts);
  - 1b: demo, voice, slides, about one round later.
- **Phase 2:**
  - w3-studio starts when w3-guests has delivered round 1 (spec.js + kit + roster) and w3-slides its wall-renderer API;
  - w3-air starts when w3-produce (parts API), w3-format (schema + normalizePart) and w3-demo (long mock blocks) have
    delivered round 1.
- **Phase 3:** the orchestrator's post-merge INTEG + soak on port 8709.
- **Day-one deliverables that unblock others** (each stream's first task, with tests):
  - format: `public/js/format/schema.js` + `visuals.js`;
  - produce: `/api/next` shell + `/api/episode/:id/part/:n`, first served by splitting today's single-shot episode into
    parts;
  - guests: `public/js/guests/spec.js` + `config/experts.json` v1 + the quote-desk API;
  - voice: cues.js SOUNDS + `parseCues().sounds`;
  - slides: a `public/js/slides/index.js` registry where every template has `drawSlide`/`drawWallSlide` placeholders;
  - demo: fixture corpus v2 (article pages and quotes) + 'plan'/'part' answers in the schema.

**Hub-file rules** (append-log in CONTRACTS.md "### wave-3 hub edit log": time, stream, file, function, what, why).
A hub's owner edits freely. A listed guest stream may make only small surgical edits: re-read right before, smallest diff,
no reformatting, and log every edit.

| Hub | Owner | Surgical guests (and only for) |
|---|---|---|
| server/producer.js | w3-produce | w3-format (normalizer call sites), w3-guests (booking call), w3-voice (voice-stage call) |
| server/writer.js | w3-format | w3-guests (call to `validateQuoteLines`), w3-voice (pass `parseCues().sounds` to the sound policy, if w3-format has not) |
| config/channel.json | w3-format | none: others file Requests (formats, sounds, guests policy) |
| public/js/cues.js | w3-voice | none (append-only SOUNDS; never rename existing actions; keep test/cues, writer, providers, speechtext green) |
| public/js/director.js | w3-air | none |
| public/js/main.js | w3-air | w3-slides (graphics flags only), w3-voice (`?para`) |
| public/js/studio.js | w3-slides | w3-studio (only if the Stage needs a new legacy shot routed; prefer host.js STUDIO_SHOTS) |

Files nobody edits in wave 3: v2 hands.js, rig.js, tracks.js, cast/<presenter>.js, kit-a.js, wardrobe-b.js, outfit.js.
A request goes in CONTRACTS.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Serial AI too slow for deadlines | Plan merged with P1; EDF scheduling; risk-based review; deterministic writer at the deadline; light mode; lead target 10 min; parallel second provider. |
| Thin sources make long blocks padded or repetitive | Dossiers (article bodies, same-event outlets); depth-scaled treatment; optional parts dropped; clock elasticity; variety memory; "never pad" in validators. |
| Misattribution or defamation through re-staging | Server-filled verbatim text; quote-desk attribution; eligibility exclusions; labels; review; audit log; kill switch; adversarial tests. |
| Offensive or inaccurate likeness | Clamped sliders; likeness tiers; generic fallback; a gallery reviewed by critics; per-programme switch; owner sample before default-on. |
| Client race between parts and voice (cf. the 22:50 montage bug) | Prefetch at part start; preload pictures and clips; ladder; never-black rule; simulated late-part tests. |
| 24/7 leaks with longer blocks and more looks | LRU by bytes; look cache LRU; 6 h soak with heap checks (client and server). |
| Voice CPU overload, causing mid-part voice switches | Deadline queue; 2 workers; voice-lead metric; optional segments skipped rather than switched. |
| Paralinguistics sound cheesy | Sparse caps; A/B lab; owner sample; off switch. |
| Verbatim reading of article bodies (copyright) | Presenters paraphrase; the deterministic writer is capped at 2 body sentences per story; quotes are short and credited. |
| Server restart loses in-flight blocks | w3-produce snapshots queue and parts to `data/station.json` (stretch); the client stands by and recovers. |
| Hub-file collisions and leftovers from wave 2 | Phase-0 preconditions; ownership table; append log. |
| Long-form overrides contradict old bibles | Format addenda in each bible with explicit precedence. |

## 12. Wave-level acceptance (checked by the post-merge INTEG on port 8709)

1. **2 h offline demo with long programmes.** `npm run demo:offline`, `?autostart=1&voice=mute` and with Kokoro:
   - blocks land in the ranges of §1 (client logs);
   - NEWS IN 60 within ±90 s of :00/:30 once the clock is on;
   - no standby screen after the first block;
   - lead never < 240 s (server log);
   - 0 black frames (frame sampler); 0 console errors.
2. **6 h soak:** heap growth < 10 %/h after warm-up (client and server); no stall; at least one forced AI delay, one forced
   AI failure and one forced voice delay exercised, each handled by the ladder or the deterministic writer.
3. **Content:** every long block uses ≥ 3 distinct slide templates and ≥ 1 expert. Re-staged interviews appear when the
   fixture material allows, always labelled, with audit entries. The §9 variety metrics hold over the 6 h simulation.
4. **Tests:** the responsible-design adversarial suite, the voice metrics (§7) and the gesture-density metrics (§8) are
   green. The full `node --test` is green (re-run timing-sensitive tests alone under load).
5. **Visual:** deterministic contact sheets for every slide template, guest look gallery, chair, wall, split and remote
   framings, and a long-block storyboard, all in `$SP/shots/w3-*/`, critiqued for finish (adult tone, pixel craft, eased
   motion, readable at 1x).

## 13. Open questions for the owner

1. Block lengths and hourly clock (§1): WORLD NOW 26, TECH/COSMOS 14, MONEY 9 (keep the name?), NEWS IN 60 at :00 and :30.
2. The new programme **IN THEIR WORDS**: yes or no? Name, host (proposed: Lola Byte) and frequency.
3. Grave stories: re-stage officials' statements (e.g. a minister on a disaster), or quote cards only (proposed default)?
4. Politicians and heads of state: allow re-staging under the balance rule (proposed), or exclude politicians at first?
5. The experts roster: 8 desks as proposed? Approve the names (w3-guests proposes, checked against famous names). May
   experts chuckle lightly in banter?
6. AI budget: about 20-24 calls/hour and 4-5 M input tokens/day on the gpt-6-luna/codex plan. Is the overnight light
   edition OK?
7. Paralinguistics on by default after the A/B reel? (COSMOS and UNIT-8 without laughs, per the bible.)
8. Real data adapters (markets, weather, space weather; these need network and keys), or only figures stated in stories
   (proposed default)?
9. Run voices on the owner's machine (2 Kokoro workers) for the 24/7 channel?
10. Weekend WEEK IN REVIEW in WORLD NOW's third part: OK?
