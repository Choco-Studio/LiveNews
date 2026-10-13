# Pacing: one table for a 24/7 channel

Owner, 18:52: *"maybe very fast — this runs 24/7."* Owner, 23:10: *"analyse what runs TOO FAST in the programme and regulate it
well: transitions, cooldowns... entertaining, polished programmes of up to 10 minutes."*

This document is the PACE stream's record: how the channel's rhythm is measured, the targets (one table,
`public/js/pace.js`), the numbers before and after, what still limits programme length, and what wave 3 should reuse.

<!-- CAMERA-POLISH:BEGIN -->
## Camera and rhythm polish (13 Oct): every programme measured frame by frame

Owner, 13 Oct: *"con un nivel real"*. The camera (each programme's shot grammar, smooth moves) and the rhythm (transitions,
the pauses between blocks, the waits) were measured on air as a senior director would check a cut: every frame, every
cut against the words, every move against its ease.

**Method.** Two servers aired the rotation from WORLD NOW: the offline desk (`PROVIDERS=mock`,
`FEEDS_FILE=config/feeds.fixture.json`) and the live feeds, Kokoro voices on both; a third started on SEVEN DAYS
(`ROTATION_START=seven-days`). Each programme was saved from the station's history with the break after it and the
next programme's open. `tools/pace/trace.mjs --item <saved> --start open --until next-open+6 --fps 30 --camera` plays
it on Playwright's fake clock and writes one row per frame (the shot, framing and move on air, the Stage's camera as
drawn, the presenters' head sizes, each voice's sentence and word). "Before" is the same item on the same server with
the scripts of the commit before the polish (`--js-root`), so voices and pictures are identical. `tools/pace/camera.mjs`
measures it (cut rate, shortest / median / longest shot, shots over their maximum, cuts inside a word, two cuts close
together, jump cuts, eyelines, a single on air over another voice, the voice under a segment cut, dead air, shots held
over silence, every pause against its profile, the waits after the open and before the end card, and every camera move:
its start against its cut, the ease at both ends, frame-to-frame speed change, pixels per frame, steps going back,
presenters jumping a head pixel). `camera-compare.mjs` makes the before / after tables; `--frames` keeps the frames
of a window for filmstrips. Each programme was then recorded with sound (`tools/record.mjs --item`) on the final code.

### What changed

- **Cuts between words (director.js `cutWhenClear`).** A cut that the cooldown holds back lands on the next word's
  first sound (or at once in silence, at most 0.8 s later), never inside a word: before, COSMOS cut inside a word 5
  times in one offline programme and 3 times live, TECH BYTES, NEWS IN 60, WORLD NOW and SEVEN DAYS once each. Every
  pending cut (story beats, the montage, the link's two-way and its return, the quote card) goes through it.
- **The cooldown counts from the last cut the viewer saw (director.js `onAir`).** A chat's re-set of the same two-shot
  (a new focus, the same camera) is no cut; the cooldown counted from that re-set and a TECH BYTES story cut to its
  reader 0.18 s into her first word. A new card (BY THE NUMBERS → IN THEIR WORDS) is a cut, and a v2 framing change.
- **The open's breath (director.js `openBreath`).** The first word comes `open.firstWord` after the open's cut, less
  the voice's own start-up when a voice plays: WORLD NOW, TECH BYTES, MONEY MINUTE 0.63 → 0.43-0.46 s (target 0.5),
  COSMOS 0.82 → 0.66 s (0.7), NEWS IN 60 0.43 → 0.23-0.26 s (0.3), SEVEN DAYS 0.73 → 0.53 s (0.6); WORLD WEATHER spoke
  0.10 s after the open, now 0.53-0.56 s (0.6).
- **The picture's pan (pace.js `picturePan`, `shots.pan`; studio.js).** A full-screen picture drifts on one axis at
  3 px/s (COSMOS 2), eased from rest over 1.2 s (1.6) by whole pixels, still moving when it is cut. Before, it moved at
  about 7 px/s from the cut's first frame, on both axes (a one-pixel staircase), and stopped dead at its margin.
- **Moves that keep the presenters' size (camera.js `moveCap`).** A push or pull on the wide is capped where its 22 px
  heads would round to another whole pixel (2.2 %, was 4 %): the heads stepped 22 → 21 px mid-move on WORLD NOW's and
  SEVEN DAYS's sign-off pulls, 22 → 23 px on SEVEN DAYS's greeting push. Larger heads keep the full move. The greeting push
  is at rest 0.8 s before its planned cut (it ended 0.4 s before the real one).
- **The guard (runtime/direction.js `holdCut`).** An expert's hand-over is two sentences (a 21.8 s two-way followed a
  cut back to the reader 1.7 s before it); the round-up's opening map carries its title line on top of the map maximum
  and is never cut by a phrase mark (the reader flashed 4.4 s between two maps); a re-staged quote's hand-over stays on
  the presenter, so a studio shot carries it and the guard may cut between the studio shots there (an MCU-R held
  14.9 s), with no margin when the shot runs on to the segment's end (the words are known); a link next is no "next
  opening" for the guard (its studio plan never airs, and every cut to the WIDE before a re-staged guest was refused).
