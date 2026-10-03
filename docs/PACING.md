# Pacing: one table for a 24/7 channel

Owner, 18:52: *"maybe very fast — this runs 24/7."* Owner, 23:10: *"analyse what runs TOO FAST in the programme and regulate it
well: transitions, cooldowns... entertaining, polished programmes of up to 10 minutes."*

This document is the PACE stream's record: how the channel's rhythm is measured, the targets (one table,
`public/js/pace.js`), the numbers before and after, what still limits programme length, and what wave 3 should reuse.

## Fix round 1 (critics r1, 03:30-04:40): what changed, measured again

The analyser is stricter now, so these tables show more red than the first round's: every shot is checked against BOTH
ends of its window (`shotMax`), the median tolerance is +0.5 s (was +1.5 s), and it adds variety (map share, single share,
map runs, the same beat order story after story, what And finally ends on), the gesture floor and vocabulary, listener nods
per minute, live-mix silences over 1.0 s, the break load and the browser-voice fallback share. Length is red when it is off
target, in the analyser and in the lab.

What changed on air:
- **Default path, the blocker.** The headline montage follows the voice. There is one frame per teased line, cut on that
  line's first word and held at least 3.8 s. NEWS IN 60's greeting-only intro ("This is NEWS IN 60. I'm Sam Night.") gets
  no montage: the wide, then the first story. Before this fix it aired 9.0 s of silent headline frames. Measured now: 0.51-0.55 s
  between the intro and the first story. A fake-clock test (`tools/pace/fakeplay.mjs`) checks every fixture episode.
- **Default path, cut rules.** The opening cut waits for the cooldown when a studio shot is on air. A later beat is taken only
  when it can air the minimum shot plus a 1 s margin before the next segment, and beats are capped at one per cooldown of the
  estimated air. "Time left" is estimated from the moment of the cut. The rules from pace.js now apply: `isRepeat` (no repeat
  of the wide or the same close), a fact card gives way after `factMax`, and any shot past its maximum gives way to a relief.
  A relief is never a wide that the following chats would carry on. The round-up keeps at most `mapRun` maps in a row. And
  finally never ends on a map. On the 27 fixture episodes (fake clock), no shot is under 4 s. Two shots run over their
  maximum where nothing can split them.
- **v2 planner (shots.js).** Maps, pictures and figure cards are never planned past `shotMax`. They hand back to the single
  at a sentence start, else on a word that opens a phrase (a `mid` cue). Round-ups break after two maps (the item's picture,
  else its reader). And finally ends on its picture or presenter. A two-sentence single over `singleSoft` splits on a comma.
  The last headline frame holds 3.8 s: the greeting starts under it and the wide cuts on its first phrase word. A COSMOS chat
  run under 4 s gets the story's last phrase on the wide. The private `factHold` is gone. The runtime guard's
  card maximum is `factMax`. The MONEY MINUTE intro stays on the wide throughout, as money-minute.md §3.5 says (14-20 s
  against studioMax 12). A split was tried and reverted: the camera test and INTEGRATION's intro guard follow the bible. The
  orchestrator should settle it.
- **v2 runtime.** The NEWS IN 60 intro no longer waits for the wide's 4 s. The story's voice starts after the 0.6 s pause,
  and its opening cut waits for the cooldown. The sign-off cue starts under the hold, 0.15 s after the last word.
- **Editorial (length and beat keys only).** "Around the world in 30 seconds" is said only when the run is about that long. The
  NEWS IN 60 target is back to 55-70 s, and the writer prompt says it in seconds. WORLD NOW's style text says "five to seven
  main stories", which matches `stories: 14`.

v2 path, real offline channel (`trace.mjs --v2 --count 5`, estimated voices, 04:01):

