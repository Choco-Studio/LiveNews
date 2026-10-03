# Pacing: one table for a 24/7 channel

Owner, 18:52: *"maybe very fast — this runs 24/7."* Owner, 23:10: *"analyse what runs TOO FAST in the programme and regulate it
well: transitions, cooldowns... entertaining, polished programmes of up to 10 minutes."*

This document is the PACE stream's record: how the channel's rhythm is measured, the targets (one table,
`public/js/pace.js`), the numbers before and after, what still limits programme length, and what wave 3 should reuse.

<!-- TABLES:BEGIN -->
## 0. Before / after at a glance (recorded, v2 path, server Kokoro voices)

BEFORE = `before-3prog.mp4` (tree at e3ae339, 22:48, before the pace stream), AFTER = `after-3prog.mp4` (this round). Both
recorded with `tools/showcase/record-show.mjs --v2 --start open --until next-open+20 --count 3` on the offline demo
(fixture feeds, mock writer, `VOICE_ENGINE=kokoro`), analysed with `tools/pace/analyse.mjs`, tabled with
`tools/pace/compare.mjs`. Shots are counted as the viewer saw them (a focus-only re-set of the same wide two-shot is not a
cut). "—" = not measurable in that build (the BEFORE build has no pace traces: no strap wipe-in instant, ticker pushes or
fired gestures) or no such pause in that episode. Pauses are measured from the voice stems (voiced offset → onset).

### WORLD NOW

| measure | before | after | target |
| --- | --- | --- | --- |
| length (s) | 122.97 | 230.80 | 480-600 |
| stories | 8 | 14 | — |
| shortest shot (s) | 4.32 | 4.13 | ≥ 4 |
| shot p10 (s) | 5.04 | 5.42 | — |
| shot median (s) | 5.75 | 6.84 | 5-7 |
| shots under 4 s | 0 | 0 | 0 |
| cuts per minute | 8.11 | 7.70 | ≤ 8 |
| same framing twice | 0 | 0 | 0 |
| shortest map (s) | 4.32 | 5.25 | ≥ 5 |
| pause between segments, median (s) | 0.48 | 0.84 | 0.7-1.5 |
| hand-over pause (s) | 0.48 | 0.86 | 0.85 |
| story-to-story pause (s) | — | — | 1 |
| chat turn pause (s) | 0.48 | 0.50 | 0.5 |
| block pause (s) | 0.48 | 1.28 | 1.3 |
| before And finally (s) | 0.46 | 1.22 | 1.2 |
| open → first word (s) | 0.12 | 0.62 | 0.5 |
| last word → end card (s) | 0.76 | 1.95 | 1.5 + 0.4 |
| strap in after the cut (s) | — | 1 | 1 |
| shortest ticker item (s) | — | 6.87 | ≥ 6 |
| shortest caption (s) | 1.57 | 1.60 | ≥ 1.2 |
| marked gestures / min talking (max presenter) | — | 4.58 | ≤ 5 |
| same gesture twice in a row | — | 2 | 0 |
| music cue calls / min | 10.25 | 7.28 | ≤ 1.5 bed changes |
| voice gaps > 1.5 s (not cards) | 0 | 0 | 0 |

### TECH BYTES