- **The links (linkplan.js `capHolds`).** A correspondent's or expert's full frame past the studio maximum gives way to
  their pictures or the two-way in two or three parts (a LOCATION held 24.2 s live, twice).
- **The planner's rhythm (direction/shots.js).** A story never opens on the single the previous story ended on (the
  same presenter's other single instead; SEVEN DAYS held an OTS 17.0 s and an MCU-L 15.9 s across stories); NEWS IN 60
  reads the previous item by the planner's own round-up test (16.2 s on one MCU-L) and MONEY MINUTE by the previous
  story's own plan (a WIDE 16.5 s across two stories); a long MONEY MINUTE intro plays WIDE → MCU-R → WIDE for the
  greeting (the guard alone held the last WIDE 15.1 s), and an intro's headline frames followed by a wide over the
  maximum put the remaining teasers on the reader's single (COSMOS: 15.8 s); a story carries at most
  max(2, floor(L / ideal)) shots at the programme's median (COSMOS); COSMOS never plans two cuts closer than its 4.5 s
  cooldown; no lead-in wide before a chat with a card of its own (a 2.3 s wide before STILL TO COME); the closing wide
  capped by the studio maximum; a picture or map gives way near the middle of its window; a split single alternates
  single ⇄ OTS down the run (a 13.6 s OTS); the quote card is refused when it would hold past the card maximum (10.7 s
  live); capMax may cut a picture as late as its maximum when its return single merges (8.9 s); a cut inside a sentence
  never lands on its last word ("on October | 8.": its mark fired with the next sentence).
- **Tools.** `trace.mjs --camera / --item / --js-root / --frames`, `camera.mjs`, `camera-compare.mjs` (section 2).

### Before / after (final code)