| programme | length (target) | shots min / median | cuts/min (max) | over max | map share / map run / same order run | after intro | first word | montage frames | And finally ends on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NEWS IN 60 | 69 s (55-70) ✓ | 4.0 / 6.2 ✓ | 7.8 ✓ | map 9.6 > 8 ✗ | 41% / 3 / 1 (bible: one map, pin pans) | 0.52 s | 0.41 s | none | — |
| WORLD NOW | 250 s (480-600) ✗ | 4.5 / 6.8 ✓ | 8.1 ✗ | 0 ✓ | 31% / 2 / 3 ✗ | 0.64 s | 0.61 s | 4.7 / 3.9 / 3.9 | single |
| TECH BYTES | 180 s (360-480) ✗ | 4.5 / 6.8 ✓ | 8.0 ✓ | wide 13.5 > 12 ✗ (chat + sign-off) | 0% / 0 / 1 ✓ | 0.72 s | 0.60 s | 4.2 / 4.2 | picture |
| NEWS IN 60 | 74 s (55-70) ✗ | 4.0 / 6.0 ✓ | 9.0 ✓ | 0 ✓ | 0% / 0 / 1 ✓ | 0.51 s | 0.41 s | none | — |
| COSMOS DESK | 197 s (360-480) ✗ | 4.7 / 6.9 ✓ | 7.3 ✗ | picture 12.5 > 10 ✗ | 11% / 1 / 1 ✓ | 0.78 s | 0.80 s | none | picture |

The first round's critic measured NEWS IN 60's v2 pause after the intro at 1.57 s; it is now 0.51 s. WORLD NOW's third
headline frame was 2.9 s; it is now 3.9 s. The WORLD NOW round-up was 40 s of maps; it now runs at most two map items in
a row, with a picture between them.

<!-- DEFAULT-PATH:BEGIN -->
Default path (the legacy director, still the channel default), same server, `trace.mjs --count 5` without --v2, final code (04:30):

| programme | length (target) | shots min / median | cuts/min (max) | over max | map share / map run / same order run | after intro | first word | montage frames | And finally ends on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WORLD NOW | 254 s (480-600) ✗ | 4.0 / 7.0 ✓ | 8.0 ✓ | wide 15.6 > 15 ✗ | 38% / 2 / 2 ✗ | 0.70 s | 0.61 s | 4.7 / 3.8 / 3.8 | single |
| TECH BYTES | 175 s (360-480) ✗ | 4.0 / 5.7 ✓ | 9.0 ✓ | 0 ✓ | 10% / 1 / 1 ✓ | 0.63 s | 0.60 s | 4.7 / 4.6 / 3.8 | full |
| NEWS IN 60 | 76 s (55-70) ✗ | 4.0 / 5.1 ✓ | 10.5 ✗ | 0 ✓ | 20% / 1 / 1 ✓ | 0.51 s | 0.40 s | none | — |
| COSMOS DESK | 208 s (360-480) ✗ | 4.3 / 6.1 ✓ | 8.7 ✗ | wide 16.1 > 15 ✗ | 13% / 1 / 1 ✓ | 0.78 s | 0.80 s | 5.3 / 3.8 / 3.8 | single |
| WORLD NOW | 230 s (480-600) ✗ | 4.0 / 6.4 ✓ | 8.8 ✗ | 0 ✓ | 29% / 2 / 1 ✓ | 0.72 s | 0.60 s | 3.8 / 3.8 / 4.4 | fact |

(break load on this run: 5 breaks in 1255 s, ads 20 %)

On the default path no shot is under 4 s in any programme. NEWS IN 60's pause after the intro is 0.51 s (it was 9.02 s, the
blocker). TECH BYTES' And finally ends on its picture. The headline frames hold at least 3.8 s on the teased lines. Still
over: WORLD NOW / COSMOS chats and the sign-off share one wide of 15.6-16.1 s (studioMax 15; the bibles keep both on the wide).
The cut rate in NEWS IN 60 (10.5 against 10), COSMOS (8.7 against 7) and one WORLD NOW (8.8 against 8) comes from 4.0-4.5 s
beats in the default path's per-sentence grammar. Spacing the beats by the median band's middle was tried: it dropped the
map of every short COSMOS story, so it was reverted. The v2 path (the next default) cuts COSMOS 7.3 and NEWS IN 60 7.8-9.0
times a minute.
<!-- DEFAULT-PATH:END -->

Break load, measured: 6 commercial breaks in 1144 s, ads 26 % of air. Programme air between breaks was 69-250 s, against
the new targets of 15 % and 420 s. `CHANNEL.breaks.minProgrammeBetween` / `maxAdShare` are the contract; server/station.js
belongs to editorial-2, so this is requested in CONTRACTS.

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