| measure | before | after | target |
| --- | --- | --- | --- |
| length (s) | 85.30 | 164.30 | 360-480 |
| stories | 4 | 10 | — |
| shortest shot (s) | 4.86 | 4.84 | ≥ 4 |
| shot p10 (s) | 5.13 | 5.44 | — |
| shot median (s) | 5.99 | 7.79 | 4.5-6.5 |
| shots under 4 s | 0 | 0 | 0 |
| cuts per minute | 6.98 | 6.53 | ≤ 9 |
| same framing twice | 0 | 0 | 0 |
| shortest map (s) | — | 5.24 | ≥ 5 |
| pause between segments, median (s) | 0.50 | 0.70 | 0.7-1.5 |
| hand-over pause (s) | 0.52 | 0.69 | 0.7 |
| story-to-story pause (s) | — | — | 0.9 |
| chat turn pause (s) | 0.48 | 0.44 | 0.42 |
| block pause (s) | — | 1.06 | 1.15 |
| before And finally (s) | 0.46 | 0.96 | 1 |
| open → first word (s) | 0.11 | 0.61 | 0.5 |
| last word → end card (s) | 0.76 | 1.48 | 1 + 0.4 |
| strap in after the cut (s) | — | 1 | 1 |
| shortest ticker item (s) | — | 6.90 | ≥ 6 |
| shortest caption (s) | 1.23 | 1.37 | ≥ 1.2 |
| marked gestures / min talking (max presenter) | — | 7.74 | ≤ 6 |
| same gesture twice in a row | — | 4 | 0 |
| music cue calls / min | 11.25 | 8.40 | ≤ 2 bed changes |
| voice gaps > 1.5 s (not cards) | 0 | 0 | 0 |

### NEWS IN 60

| measure | before | after | target |
| --- | --- | --- | --- |
| length (s) | 59.57 | 72.03 | 60-120 |
| stories | 6 | 6 | — |
| shortest shot (s) | 4.19 | 4.44 | ≥ 4 |
| shot p10 (s) | 4.28 | 4.82 | — |
| shot median (s) | 5.88 | 6.08 | 4-6 |
| shots under 4 s | 0 | 0 | 0 |
| cuts per minute | 9.33 | 8.36 | ≤ 10 |
| same framing twice | 0 | 0 | 0 |
| shortest map (s) | 5.18 | 5.39 | ≥ 4 |
| pause between segments, median (s) | 0.48 | 0.78 | 0.7-1.5 |
| hand-over pause (s) | — | — | 0.75 |
| story-to-story pause (s) | 0.48 | 0.76 | 0.75 |
| chat turn pause (s) | — | — | 0.5 |
| block pause (s) | 0.49 | 0.90 | 0.9 |
| before And finally (s) | — | — | 1.2 |
| open → first word (s) | 0.13 | 0.43 | 0.3 |
| last word → end card (s) | 0.74 | 1.45 | 1 + 0.4 |
| strap in after the cut (s) | — | 1 | 1 |
| shortest ticker item (s) | — | — | ≥ 6 |
| shortest caption (s) | 0.90 | 0.90 | ≥ 1.2 |
| marked gestures / min talking (max presenter) | — | 1.06 | ≤ 2 |
| same gesture twice in a row | — | 0 | 0 |
| music cue calls / min | 17.12 | 14.16 | ≤ 1.2 bed changes |
| voice gaps > 1.5 s (not cards) | 1 | 1 | 0 |

Reading the tables: the programmes now breathe (every pause was ~0.48 s; now hand-overs ~0.7-0.86 s, blocks ~1.1-1.3 s,
"And finally" ~1.0-1.2 s, the open ~0.6 s before the first word, the sign-off ~1.5-1.95 s on the wide before the end card),
graphics are paced (strap 1 s after the cut, ticker items ≥ 6.9 s), cuts slowed slightly (8.1 → 7.7 per minute in WORLD
NOW), and the programmes doubled in length with more stories (WORLD NOW 123 → 231 s, TECH BYTES 85 → 164 s) — still far
from the 6-10 minute targets for the reason in section 6.2. Still off target, owned by other teams: TECH BYTES marked
gestures 7.7/min with 4 immediate repeats (w2-hands is adopting `gestureBudget`), music cue calls 7-14 per minute (the
showcase recorder now reports bed changes against `paceFor(id).music`: BEFORE WORLD NOW 5 bed changes in 119 s, shortest
bed 11 s against 25), one NEWS IN 60 caption page at 0.9 s, NEWS IN 60's 1.2-1.7 s pause after the intro (the intro shot's
hold, intended).
<!-- TABLES:END -->