| programme | cuts/min (cap) | shortest / median / longest (s) | over max | cuts in a word | open → word (s) | move defects | flagged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WORLD NOW, off | 8.66 → 8.66 (8) | 4.16 / 5.81 / 13.46 → 4.09 / 6.04 / 13.46 | 0 → 0 | 0 → 0 | 0.63 → 0.46 (0.5) | 1 → 0 | 2 → 1 |
| WORLD NOW, live | 7.71 → 7.71 (8) | 3.99 / 7.03 / 21.75 → 4.16 / 7.26 / 12.08 | 1 → 0 | 1 → 0 | 0.63 → 0.43 (0.5) | 1 → 0 | 4 → 2 |
| TECH BYTES, off | 9.12 → 9.61 (9) | 3.99 / 5.79 / 13.17 → 3.99 / 5.73 / 9.67 | 1 → 0 | 1 → 0 | 0.63 → 0.43 (0.5) | 0 → 0 | 5 → 3 |
| TECH BYTES, live | 8.11 → 8.39 (9) | 2.28 / 7.26 / 13.56 → 3.99 / 6.9 / 12.44 | 2 → 0 | 0 → 0 | 0.59 → 0.43 (0.5) | 0 → 0 | 6 → 1 |
| NEWS IN 60, off | 10.06 → 10.09 (10) | 3.99 / 5.3 / 9.04 → 4.13 / 5.13 / 9.04 | 0 → 0 | 1 → 0 | 0.43 → 0.23 (0.3) | 0 → 0 | 2 → 1 |
| NEWS IN 60, live | 7.66 → 8.53 (10) | 3.99 / 6.48 / 16.24 → 4.06 / 6.6 / 9.64 | 1 → 0 | 1 → 0 | 0.43 → 0.26 (0.3) | 0 → 0 | 3 → 1 |
| COSMOS DESK, off | 8.19 → 7.54 (7) | 4.09 / 6.8 / 15.74 → 4.09 / 7.57 / 12.67 | 1 → 0 | 5 → 0 | 0.82 → 0.66 (0.7) | 0 → 0 | 7 → 1 |
| COSMOS DESK, live | 7.5 → 7.23 (7) | 4.49 / 7.29 / 24.16 → 4.65 / 7.85 / 13.53 | 3 → 0 | 3 → 0 | 0.82 → 0.66 (0.7) | 0 → 0 | 7 → 1 |
| WORLD WEATHER, off | 1.62 → 1.62 (8) | 13.6 / 19.54 / 106.16 → 13.6 / 19.54 / 106.16 | 0 → 0 | 0 → 0 | 0.1 → 0.56 (0.6) | 0 → 0 | 2 → 1 |
| WORLD WEATHER, live | 1.39 → 1.39 (8) | 12.77 / 25.28 / 107.55 → 12.77 / 25.28 / 107.55 | 0 → 0 | 0 → 0 | 0.1 → 0.53 (0.6) | 0 → 0 | 2 → 1 |
| MONEY MINUTE, off | 8.82 → 8.83 (8) | 4.13 / 6.07 / 13.43 → 4.13 / 6.11 / 11.45 | 2 → 1 | 0 → 0 | 0.63 → 0.43 (0.5) | 0 → 0 | 3 → 2 |
| MONEY MINUTE, live | 6.88 → 7.75 (8) | 3.86 / 7.03 / 24.16 → 3.86 / 7.06 / 12.24 | 4 → 0 | 0 → 0 | 0.59 → 0.43 (0.5) | 0 → 0 | 6 → 2 |
| SEVEN DAYS, live | 7.55 → 8.02 (7) | 3.99 / 7.06 / 17.03 → 3.99 / 7.09 / 11.91 | 2 → 0 | 1 → 0 | 0.73 → 0.53 (0.6) | 3 → 0 | 7 → 1 |

Full tables per programme (every measure, offline and live): `/tmp/polish-camera/measurements.md`.

### Critique rounds