Recordings (scratchpad `video/pace/`): `before-3prog.mp4` / `after-3prog.mp4` (full, 1920x1080, with their `-timeline.json`,
`-sheet.png` every 15 s and `-audio.png`), compressed copies 1152x648: `pace-before-world-now.mp4` (BEFORE WORLD NOW, 125 s),
`pace-after-world-now-nobeds.mp4` (AFTER WORLD NOW, 14 stories, 233 s), `pace-after-tech-bytes-nobeds.mp4` (UP NEXT promo →
TECH BYTES, 174 s). The AFTER recording has voices, jingles, stingers and the ads' own beds but no programme music beds: every
server on the machine was killed while its bed stage ran (two retries were lost the same way).

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
  8.2 s, 11 words 10 s; `tickerHold`), a long strap pages every 5.5 s. Captions page with the voice and target 15 characters
  per second, never shorter than 1.4 s on screen: measured on the Kokoro AFTER recording, 6-9 pages per programme ran over
  17 cps (a fast-spoken sentence) and one NEWS IN 60 page was cut at 0.9 s on the director's clock (a one-word sentence), so
  the 15 cps is a target the captions do not enforce yet (graphics, section 7).
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
| length target | 8-10 min | 6-8 | 6-8 | 4-6 | 55-70 s | owner 23:10; news-60.md 55-65 s |
| shortest shot / cut cooldown | 4 / 4 s | 4 / 4 | 4 / 4.5 | 4 / 4 | 4 / 4 | owner 18:52 |
| shot median | 5-7 s | 4.5-6.5 | 6-9 | 5-7 | 4-6 | owner 18:52, cosmos.md |
| cuts per minute (outside montages) | ≤ 8 | ≤ 9 | ≤ 7 | ≤ 8 | ≤ 10 | practice: 6-8 |
| map / picture | 5-10 / 4-8 s | 5-9 / 4-8 | 4-8.5 / 6-10 | 4-7 / 4-8 | 4-8 / 4-8 | maps ≥ 5 s; cosmos.md (see below) |
| figure card | 4-8 s | 4-8 | 4-9 | 4-8 | 4-7 | read twice, never a dead frame |
| studio shot at most | 15 s | 12 | 15 | 12 | 12 | static holds; owner 18:52 |
| map cuts in a row / map share / single share | 2 / 33 % / 60 % | 2 / 30 % / 55 % | 2 / 33 % / 60 % | 2 / 33 % / 60 % | 2 / 33 % / 60 % | critic r1: 40 s of maps |
| stories in a row with one beat order | 2 | 2 | 2 | 2 | 2 | variety |
| story → story | 1.0 s | 0.9 | 1.3 | 0.85 | 0.75 | world-now.md 0.7 + air; news-60.md 0.7 |
| hand-over (other presenter) | 0.85 | 0.7 | 1.05 | 0.85 | 0.75 | practice 0.5-0.9 |
| chat turn | 0.5 | 0.42 | 0.6 | — | — | conversation, not a read |
| block (after round-up / "still to come") | 1.3 | 1.15 | 1.6 | 1.1 | 0.9 | strap out and in |
| before "And finally" | 1.2 | 1.0 | 1.3 | 1.2 | — | world-now.md 1.0, tech-bytes.md 0.8 + air |
| sign-off hold on the wide | 1.5 | 1.0 | 1.5 | 0.6 | 1.0 | world-now.md, news-60.md |
| open → first word | 0.5 | 0.5 | 0.7 | 0.5 | 0.3 | world-now.md, news-60.md |
| camera moves | ≤ 5, 40 s apart | ≤ 2 | 0 | 0 | 0 | bibles: COSMOS/MONEY/N60 locked off |
| marked gestures / min of own speech | 2.5-5 | 3-6 | 1.8-3.5 | 1.5-3 | 1-2 | owner 22:50 (6) don't overuse; 20:40 not too few |
| a gesture name again within / at segment start | last 3 / ≤ 60 % | same | same | same | same | owner 20:40: repetitive |
| listener nods / min of listening | 1-6 | 1.5-7 | 0.6-4 | — | — | alive, never a nodding dog |
| minimum gap between two marked gestures | 5.5 s | 4.5 | 6 | 6 | 8 | cosmos.md ≤ 1 per 6 s |
| hands at rest (share of speech) | 62 % | 55 % | 72 % | 70 % | 75 % | adult anchor restraint |
| listener reaction gap | 8 s | 7 | 10 | 8 | 8 | owner 17:47: brief, motivated |
| music bed held at least | 25 s | 20 | 35 | 30 | 50 | beds change at block boundaries only |