## 1. What a viewer now sees

- **Air between segments.** Every segment used to be followed by the same 0.3 s (measured 0.42 s between voices,
  everywhere: hand-overs, chat turns, before "And finally", after a round-up). Now the pause is chosen by what comes next:
  a hand-over breathes about 0.8 s, a chat turn 0.4-0.5 s, a block boundary (after the round-up, after "Still to come")
  1.2-1.3 s, "And finally" gets its 1.0-1.2 s beat, the sign-off holds 1.5 s on the wide before the end card. A few percent
  of seeded variation per episode keeps the rhythm from sounding mechanical.
- **No shot under 4 s, fewer cuts.** The cut cooldown is now 4 s everywhere (COSMOS 4.5 s) in the v2 runtime and the
  legacy director (it was 3 s), the legacy headline frame floor 3.8 s (was 2.6 s). On the v2 path the planner already kept
  visible shots ≥ 4 s before this round (measured: 0 under 4 s before and after once focus-only re-sets are merged); cuts
  went from 8.1 to 7.7 per minute in WORLD NOW and the shot median from 5.8 to 6.8 s.
- **The open breathes.** The first word now comes 0.5 s after the cut from the open (COSMOS 0.7, NEWS IN 60 0.3), not 0.1 s.
- **Graphics are readable.** The strap enters 1.0 s after the cut; ticker items hold at least 6 s (3 words 6.45 s, 7 words
  8.2 s, 11 words 10 s), captions page at most 15 characters per second and never shorter than 1.4 s, a long strap pages
  every 5.5 s.
- **Longer programmes.** WORLD NOW airs 14 stories (before: 8), TECH BYTES 10 (before: 4), COSMOS 8 (3), MONEY MINUTE 7 (3),
  each with the editorial arc of its bible (section 6). How long that makes them is limited by how much the sources say
  (section 6.2).

## 2. How it is measured (tools/pace/)