Six categories, each 0-10, as a senior director scores a programme: **grammar** (framings, every story change a visible
cut, jump cuts, eyelines), **cuts** (between words, in pauses, cards), **lengths** (floor, median band, maxima, cut
rate), **moves** (eases, presenters' size, rest before the cut), **pictures** (the full-screen pan), **rhythm** (the
open's breath, pauses, the wait before the end card). A round's score is a programme's lowest category.

| round | what changed | WORLD NOW | TECH BYTES | NEWS IN 60 | COSMOS | WEATHER | MONEY | SEVEN DAYS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| r0 | the code before the polish | 7.5 pictures | 7.5 pictures | 7.5 pictures | 7.0 cuts | 7.0 rhythm | 7.5 pictures | 7.5 pictures |
| r1 | cuts between words, the cooldown from the last visible cut, a card is a cut, the open's breath, the picture's pan | 8.5 moves | 8.4 lengths | 8.6 grammar | 8.6 lengths | — | — | — |
| r2 | moves that keep the heads' size, the guard (expert, round-up), the links' cap, the planner's rhythm | 9.0 grammar | 8.8 lengths | 8.6 grammar | 8.9 lengths | 8.8 moves | 8.5 lengths | 8.8 lengths |
| r3 (final) | every story change a visible cut, the MONEY MINUTE intro, the re-staged hand-over, the quote card, capMax, no last-word cut, COSMOS's intro, a link is no next opening | 9.3 lengths | 9.2 lengths | 9.4 lengths | 9.3 lengths | 8.8 moves | 9.2 lengths | 9.0 lengths |

(r1 was measured on the offline desk for four programmes, the live defects carried from r0 until r2 measured them again; SEVEN DAYS from r2 on, once the weekend server had produced it. A score names its weakest category.)

Final, per category:

| programme | grammar | cuts | lengths | moves | pictures | rhythm | round |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WORLD NOW | 9.6 (a glance in an OTS) | 9.8 | 9.3 (8.66 cuts/min off; live median 7.26 s) | 9.8 | 9.8 | 9.7 | 9.3 |
| TECH BYTES | 9.7 | 9.8 | 9.2 (9.61 cuts/min off; live median 6.9 s) | 9.8 (none) | 9.8 | 9.3 (a guest's 1.4 s pause) | 9.2 |
| NEWS IN 60 | 9.7 (the bible's metronome) | 9.8 | 9.4 (10.09 cuts/min off; live median 6.6 s) | 10 (locked off) | 9.8 | 9.7 | 9.4 |
| COSMOS DESK | 9.7 | 9.8 | 9.3 (7.54 / 7.23 cuts/min) | 10 (locked off) | 9.8 | 9.5 (chat pauses) | 9.3 |
| WORLD WEATHER | 9.5 (107 s with no cut) | 9.7 | 9.5 (the format) | 8.8 (the wall's 2 px judder) | — | 9.8 | 8.8 |
| MONEY MINUTE | 9.7 | 9.7 | 9.2 (8.83 cuts/min off; a card 8.7 s off; a 3.9 s picture live) | 10 (locked off) | 9.8 | 9.6 (a link's pause) | 9.2 |
| SEVEN DAYS | 9.8 | 9.8 | 9.0 (8.02 cuts/min) | 9.8 | 9.8 | 9.7 | 9.0 |

### Defects found and their state (ten or more per programme; WORLD WEATHER five)

Times are seconds into the trace (open at ~10 s); "off" = the offline desk, "live" = the live feeds; ✓ fixed, ◐ better,
✗ open (why in the next section).

**WORLD NOW.** 1 ✓ sign-off pull: the heads step 22 → 21 px mid-move (off 323.5, live 363.5). 2 ✓ live: an expert's
two-way held 21.8 s (max 15) after a cut back to the reader 1.7 s before the hand-over (182.1). 3 ✓ live: that cut landed
inside a word (word 6 of sentence 3). 4 ✓ the full-screen picture starts at ~7 px/s on the cut's first frame. 5 ✓ it
drifts on both axes (a one-pixel diagonal staircase). 6 ✓ it stops dead at its margin while on air. 7 ✓ open → first
word 0.63 s (0.5). 8 ✓ live round-up: the reader flashed 4.4 s between the opening world map and item 2's map (322.5).
9 ✓ off: story 26 opened on the MCU-R story 25 ended on, a 10.3 s hold with no visible cut (289.3). 10 ✓ live: a picture
cut on a sentence's last word (story 7). 11 ✗ cut rate 8.66 / min off (8). 12 ✗ live median 7.26 s (5-7). 13 ✗ live:
A glances at the partner in her own OTS 1.5 s before the cut (283.2).

**TECH BYTES.** 1 ✓ off: the closing wide held 13.2 s (12) over the chats and sign-off. 2 ✓ off: a story cut to its
reader inside her first word (42.0), the cooldown counted from a re-set two-shot. 3 ✓ a card giving way to another card
(BY THE NUMBERS → IN THEIR WORDS) was no cut for the cooldown: the second card's clock never restarted. 4 ✓ live: an OTS
held 13.6 s (12), the same framing twice after a split (146.7). 5 ✓ live: a 2.3 s wide (floor 4) before STILL TO COME's
own card, two cuts 2.3 s apart (236.9). 6 ✓ live: a glance at the partner in a single 2.1 s before the cut (241.5; gone with that wide).
7 ✓ live: a picture held 8.9 s (8), its cut planned on "October | 8." fired with the next sentence (345.0). 8 ✓ the
picture's lurch, staircase and dead stop (WORLD NOW 4-6). 9 ✓ open → first word 0.63 s (0.5). 10 ◐ live median 7.26 →
6.90 s (4.5-6.5). 11 ✗ cut rate 9.12 → 9.61 / min off (9). 12 ✗ off: a re-staged guest's one line holds 1.25 s past
its last word and the pause back is 1.39 s (0.75): the guest's shot keeps the programme's 4 s floor.

**NEWS IN 60.** 1 ✓ story 1's opening cut, held by the cooldown over the intro wide, landed inside the reader's first
word (off and live, 10.8). 2 ✓ live: the item after the round-up and the next one both opened on MCU-L: 16.2 s with no
visible cut (49.3). 3 ✓ the intro wide aired 3.99 s (floor 4). 4 ✓ open → first word 0.43 s (0.3). 5-7 ✓ every FULL's
lurch, staircase and dead stop (a 7.1 s picture stopped on air). 8 ◐ live median 6.48 → 6.60 s (4-6): live items read
long. 9 ✗ cut rate 10.06 → 10.09 / min off (10). 10 ✗ (bible) every item MCU-L → FULL: a metronome the format asks for.

**COSMOS DESK.** 1-5 ✓ off: five cuts inside a word (a card, a single, two two-ways, an OTS: 55.5, 197.8, 214.9, 228.3,
256.6). 6-8 ✓ live: three more (272.0, 342.6, 363.1). 9 ✓ off: the intro wide held 15.7 s (15) after its one headline
frame. 10 ✓ live: IN THEIR WORDS held 10.7 s and 9.9 s (card max 9) on a long quote sentence. 11 ✓ live: a
correspondent's LOCATION held 24.2 s (15). 12 ✓ short stories took map + picture + reader in 10 s (the shot budget).
13 ✓ open → first word 0.82 s (0.7). 14 ✓ the picture's pan (COSMOS now 2 px/s, eased over 1.6 s). 15 ◐ cut rate 8.19 →
7.54 / min off, 7.50 → 7.23 live (7). 16 ✗ the pauses into and out of the chats run 1.0-1.2 s against 0.75-0.96.

**WORLD WEATHER.** The weather centre directs its own camera (`scenes/weather*`, outside this stream's files): five
defects were verified, not ten. 1 ✓ the first word came 0.10 s after the open's cut (0.6): no breath. 2 ✗ the wall's
flies between zones move in 2 px steps at uneven intervals, a judder (filmstrip). 3 ✗ one wall view runs up to 107 s with
no cut, the flies the only change. 4 ✗ the trace sees the whole centre as one `weather` shot per zone, so its boards
(HOT & COLD, WARNINGS, THE NEXT THREE DAYS) and the presenter's views cannot be measured: the median 19.5 / 25.3 s
against the studio band is the analyser's blind spot, not a measure. 5 ✗ no weather band exists for the analyser.

**MONEY MINUTE.** 1 ✓ off: a correspondent's LOCATION held 13.4 s (12). 2 ✓ live: the same 24.2 s. 3 ✓ live: the intro's
last WIDE held 15.1 s (12): the guard had cut its MCU-R back early. 4 ✓ live: a WIDE held 16.5 s across two stories (a
story with no sentence start to cut on stayed on its WIDE, the next opened on it). 5 ✓ live: the MCU-R held 14.9 s into a
re-staged guest's words. 6 ✓ open → first word 0.63 s (0.5). 7 ✓ the picture's lurch, staircase and dead stop.
8 ✗ off: a figure card held 8.68 s (8): no sentence pause fits and MONEY MINUTE cuts only in a pause. 9 ✗ live: a
picture aired 3.86 s (floor 4), the plan's 4.0 s less the voice's own timing. 10 ✗ cut rate 8.82 → 8.83 / min off (8).
11 ✗ live: the pause into a link 0.69-0.73 s (0.38).

**SEVEN DAYS.** 1 ✓ an OTS held 17.0 s across two stories by one presenter (no visible cut). 2 ✓ an MCU-L held 15.9 s
the same way. 3 ✓ a cut inside a word (62.5). 4 ✓ the greeting push: the heads step 22 → 23 px mid-move. 5 ✓ the
sign-off pull: 22 → 21 px. 6 ✓ the push ended 0.4 s before the cut (0.73 s now). 7 ✓ open → first word 0.73 s (0.6).
8 ✓ the picture's lurch, staircase and dead stop. 9 ✓ the wide's 3.9-4 % moves on 22 px heads (2.2 % now). 10 ✓ the
sign-off: last word → end card 1.79 s (1.8). 11 ✗ cut rate 7.55 → 8.02 / min (7): the two holds of 1-2 are visible cuts now.

### Still short of 9.7 (honest)

No programme reaches 9.7 in every category; the stop condition was not met. What holds each one back:

- **The cut rate (every programme but WEATHER).** WORLD NOW 8.66 / min offline (cap 8), TECH BYTES 9.61 (9), NEWS IN 60
  10.09 (10), COSMOS 7.54 / 7.23 (7), MONEY MINUTE 8.83 (8), SEVEN DAYS 8.02 (7). Part of it is this round's own doing:
  story changes that aired as no cut (one presenter's same single across two stories, 15-17 s) and holds past a maximum
  (COSMOS's intro, a guard hand-over) are visible cuts now. The caps also fight the median bands: a 5-7 s median means
  8.5-12 cuts a minute, a cap of 8 needs a 7.5 s mean. A looser single split (WORLD NOW / SEVEN DAYS `singleSoft` 12.5)
  was probed on the plans and dropped: it made 25-35 s holds elsewhere. One of the two targets should move (PACE / owner).
- **The live median.** WORLD NOW 7.26 s (5-7), TECH BYTES 6.9 (4.5-6.5), NEWS IN 60 6.6 (4-6), MONEY MINUTE 7.1 (5-7):
  live copy reads longer than the fixtures; the planner holds the floor and the maxima, not the median.
- **MONEY MINUTE.** A figure card holds 8.68 s offline (8): no sentence pause fits, and the format cuts only in a pause.
  A live picture airs 3.86 s (floor 4): the plan's 4.0 s, less the voice's own timing.
- **TECH BYTES.** A re-staged guest's one line keeps the programme's 4 s floor: the shot holds 1.25 s past the words and
  the pause back to the studio is 1.39 s (0.75).
- **COSMOS.** The pauses into and out of the chats run 1.0-1.2 s against 0.75-0.96 s.
- **Outside this stream's files** (requests below): WORLD NOW's glance at the partner in an OTS 1.5 s before the cut
  (v2 `direction/behaviour.js`); the weather centre's own camera (`scenes/weather*`): the wall's flies move in 2 px steps
  at uneven intervals and one view runs up to 107 s with no cut; a speech mark for a mid-sentence cut can fire a word
  late (`audio.js #pollMarks`: the "October | 8." cut fired with the next sentence; the planner now avoids a sentence's
  last word, the source is untouched).

Requests:
- `scenes/weather*` (weather centre): a zone fly at a steady whole-pixel cadence (one step every n frames, never 2 px
  at once), and a change of view (the presenter closer, a zoom) at least every ~30 s.
- v2 `direction/behaviour.js`: no glance at the partner in a single or OTS of one's own in the last 2 s before its cut.
- `audio.js`: with recorded words, a mark fires at its word's onset (`charIndex` at the word's start), not with the
  next word or sentence.
- `tools/pace/camera.mjs` + the trace: weather-centre keys (zone, board) so its cuts and flies can be measured, and a
  weather band.
- PACE / owner: reconcile `cutsPerMinMax` with the median bands.
- `linkplan.js` (`capHolds`) and `studio.js` (`picturePan`) were edited in this stream as camera code; their owners
  should know.
<!-- CAMERA-POLISH:END -->

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
- **Air between segments (director, 05:44).** The pause after a segment now starts the next segment's recorded-voice lookup
  (`voices.audioFor`), and `say()` awaits that job. A late clip's lookup (up to `lookupMs`, 700 ms) used to come after the
  pause; now it runs inside it. INTEGRATION measured the result of the old order on air: pauses up to 2.6-2.9 s against
  0.65-1.0 s profiles. On the fake clock with a 0.6 s lookup, WORLD NOW's pauses were the profile's plus 0.6 s
  (1.52 / 1.51 / 1.97 s). Now they are the larger of the two (0.91 / 0.91 / 1.37 s). The test is `a late voice lookup runs
  inside the pause`.
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
Default path at the time (the legacy director; since 3 Oct the old renderer is `?v2=0` and v2 is the default), same server, `trace.mjs --count 5` without --v2, final code (04:30):

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
| `tools/pace/trace.mjs --camera --fps 30` | the same run with one row per frame: the shot on air, its framing and move, the Stage's camera as drawn, each presenter's voice (speaking, sentence, word); `--item` airs a saved episode (the server's history airs the break and the next open after it), `--js-root` plays it with another checkout's scripts (a before / after on one server, same voices and pictures), `--frames a-b` keeps every frame of a window as PNG (filmstrips) |
| `tools/pace/camera.mjs` | measures a `--camera` trace per programme as a director checks it frame by frame: visible shots, cut rate, cuts inside a word, a single on air while another voice speaks, jump cuts, flashes, eyelines, dead air, shots held over silence, the waits after the open and before the end card, stingers over speech, and every camera move (start against its cut, ease at both ends, frame-to-frame speed change, px per frame, rounded steps going back, presenters jumping a head pixel) |
| `tools/pace/camera-compare.mjs` | before / after tables of two `camera.mjs --json` reports |
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
| a single splits past (`singleSoft`) | 11 s | 10 | 13 | — | — | COSMOS keeps its still singles (camera polish) |
| full-screen picture pan (`pan`) | 3 px/s | 3 | 2 | 3 | 3 | one axis, eased from rest (`picturePan`); bibles ≤ 4 px/s |
| map cuts in a row / map share / single share | 2 / 33 % / 60 % | 2 / 30 % / 55 % | 2 / 33 % / 60 % | 2 / 33 % / 60 % | 2 / 33 % / 60 % | critic r1: 40 s of maps |
| stories in a row with one beat order | 2 | 2 | 2 | 2 | 2 | variety |
| story → story | 1.0 s | 0.9 | 1.3 | 0.85 | 0.75 | world-now.md 0.7 + air; news-60.md 0.7 |
| hand-over (other presenter) | 0.85 | 0.7 | 1.05 | 0.85 | 0.75 | practice 0.5-0.9 |
| chat turn | 0.5 | 0.42 | 0.6 | — | — | conversation, not a read |
| block (after round-up / "still to come") | 1.3 | 1.15 | 1.6 | 1.1 | 0.9 | strap out and in |
| before "And finally" | 1.2 | 1.0 | 1.3 | 1.2 | — | world-now.md 1.0, tech-bytes.md 0.8 + air |
| sign-off hold on the wide | 1.5 | 1.0 | 1.5 | 0.6 | 1.0 | world-now.md, news-60.md |
| open → first word | 0.5 | 0.5 | 0.7 | 0.5 | 0.3 | world-now.md, news-60.md |
| camera moves | ≤ 5, 40 s apart | ≤ 2 | 0 | 0 | 0 | bibles: COSMOS/MONEY/N60 locked off; on the wide ≤ 2.2 % (camera.js `moveCap`: its 22 px heads keep their size) |
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

Helpers: `picturePan(dt, mx, my, dir, id)` (the full-screen picture's drift), `gapAfter(episode, i)` (the pause after a segment, seeded ± 8 %), `gapKind` (a block boundary only after a
"Still to come" chat line or a flagged segment, never ordinary copy), `readTwice`, `tickerHold`, `factHold`, `shotMax`
(the top of every shot window), `cutAllowed` / `cutWait` (cooldown), `isRepeat` (identical framing / same full-screen type
limits), `gestureBudget(id, seconds, { grave })`, `listenerRules(id)`, `estimateAir(episode)`, `paceTrace(ev)`.

### Who reads it

| consumer | what it takes from pace.js |
| --- | --- |
| `public/js/director.js` | pause after every segment (`gapAfter`, minus the voice start-up only when a voice plays), strap cleared in a block pause, sign-off hold (its cue under the hold), end card, breaking card, ident, promo, the voice-paced montage floor, the first line a breath after the open; default path: `cutWait` cooldown (the story's opening cut too), `isRepeat`, `shotMax`-style maxima per shot with a seeded relief, `mapRun`, And finally never on a map, strap entry 1 s after the real cut |
| `v2 runtime/direction.js` | cut cooldown, stinger, the per-segment pause the plans are timed against, the intro's breath (`director.openBreath`), the max-hold guard's maxima (`maxHold` = `shotMax`) |
| `studio.js` | the full-screen picture's pan (`picturePan`, `shots.pan`) |
| `v2 direction/context.js` | `gapAfter` may be a per-segment function (one per episode) |
| `v2 direction/shots.js` | minimum shot, headline beat floor (the last frame too), per-programme studio max, single split, picture / map windows, `factHold`, `shotMax` (capMax: maps, pictures, cards never planned past their maximum), `mapRun` in round-ups, sign-off hold, the median band (a story's shot budget), the cooldown (COSMOS's spaced cuts) |
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

The legacy path (then the default; since 3 Oct `?v2=0`, v2 being the default) was checked in the real
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
- **The voices' melody (10 Oct, owner: "más natural, tipo presentador real, que no aburra").** Kokoro reads each sentence
  as a separate pass and starts every one on the same note, so a story came out as a list (median pitch of a story's
  sentences: 0.2-0.4 semitones apart, at random: Paco's close sat 2 st above his lead). Now `planMelody`
  (public/js/voice/speechtext.js) gives each synthesis group a newsreader line: a paragraph opens high on the news (+1.4 st),
  steps down sentence by sentence and closes low (-0.8 st), a question lifts (+0.8), the clause after a colon or dash sits a
  step lower, the reporting clause ("..., officials said.") drops 1.1 st and 1.8 dB, the figures, records and "not" get a
  lift (up to 2, about 1-1.7 st and 1-1.6 dB, smaller on the last word). Persona `melody` / `accent` scale it (Max 1.3,
  Lola 1.2, Paco 1.0, UNIT-8 0: a machine reads level), grave stories narrow it to 0.6-0.7, lighter ones widen it. The
  story's pace has an arc too: the lead 1.5 % slower, the middle 1.2 % quicker, the close settling.
  The worker (tools/voice/engine.py `shape_melody`) measures where Kokoro left each phrase (YIN, `dsp.pitch_track`), takes
  90 % of that wander out (`STEER`) and bends the phrase to the plan with `dsp.pitch_curve`: a variable-rate resample read
  on a 4x oversampled copy, put back on its own time line by WSOLA (same length, so every word time holds), its formants
  put back with `keep_envelope` (the resample carries them; within ~1 dB above 400 Hz); the gain curve goes on after the
  levelling. Measured on 8 presenters x 4 stories (A/B, same text): the per-sentence pitch now follows the plan
  (correlation 0.83-1.0, was -0.9 to 0.7), sentences move 0.7-1.2 st apart (was 0.2-0.9, random), duration, word times and
  loudness unchanged, timbre within 0.8 dB, no new clicks, ~1 s of extra work per segment. `MELODY = false` in
  server/voice/plan.js turns it off (`melody: false` in a worker request does the same for one clip).

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
- **WORLD NOW cut rate on long episodes** (bible owner / w2-camera; known issue): INTEGRATION's `world-now-long` fixture is
  19 segments, the channel's current length, with 14 stories of about 16 s. It plans 8.42 cuts per minute on the v2 path and
  8.52 on the default path, against WORLD NOW's 8. The cause is world-now.md's one beat per sentence (single, map, picture,
  single) on three-sentence stories, where every visual already holds to its maximum (picture 8 s, map 10 s). No two beats
  can merge without breaking a maximum or the map-on-sentence-2 rule.
  - Tried and reverted: a cutaway budget per story. The dropped cutaway only became a return to the single, so the cut count
    stayed the same.
  - Real ways out: let the single hold two short sentences before the map, raise the map maximum, or write longer stories
    (section 6.2).
  - The analyser keeps the rate red on air. test/pace.test.js allows +0.75 cuts per minute for episodes of 16 or more segments
    only, so a real regression still fails.
  - 10 Oct, real news (stories now carry 4-5 sentences from the article): two WORLD NOW plans measured 7.61 and 8.18 cuts per
    minute (tools/pace/plans.mjs). The second's only shots under the floor (1.8 and 2.2 s) are a correspondent link's
    one-line prompt and thanks, which the plan tool lays as studio singles; on air the director plays link parts through
    linkplan.js, which holds every shot to the floor, so the on-air rate is lower than the tool's.
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