COSMOS maps: the bible says 4-6 s, but with the owner's 4 s floor and COSMOS's 4.5 s cooldown a map can only hand back to the
reader when 8 s remain, so a map that runs 6-8 s cannot be split; the planner cuts at 4-6 s whenever a sentence start (or a
phrase word) allows, and the table's ceiling is 8.5 s so the analyser flags only the avoidable ones.

Channel furniture (`CHANNEL`): stinger 0.8 s (cards.js), ident 4.0 s, promo 5.5 s, black between break elements 0.3 s
(ads/index.js BREAK_BLACK, tested equal), break cadence (at least 420 s of programme between commercial breaks, ads at most
15 % of an hour: `breaks.minProgrammeBetween`, `breaks.maxAdShare`, for server/station.js — requested), standby retry 6 s and
1.5 s after a playout error;
ticker push 0.4 + 4.7 + 0.45 s/word, 6-14 s per item; strap in 0.35 s, text 0.1 s later, flip 0.3 s, out 0.25 s, page
5.5 s; captions page at the voice (target 15 cps; measured on air: some pages run 17-20 cps when a sentence is spoken
fast, see section 7), page ≥ 1.4 s, linger 0.6 s; programme tag 8 s within 15 s of the open; reading speed for every
"readable twice" hold 3 words/s; `TRANSITIONS` keeps only the transitions whose numbers reach the screen (stinger cut at
half time, strap in/out/flip, ticker push).

Helpers: `gapAfter(episode, i)` (the pause after a segment, seeded ± 8 %), `gapKind` (a block boundary only after a
"Still to come" chat line or a flagged segment, never ordinary copy), `readTwice`, `tickerHold`, `factHold`, `shotMax`
(the top of every shot window), `cutAllowed` / `cutWait` (cooldown), `isRepeat` (identical framing / same full-screen type
limits), `gestureBudget(id, seconds, { grave })`, `listenerRules(id)`, `estimateAir(episode)`, `paceTrace(ev)`.

### Who reads it