| tool | what it does |
| --- | --- |
| `tools/showcase/record-show.mjs --v2` | the full recording with sound (picture, server voices, jingles, beds) and its `-timeline.json` |
| `tools/pace/trace.mjs` | the same timeline in a few minutes: the real channel page on Playwright's fake clock (showcase `page-init.js`), recorded voices ending at their true length, no audio render; a contact sheet every 12 s |
| `tools/pace/analyse.mjs` | reads either timeline (+ the recorder's stems when kept) and measures every row below against the programme's profile; `--json` adds one-line summaries |
| `tools/pace/compare.mjs` | before/after tables from two analyser JSONs (section 4) |
| `tools/pace/strips.mjs` | writes the measured shot / speech / pause strips into the lab page |
| `tools/pace/plans.mjs` | lays every v2 segment plan of an episode on one clock (no browser): planned shots, gestures, looks (the unit tests use it) |
| `tools/pace/simulate.mjs` | produces a whole rotation with the server's own pipeline (fixture feeds + mock writer) and estimates each episode's air time against its target; `--per-source`, `--channel` try alternatives |
| `public/lab/pace.html` | three views: *rhythm* (an episode's planned rhythm before/after), *profiles* (the table), *measured* (the recordings' real strips) |

```sh
PORT=8710 VOICE_ENGINE=kokoro QUEUE_SIZE=4 timeout 3000 npm run demo:offline &
node tools/pace/trace.mjs --port 8710 --v2 --start open --until next-open+20 --count 3 --out $SP/pace/after
node tools/pace/analyse.mjs $SP/pace/after-timeline.json --json $SP/pace/after.json
node tools/pace/compare.mjs $SP/pace/before.json $SP/pace/after.json
node tools/pace/strips.mjs $SP/pace/before.json $SP/pace/after.json   # → public/lab/pace.html ?view=measured
```

What the analyser measures, per programme: length (open's first frame → end card's last); visible shot lengths (min, p10,
median, p90; a focus-only re-set of the same wide camera is not a cut, the Stage's cut traces decide), cuts per minute
outside the headline montage, shots under the minimum, identical framings twice in a row, same full-screen type runs;
camera moves; dwell per shot type (map, picture, fact card, montage frame, breaking card); captions (page time, characters
per second); the pause between utterances by kind (story, hand-over, chat turn, into/out of a chat, round-up item, block,
before "And finally", after the intro, before the outro, after the breaking card); speech rate; open → first word; last
word → end card; montage frames against their teaser lines; stingers and the shot before each; strap entry after the cut and
flips; ticker holds; marked gestures, nods and looks per presenter per minute of talking/listening; music cue calls; studio
holds longer than the profile's `staticMax` without a move or a reaction; voice gaps > 1.5 s and dead air (with stems);
breaks (ident, ads, promo); production lines from a server log (write + voice budget, synthesis rate).

The pace traces come from `paceTrace()` (public/js/pace.js): the Stage logs each visible cut (framing, move) and each
gesture / look / emotion its cue clock fires, the director logs when the strap really wipes in, the ticker logs each
push. Outside the recorder `paceTrace` is a no-op (nothing is kept on a 24/7 page).

## 3. The targets (public/js/pace.js)

Derived from the programme bibles (docs/programmes/*.md), the owner's 24/7 rules (18:52, 20:40, 22:50) and newscast
practice. Every consumer reads these numbers; nothing in the director, the v2 runtime, the shot planner or the graphics
keeps its own copy.

| | WORLD NOW | TECH BYTES | COSMOS | MONEY MINUTE | NEWS IN 60 | why |
| --- | --- | --- | --- | --- | --- | --- |
| personality | measured | lively, never frantic | slow, contemplative | crisp | brisk but readable | bibles |
| length target | 8-10 min | 6-8 | 6-8 | 4-6 | 1-2 | owner 23:10 |
| shortest shot / cut cooldown | 4 / 4 s | 4 / 4 | 4 / 4.5 | 4 / 4 | 4 / 4 | owner 18:52 |
| shot median | 5-7 s | 4.5-6.5 | 6-9 | 5-7 | 4-6 | owner 18:52, cosmos.md |
| cuts per minute (outside montages) | ≤ 8 | ≤ 9 | ≤ 7 | ≤ 8 | ≤ 10 | practice: 6-8 |
| map / picture | 5-10 / 4-8 s | 5-9 / 4-8 | 4-6 / 6-10 | 4-7 / 4-8 | 4-8 / 4-8 | maps ≥ 5 s; cosmos.md |
| story → story | 1.0 s | 0.9 | 1.3 | 0.85 | 0.75 | world-now.md 0.7 + air; news-60.md 0.7 |
| hand-over (other presenter) | 0.85 | 0.7 | 1.05 | 0.85 | 0.75 | practice 0.5-0.9 |
| chat turn | 0.5 | 0.42 | 0.6 | — | — | conversation, not a read |
| block (after round-up / "still to come") | 1.3 | 1.15 | 1.6 | 1.1 | 0.9 | strap out and in |
| before "And finally" | 1.2 | 1.0 | 1.3 | 1.2 | — | world-now.md 1.0, tech-bytes.md 0.8 + air |
| sign-off hold on the wide | 1.5 | 1.0 | 1.5 | 0.6 | 1.0 | world-now.md, news-60.md |
| open → first word | 0.5 | 0.5 | 0.7 | 0.5 | 0.3 | world-now.md, news-60.md |
| camera moves | ≤ 5, 40 s apart | ≤ 2 | 0 | 0 | 0 | bibles: COSMOS/MONEY/N60 locked off |
| marked gestures / min of own speech | 5 | 6 | 3.5 | 3 | 2 | owner 22:50 (6): don't overuse |
| minimum gap between two marked gestures | 5.5 s | 4.5 | 6 | 6 | 8 | cosmos.md ≤ 1 per 6 s |
| hands at rest (share of speech) | 62 % | 55 % | 72 % | 70 % | 75 % | adult anchor restraint |
| listener reaction gap | 8 s | 7 | 10 | 8 | 8 | owner 17:47: brief, motivated |
| music bed held at least | 25 s | 20 | 35 | 30 | 50 | beds change at block boundaries only |

Channel furniture (`CHANNEL`): stinger 0.8 s (cards.js), ident 4.0 s, promo 5.5 s, black between break elements 0.3 s;
ticker push 0.4 + 4.7 + 0.45 s/word, 6-14 s per item; strap in 0.35 s, text 0.1 s later, flip 0.3 s, out 0.25 s, page
5.5 s; captions 15 cps, page ≥ 1.4 s, linger 0.6 s; programme tag 8 s within 15 s of the open; reading speed for every
"readable twice" hold 3 words/s; `TRANSITIONS` gives each transition type its duration and easing (cut, stinger cut at
half time, strap in/out/flip, wall wipe, map zoom, pin pan, ticker push, COSMOS dip).

Helpers: `gapAfter(episode, i)` (the pause after a segment, seeded ± 8 %), `gapKind`, `readTwice`, `tickerHold`,
`factHold`, `cutAllowed` / `cutWait` (cooldown), `isRepeat` (identical framing / same full-screen type limits),
`gestureBudget(id, seconds, { grave })`, `listenerRules(id)`, `estimateAir(episode)`, `paceTrace(ev)`.

### Who reads it

| consumer | what it takes from pace.js |
| --- | --- |
| `public/js/director.js` | pause after every segment (`gapAfter` minus the 0.18 s the playout adds), strap cleared in a block pause, sign-off hold, end card, breaking card, ident, promo, montage frame floor, the first line a breath after the open, cut cooldown (legacy path), strap entry 1 s after the cut, programme tag window |
| `v2 runtime/direction.js` | cut cooldown, stinger, the per-segment pause the plans are timed against, the intro's breath |
| `v2 direction/context.js` | `gapAfter` may be a per-segment function (one per episode) |
| `v2 direction/shots.js` | minimum shot, headline beat floor, per-programme studio max, single split, picture / map windows, sign-off hold |
| `v2 runtime/stage.js` | trace lines only (cuts, fired gestures/looks) |
| `graphics/strap.js, ticker.js, captions.js, index.js` | every in/out/dwell timing (`STRAP_TIMING`, `TICKER_TIMING`, `CAPTION_TIMING`, `PROGRAM_TAG` are now pace values) |
| `config/channel.json` | `targetSeconds` mirrors `length.target` (tested), read by the writer prompt and the mock |
| w2-hands / w2-face (requested) | `gestureBudget`, `listenerRules` |
| music / showcase (requested) | `music.minBed`, `changeOn: 'block'`, `maxChangesPerMin` |

## 4. Before and after

Recorded on the v2 path (`?v2=1`) with the server's Kokoro voices, offline fixture feeds, mock writer. BEFORE = the tree at
commit e3ae339 (22:48, before the pace stream), AFTER = this round. The tables are generated by `tools/pace/compare.mjs`
and pasted at the top of this file (section 0); `public/lab/pace.html?view=measured&programme=world-now` draws the same two
recordings as strips (shots, who speaks, every pause green when it is the profile's, red when rushed).

The default path (no `?v2`, the legacy director, still the channel's default until v2 ships) was checked in the real
offline channel with `tools/pace/trace.mjs` (no `--v2`): WORLD NOW and TECH BYTES air with the same pauses (hand-over
0.79 / 0.64 s, block 1.25 / 1.07 s, before "And finally" 1.17 / 0.85 s, open → first word 0.6 s, sign-off 1.9 / 1.4 s),
3.8 s headline frames (was 2.6 s), strap 1 s after the cut, ticker ≥ 6.9 s. This round also removed the default path's
studio flash after the headline montage (montage → wide 1.0 s → breaking stinger; montage → wide 0.54 s → first story):
the story now cuts straight from the montage's last frame (owner 20:40, item 2).

## 5. Variety against monotony

- Shot grammar varies per programme (bibles) and per story (the planner picks from the story's data); identical framings
  twice in a row are never planned (`isRepeat`, tested on the fixtures) and were measured 0 on air.
- The pause rhythm varies with the editorial structure (story, hand-over, chat, block, "And finally") and a seeded ±8 %.
- A mid-programme "Still to come" (WORLD NOW, TECH BYTES, COSMOS) signposts the second half; the block pause around it
  and the strap clearing make the boundary audible and visible.
- Beds should change only at block boundaries (request to music / showcase: today every segment re-cues, 8-14 cue calls per
  minute).

## 6. Programmes up to ~10 minutes

### 6.1 The arc (config/channel.json + server/providers/mock.js + server/writer.js)

- WORLD NOW: headlines → greeting → strong lead (+ a sober analysis exchange when the summary has a detail to spare) →
  main stories with the number of the day → "Still to come" → round-up (up to 5 items, one map each) → And finally → a
  short chat → sign-off. 14 stories.
- TECH BYTES: cold open → lead with THE CATCH → main stories with exchanges → number → "Still to come" → And finally →
  button. 10 stories.
- COSMOS: lead → UNIT-8's restatement → number (the Reading) → main stories → "Still to come" → And finally → idiom. 8.
- MONEY MINUTE: lead → main → markets → the number of the day last. 7 stories.
- NEWS IN 60: the fit step still aims at 60 s (news-60.md formula).
- The writer prompt states the running time ("This programme runs about X to Y minutes. Reach it with the stories and their
  depth..., never by padding, repeating or slowing down. A thin summary makes a short story.").

### 6.2 What limits the length today (measured)

`tools/pace/simulate.mjs` (the server's own pipeline, 7-slot rotation), estimated air time at natural speech rates with the
pace gaps:

| | before (stories) | after (stories) | target |
| --- | --- | --- | --- |
| WORLD NOW | 113-128 s (8) | 210-231 s (14) | 480-600 s |
| TECH BYTES | 87 s (4) | 168 s (10) | 360-480 s |
| COSMOS | 86 s (3) | 203 s (8) | 360-480 s |
| MONEY MINUTE | 64 s (3) | 129 s (7) | 240-360 s |
| NEWS IN 60 | 64-67 s (6) | 68-71 s (6) | 60-120 s |

(Both columns estimated with the same speech rates and the same pace pauses, so they compare content only; BEFORE = the
tree at e3ae339 with this simulator copied in.)

Two caps were found:
1. **The desk's per-outlet cap** (`NewsDesk.candidates`, 3 per outlet): offline five outlets gave WORLD NOW at most 9
   candidates, MONEY MINUTE 3 (and live, business has one feed: MONEY MINUTE could never exceed 3 stories). Editorial-2 fixed
   it (a second, uncapped pass when a section has few outlets).
2. **Source depth.** The offline fixture summaries are 2-3 sentences (26-39 words); the real feeds' RSS descriptions are
   similar. One story is then 10-20 s of speech, whatever the writer does without inventing. Doubling the stories doubled
   the programmes; reaching 8-10 minutes honestly needs deeper copy per story: article text (the first 4-6 paragraphs of
   the article page the desk already fetches for pictures), `content:encoded` wire copy, or the wave-3 research step.
   Editorial-2 answered both: the desk now fills past the per-outlet cap when a section has few outlets, and 24 fixture
   summaries got 1-2 more factual sentences (the "after" column above includes both). The rest is for wave 3.

### 6.3 Production ahead of air

The write stage is instant offline (mock: 0.1-1 s per episode; `simulate.mjs` prints it). The voice stage is the budget:
it waits up to 90 s (config `budgetSeconds`), then the episode is queued and late clips attach as they finish; a segment
still without its clip at air time falls back to the browser voice (graceful, never a stall). Measured from the server logs
of these recordings (`analyse.mjs --server-log`):

| episode (AFTER) | speech | synthesis wall time | speech / synthesis |
| --- | --- | --- | --- |
| WORLD NOW, 14 stories (11 of 19 clips cached) | 203 s | 347 s | 0.59x |
| TECH BYTES, 10 stories (7 of 16 cached) | 145 s | 737 s | 0.20x |
| NEWS IN 60 (5 of 8 cached) | 57 s | 727 s | 0.08x |
| COSMOS, 8 stories (4 of 15 cached) | 173 s | 1144 s | 0.15x |

This machine is 4 cores shared by ~15 agents and several Kokoro servers (load 23-30); earlier in the day, on a quieter
machine, the same stage ran at 1.15x real time (115 s of TECH BYTES speech in 100 s). The rotation needs about 0.55 s of
speech per second of air (programmes + breaks), so ≥ 1x synthesis keeps a QUEUE_SIZE 2-4 queue ahead indefinitely; under
heavy load the queue drains and the browser-voice fallback keeps the channel on air. For longer programmes (wave 3) the
budget must become per block: synthesise block N+1 while block N airs.

## 7. Still open (other teams' files unless noted)

- **Gestures** (w2-hands, adopting `gestureBudget()` now): on air TECH BYTES still had 6.7-7.7 marked gestures per minute
  of talking against 6 and up to 4 immediate repeats; WORLD NOW 4.6/min (within 5) with one repeat.
- **Music** (music / showcase): 7-14 cue calls per minute; the recorder now reports bed changes against `music` (BEFORE WORLD
  NOW 2.5 changes/min, shortest bed 11 s against 25): the bed engine's cue sheet should change beds only at block boundaries.
- **Length** (editorial-2 / wave 3): source depth (section 6.2); WORLD NOW ~4 min, TECH BYTES ~3 min offline today.
- **TECH BYTES singles** (w2-camera): two-sentence stories without a map or photo hold one single for 10-12 s (median shot
  7.8 s against 4.5-6.5): `splitLongSingles` needs a sentence start ≥ 4.5 s from both ends, which short second sentences
  rarely give. Lowering `singleSoft` alone changed nothing (tried 8.5 s, reverted).
- **Captions**: a one-word sentence ("Respectfully.") pages for 0.9 s on the director's clock (graphics hold it 1.4 s on
  screen by `CHANNEL.captions.minPage`).
- **Default path only** (director.js, pace): a story's last beat delayed by the 4 s cooldown can air for 2-2.5 s before the
  next segment (once per programme in the trace).
- **Production under load**: synthesis ran at 0.08-0.59x real time on this shared machine; the fallback voice covers it.

## 8. For wave 3 (20-30 minute rolling programmes)

Reuse:
- `public/js/pace.js` as the single table: add segment kinds (interview turn, expert analysis, correspondent link, explainer
  card) as new `gaps` keys and `gapKind` cases; keep every consumer reading it.
- `gapAfter(episode, i)` already accepts any segment list: a rolling programme can call it per appended block.
- `estimateAir(episode)` to budget a block's air time before it is written / voiced, and `length.target` per block.
- `gestureBudget` / `listenerRules` for guests and experts (a guest's turn is a long speech: the per-minute budget scales).
- `tools/pace/trace.mjs` + `analyse.mjs` + `compare.mjs` as the acceptance harness for long programmes (the tracer runs
  ~3x real time, so a 30-minute programme traces in about 10 minutes).
- The production measurement: synthesis rate vs air; with 20-30 minute programmes the voice budget must become per block
  (synthesise block N+1 while N airs), not per episode.