| consumer | what it takes from pace.js |
| --- | --- |
| `public/js/director.js` | pause after every segment (`gapAfter`, minus the voice start-up only when a voice plays), strap cleared in a block pause, sign-off hold (its cue under the hold), end card, breaking card, ident, promo, the voice-paced montage floor, the first line a breath after the open; default path: `cutWait` cooldown (the story's opening cut too), `isRepeat`, `shotMax`-style maxima per shot with a seeded relief, `mapRun`, And finally never on a map, strap entry 1 s after the real cut |
| `v2 runtime/direction.js` | cut cooldown, stinger, the per-segment pause the plans are timed against, the intro's breath, the max-hold guard's maxima (`maxHold` = `shotMax`) |
| `v2 direction/context.js` | `gapAfter` may be a per-segment function (one per episode) |
| `v2 direction/shots.js` | minimum shot, headline beat floor (the last frame too), per-programme studio max, single split, picture / map windows, `factHold`, `shotMax` (capMax: maps, pictures, cards never planned past their maximum), `mapRun` in round-ups, sign-off hold |
| `v2 runtime/stage.js` | trace lines only (cuts, fired gestures/looks) |
| `graphics/strap.js, ticker.js, captions.js, index.js` | every in/out/dwell timing (`STRAP_TIMING`, `TICKER_TIMING`, `CAPTION_TIMING`, `PROGRAM_TAG` are pace values; a ticker item holds `tickerHold(words)`) |
| `config/channel.json` | `targetSeconds` mirrors `length.target` (tested), read by the writer prompt and the mock |
| `ads/index.js` | `BREAK_BLACK.duration` = `CHANNEL.breaks.blackGap` (tested equal; ads-1 owns the file) |
| w2-hands (adopted `gestureBudget`; requested `floor`, `vocabWindow`, `startShareMax`) | gesture planner |
| w2-face (requested) | `listenerRules`, `listener.nodsPerMin` |
| editorial-2 (requested) | `breaks.minProgrammeBetween`, `breaks.maxAdShare` (station.js), a voice budget scaled with `estimateAir` |
| music / showcase (requested; the recorder reports bed changes against it) | `music.minBed`, `changeOn: 'block'`, `maxChangesPerMin` |

## 4. Before and after

Recorded on the v2 path (`?v2=1`) with the server's Kokoro voices, offline fixture feeds, mock writer. BEFORE = the tree at
commit e3ae339 (22:48, before the pace stream), AFTER = this round. The tables are generated by `tools/pace/compare.mjs`
and pasted at the top of this file (section 0); `public/lab/pace.html?view=measured&programme=world-now` draws the same two
recordings as strips (shots, who speaks, every pause green when it is the profile's, red when rushed).

All five programmes, AFTER, in one run of the real offline channel on the v2 path (`tools/pace/trace.mjs --v2 --count 6`,
voices estimated at the page's speech rate because this server ran without Kokoro; 01:40):

| | length | stories | shortest / median shot | cuts/min | pause median | hand-over | before And finally | first word | sign-off | gestures/min (max) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WORLD NOW | 231-250 s | 14 | 4.0 / 6.3-7.6 s | 7.8-8.0 | 0.73 s | 0.74-0.76 | 1.09-1.12 | 0.61 | 1.90 | 2.4-2.5 |
| TECH BYTES | 184 s | 10 | 4.3 / 6.2 s | 8.3 | 0.61 s | 0.61 | 0.93 | 0.60 | 1.40 | 3.9 |
| COSMOS | 195 s | 8 | 4.5 / 6.6 s | 7.7 | 0.88 s | 0.92 | 1.28 | 0.81 | 1.90 | 1.5 |
| MONEY MINUTE | 137 s | 7 | 4.1 / 6.0 s | 8.4 | 0.81 s | — | — | 0.60 | 1.00 | 1.0 |
| NEWS IN 60 | 82 s | 6 | 4.0 / 6.5 s | 7.3 | 0.70 s | — | — | 0.40 | 1.40 | 0 |

No visible shot under 4 s and no identical framing twice in a row in any programme; each programme keeps its personality
(COSMOS the slowest pauses and first word, NEWS IN 60 the briskest). Marked gestures fell after w2-hands adopted
`gestureBudget` (TECH BYTES 7.7 → 3.9 per minute of talking); two immediate repeats remain in WORLD NOW / TECH BYTES.

The default path (no `?v2`, the legacy director, still the channel's default until v2 ships) was checked in the real
offline channel with `tools/pace/trace.mjs` (no `--v2`): WORLD NOW and TECH BYTES air with the same pauses (hand-over
0.79 / 0.64 s, block 1.25 / 1.07 s, before "And finally" 1.17 / 0.85 s, open → first word 0.6 s, sign-off 1.9 / 1.4 s),
3.8 s headline frames (was 2.6 s), strap 1 s after the cut, ticker ≥ 6.9 s. This round also removed the default path's
studio flash after the headline montage (montage → wide 1.0 s → breaking stinger; montage → wide 0.54 s → first story):
the story now cuts straight from the montage's last frame (owner 20:40, item 2).

## 5. Variety against monotony

- Shot grammar varies per programme (bibles) and per story (the planner picks from the story's data); identical framings
  twice in a row are never planned (`isRepeat`, tested on the fixtures) and were measured 0 on air.
- Repetition limits on air (fix round 1): round-ups break the map run after two items (`mapRun`; the item's picture or its
  reader), And finally never ends on a map, and maps / pictures / cards never run past their window. The analyser measures map
  share, single share, map runs and "same beat order story after story" (`patternRun`); WORLD NOW still repeats single → map
  → single for three stories in a row on both paths (requested from w2-camera: rotate the order, open ~1 hand-over in 3 on
  the two-shot, `tossEvery`).
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

**Fix round 1, honestly.** The critic is right that the extra minutes came from more stories of the same kind. WORLD NOW airs
14 stories in about 4 minutes. That is a new story every ~18 s, or ~21 s without the round-up. Two things were tried inside
the current architecture:
- The analysis exchange (the partner adds the detail a story kept back) now qualifies on 3-sentence summaries, the lead
  included. It adds presenter interplay, not minutes: the sentence moves from the story to the exchange.
- Depth blocks from data the server already has. Measured with `simulate.mjs` on the offline desk, they cannot reach 6
  minutes without padding. The summaries are 2-3 sentences (world 9/21 have 3, tech 10/15 have only 2). Most WORLD NOW main
  stories in the offline slate are grave, and editorial policy (rightly) puts no chat next to grave news. So the exchanges
  rarely air, and a "number explained" block would have to invent context.

What would honestly reach 6-10 minutes: article text, which the desk already fetches for pictures (first 4-6 paragraphs);
wire copy; or wave 3's research step and rolling blocks. Until then the targets stay at 6-10 minutes, and the analyser and
the lab show the shortfall in red (WORLD NOW ~250 s = 52 % of 480 s, TECH BYTES ~180 s = 50 %, COSMOS ~197 s = 55 %).
NEWS IN 60 is back to its bible's 55-70 s target: 69-74 s on air, so it is flagged when long. The round-up opener no longer
promises "30 seconds" for a ~40 s run.

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

- **Gestures** (w2-hands adopted `gestureBudget()`; fix round 1 requested `floor`, `vocabWindow`, `startShareMax`): the
  first round traded too many for too few: WORLD NOW lola 1.6 marked gestures per minute of talking (floor 2.5), every
  WORLD NOW arm gesture raise_hand, listener nods 0-0.7 per minute (floor 1). The analyser now flags TOO FEW / SAME NAME
  AGAIN / AT SEGMENT START per presenter.
- **Break cadence** (editorial-2, server/station.js): a break after every programme (26 % ads); `CHANNEL.breaks` asks for
  ≥ 420 s of programme between commercial breaks and ≤ 15 % ads.
- **Voice budget for long episodes** (editorial-2 / voices): the fixed 90 s budget; requested: scale it with `estimateAir`
  and synthesise in air order (the analyser reports the browser-voice fallback share).
- **Programme beds** (music / audio): nothing plays on `audio.musicBus` on the live page, so pauses between light items are
  digital silence. world-now.md keeps silence under the news on purpose (greeting, lead, main stories, number); beds belong
  to the round-up, And finally, the chats and the sign-off. Done here: the sign-off cue now sounds under the hold.
- **Music** (music / showcase): 7-14 cue calls per minute; the recorder now reports bed changes against `music` (BEFORE WORLD
  NOW 2.5 changes/min, shortest bed 11 s against 25): the bed engine's cue sheet should change beds only at block boundaries.
- **Length** (editorial-2 / wave 3): source depth (section 6.2); WORLD NOW ~4 min, TECH BYTES ~3 min offline today.
- **TECH BYTES singles**: fixed in fix round 1. `splitLongSingles` now also splits on a comma, with both parts ≥ 4.5 s
  (TECH BYTES and WORLD NOW only; COSMOS keeps its still singles). The TECH BYTES median shot is 6.8 s on the v2 trace, was 7.8 s.
- **Captions**: a one-word sentence ("Respectfully.") pages for 0.9 s on the director's clock (graphics hold it 1.4 s on
  screen by `CHANNEL.captions.minPage`).
- **Default path**: fixed in fix round 1. A late beat needs the minimum shot plus a 1 s margin. The fake-clock test plays
  every fixture episode: no shot under 4 s.
- **Production under load**: synthesis ran at 0.08-0.59x real time on this shared machine; the fallback voice covers it.

## 8. For wave 3 (20-30 minute rolling programmes)

Reuse:
- `public/js/pace.js` as the single table: add segment kinds (interview turn, expert analysis, correspondent link, explainer
  card) as new `gaps` keys and `gapKind` cases; keep every consumer reading it.
- `gapAfter(episode, i)` already accepts any segment list: a rolling programme can call it per appended block.
- `estimateAir(episode)` to budget a block's air time before it is written / voiced, and `length.target` per block.
- `gestureBudget` / `listenerRules` for guests and experts (a guest's turn is a long speech: the per-minute budget scales).
- `tools/pace/trace.mjs` + `analyse.mjs` + `compare.mjs` as the acceptance harness for long programmes (the tracer runs
  ~3-5x real time, so a 30-minute programme traces in 6-10 minutes); the analyser already checks both ends of every shot
  window, variety (map share, beat-order runs), gesture floor and vocabulary, listener nods, live-mix silence, the break
  load and the browser-voice fallback share, so a rolling programme is accepted on the same rows.
- `tools/pace/fakeplay.mjs`: the real director on a fake clock (no browser): a programme's whole shot list and pauses in
  milliseconds, for unit tests of any new segment kind.
- `shotMax` / `factHold` / `cutWait` / `isRepeat` / `mapRun` / `share` as the camera rules a block planner must keep, and
  `CHANNEL.breaks.minProgrammeBetween` / `maxAdShare` for the break scheduler of a rolling channel.
- The production measurement: synthesis rate vs air; with 20-30 minute programmes the voice budget must become per block
  (synthesise block N+1 while N airs), not per episode.
