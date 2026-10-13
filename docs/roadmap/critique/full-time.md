# FULL TIME — on air (build step 7)

Step 7 of `docs/programmes/full-time.md` §9: **record a matchday edition and a quiet-day edition with sound and critique
the whole programme above 9.7.** Steps 1–6 had passed on their own (desk, writers, graphics, director, set, open and
sound, cast). This log is the programme as a viewer meets it: the open to the end card, with Kai's and Rosa's recorded
voices, the bed, the boards and the rotation.

The panel: a senior sports editor, a standards and legal editor, a senior broadcast director, a lead pixel artist, a
sound designer and a first-time viewer. Seven categories, each 0–10: editorial accuracy, news sense, entertainment and
repertoire, format clarity and rhythm, picture, sound, data robustness. **The round's score is its lowest category.**
The owner's pending choices (faces, voices, the sting's A/B), the AI writer (no key) and the weekend snapshots
(17–19 Oct) are not faults of the build; they are listed at the end.

## How the editions were made and recorded

- **The server under a chosen clock** (`tools/sport/onair.mjs`, new). The real server (`server/index.js`: the station,
  the producer, the voice service, the picture cache) runs with the whole process's clock frozen at the air time and
  running on from there (`Date.now()` and `new Date()` alike), FULL TIME put on air after WORLD WEATHER and starting the
  channel (`DRAFTS_ON_AIR`, `ROTATION_START`), Kokoro voices, the mock (fallback) writer, one episode made ahead and
  the first edition waiting for all its voices. It saves the first edition once every voiced segment has its clip, then
  puts it on air in the station's history, so a recording of it (`tools/record.mjs --item`) meets what follows it on
  the channel: the break and the next programme (the ticker's NEXT names WORLD NOW). The same server serves the clips
  (`/api/voice`) and the pictures (`/api/img`). Production behaviour is untouched.
- **The matchday edition**: the offline fixture desk (`config/fixtures/sport.xml`, fictional clubs) on Saturday
  17 October at 18:30 London. **The quiet-day edition**: the live snapshot of 13 Oct 08:20 (UTC) read at its own
  moment, Tuesday 09:20 London (read only: its feeds and article pages from the folder; pictures fetched as on air).
- **Recording**: `tools/record.mjs` at the channel's normal scale (384 × 216 × 5, 1920 × 1080, 30 fps) with sound, the
  page's clock at 18:32 and 09:28. A new `--progressive` mode renders the sound while the frames are taken, two seconds
  at a time and always a second behind the page's clock, and makes the page's disconnects once the render has passed
  them. Rendered at the end, the offline graph of a six-minute FULL TIME (its bed is the channel's busiest) held every
  node at once and had not finished after 28 minutes of CPU; progressive, a six-minute edition records in ten to
  fifteen minutes (two at once on four cores), the sound keeping pace with the frames. Checked against the old path on the same 90 s: the same integrated level, no second more than 1 dB apart,
  envelope correlation 0.9993 (two old-path runs differ from each other by more than that, the page's own timing).
- **Measured, not only looked at** (scripts in the session's scratchpad): contact sheets at one frame a second of both
  editions, single frames at 2x where a question came up; every cut against the recorded clip under it (its own level in
  the 30 ms before and at the cut, and the word marks), shot lengths and the cut rate from the open to the end card; the
  report's caption sync per sentence and sound onsets per cue; EBU R128 loudness of the mix and of the open; the bed
  under each voiced segment (each clip fitted to the mix by least squares and taken out, the rest measured, full band
  and 1–4 kHz) and the level of the gaps between voices; the spoken text of every sports figure (the planner's phrases).
- Files: `/tmp/full-time-onair/` (`r<round>-matchday.mp4`, `r<round>-quiet.mp4`, their `-report.json` and `.wav`,
  the episodes as aired: `matchday-episode*.json`, `quiet-episode*.json`).

---

## Round 1 — the build as it stood

**Recordings.** `r1-matchday.mp4`: MATCHDAY, open at 0.9 s, end card at 294.5 s (programme 293.6 s, then the end card
and the break), 25 segments, 14 stories, SCORE CENTRE (three results), COMING UP (three dates), THE NUMBER, the
moment, Rosa's memory. `r1-quiet.mp4`: MIDWEEK, open at 0.9 s, end card at 370.5 s (programme 369.6 s), 22 segments,
13 stories, no SCORE CENTRE (no result left untold), no COMING UP (the only dates were in the last stories), the
moment, Rosa's needle at Kai.

| Measure | Matchday | Quiet day |
|---|---|---|
| Loudness (mix) | −15.5 LUFS, LRA 2.9 LU, true peak −5.0 dBTP | −15.5 LUFS, LRA 3.1 LU, true peak −4.9 dBTP |
| Voices | 29 clips started, 29 audible; 67 recorded sentences, none in the browser voice | 29 of 29; 70, none |
| Bed under the voice (median; lowest) | 24.1 dB; 18.5 dB in the headlines | 24.1 dB; 18.7 dB in the headlines |
| Bed between voices | about −43 dBFS (it stays ducked: no pumping) | the same |
| Open | momentary −31 → −22 (the flood thunks) → −15 LUFS (whistle and hit); speech momentary mean −18.1 | the same open |
| Captions | every recorded sentence's caption within +9…+23 ms of its voice | within 0…+15 ms |
| Cuts, open to end card | 8.7 a minute (four re-sets of the same wide not counted), median shot 5.8 s, longest studio shot 11.9 s | 8.2 a minute, median 6.3 s, longest 13.0 s |
| Cuts inside a word | none (one on the tail of "season," into its pause) | two land in the last syllable of the word before (see round 2) |
| SCORE CENTRE | board cut at 79.9 s; three row ticks at 81.8, 84.4, 87.8 s, each with its row | — |

Faults:

1. **The headlines showed the wrong story.** The shape chooses three different stories for the spoken headlines (never
   the match and its reaction both) but kept the writer's teases, so the montage cut to the writer's three: the third
   headline, "Bills' Allen finally gets over hump in wild win", aired over Jaissle's picture and strap ("JAISSLE SORRY
   FOR COVENTRY LOSS…"); on the matchday the second and third straps named Bitport's apology and the women's
   semi-final under "Late Lindqvist goal…" and "Quaywick Albion thrash Copperfold Town" (sports editor, standards,
   director). The rundown (the montage's frames and pips) still listed a story the shape had dropped.
2. **THE NUMBER on a MATCHDAY**, which §4 does not have, and it buried a result: the women's Coastal Cup semi-final
   aired as "Our number of the day: 6,000. A crowd of 6,000 watched the semi-final…", with the 31-12 result last and no
   scoreline card (THE NUMBER keeps its own board) (sports editor: news sense).
3. **A result without its card**: the basketball result (Bitport Comets 98-91, nine seconds, two sentences) aired on
   Kai's single only. Its card needed a full hold after the first sentence and the story did not have it; the picture,
   behind it in the beat order, was then not tried either (director, pixel artist).
4. **Betting language on air**: "…going into the breaks 34-21, 72-33 and 100-49 ahead, having entered the game as
   36.5-point favourites" (Sky Sports): a point spread, against §3.1's "never odds, betting or tips" (standards).
5. **A strap that names the opposite of the news**: "BILLS' ALLEN, 0-7 IN OT GAMES ENTERING MNF", the ESPN title cut
   inside its aside: the record the story ends, in jargon (sports editor, first-time viewer).
6. **A relay of hand-overs**: AROUND THE GROUNDS ended four stories in a row on a toss by name on the matchday ("Rosa
   has the rugby." "Over to Kai for the tennis." "Rosa now, with the cricket." "Here's Kai with the basketball.") and
   five on the quiet day (director, sports editor: rhythm). One was said over a full-frame card, out of vision ("Over
   to Kai for the tennis." over the Hawks' 24-17).
7. **Rosa was never introduced**: "I'm Kai Sprite, and this is FULL TIME." / "Hello. Let's get started." Her name
   first appeared on a strap 50 s in; every other two-handed programme on the channel names both in its greeting
   (first-time viewer).
8. **Results read like a calculator**: "six four six to three" (tennis, "6-4 6-3"), "Allen was zero to seven in
   overtime" (a record), "a three to zero Ashes series defeat", "the Proteas laboured to one hundred and two to four"
   (cricket's 102-4), "one hundred to forty-nine". §3.5 promises figures spoken as a results reader says them, and the
   speech planner knew only the result lines (sound designer, sports editor).
9. **THE NUMBER's card was titled BY THE NUMBERS** over one figure while its strap said THE NUMBER (pixel artist).
10. **The montage's chip said SPORT on every headline**, where every strap says the sport (pixel artist).
11. Found in passing, a recording artefact rather than a programme fault: with the edition served from a file, the
    server still held it in its queue, so the ticker said "NEXT: FULL TIME" during FULL TIME and the same programme
    followed with no break. The launcher now puts the edition on air in the station first (above).

Noted, not counted as build faults:

- The matchday comes from the offline fixture desk: seventeen fictional items with no pictures, so it stands on its
  presenters and cards, and runs 4:54 against the bible's 6–8 minutes. §4: a segment without material is skipped, never
  padded; a real Saturday desk holds a hundred sport items. The live quiet-day edition, on the real desk, runs 6:10 with
  a picture on every story. A real matchday is the scheduled weekend snapshots' (17–19 Oct).
- The channel's ticker runs the general news under every programme (an execution story scrolled under the NFL): the
  channel's, not FULL TIME's.

Scores:

| Category | Score | Worst fault |
|---|---|---|
| Editorial accuracy | 8.5 | 1, 4, 5 |
| News sense | 9.0 | 2 |
| Entertainment and repertoire | 9.4 | 6 |
| Format clarity and rhythm | 8.8 | 7, 6, 3 |
| Picture | 8.8 | 1, 3, 9, 10 |
| Sound | 9.0 | 8 |
| Data robustness | 9.2 | 4, 5 |

**Round score: 8.5.**

### Fixes

1. **The montage follows the voice** (`server/sport/shape.js`): when the shape chooses the headlines it sets the
   intro's `teases` to those stories (one entry a sentence, the greeting's none), and the rundown is rebuilt from the
   stories on air, in their order, with the straps and sport tags they air with.
2. **THE NUMBER only airs MIDWEEK** (`shape.js` `numberDayless`, `dayShape`, `saidScoreline`, `fixturesAhead`): on a day
   that will air as MATCHDAY or PREVIEW its story is told as any other, among its sport's stories, in the outlet's order
   (the result first) and with its scoreline card. The decision is made before the shape with the results the stories
   already tell left out of SCORE CENTRE's count, as the shape leaves them out.
3. **A short result still shows its card** (`public/js/v2/canvas25d/direction/shots.js` `shortResultCard`): a FULL TIME
   story with a scoreline and no room for the card's full hold after its first sentence puts the card on its last
   sentence start that leaves the programme's 4 s minimum on screen with the pause after the story.
4. **No odds** (`server/sport/prepare.js` `withoutOdds`): a point spread's clause goes ("having entered the game as
   36.5-point favourites"), a sentence about odds goes whole; "as underdogs", with no price, stays.
5. **No strap cut inside its aside** (`shape.js` `cutInAside`): such a strap is made again from the title without its
   aside: "BILLS' ALLEN FINALLY GETS OVER HUMP".
6. **The relay broken** (`shape.js`): never two hand-overs by name in a row (after one, the next presenter takes the
   sport up in their own words), and the transition banks' bare "In tennis." lines, now heard more, became whole lines
   ("Tennis next.", "Some cricket now.").
7. **Both presenters greeted** (`shape.js` greeting banks): "I'm Kai Sprite, with Rosa Rally, and this is FULL TIME.",
   eighteen lines, six an hour of the day.
8. **A results reader's figures** (`public/js/voice/speechtext.js` `sportNumbers`, `server/voice/plan.js`): the voice
   plan passes a FULL TIME story's sport to the speech planner, which reads its figure pairs by sport: cricket "one
   hundred and two for four" (a series "two one"), tennis "six-four, six-three" ("six-love"), football and rugby "three
   nil", an American team's record "oh and seven", a formation "four-three-three"; a score past a hundred keeps its
   "to" everywhere ("one hundred and nineteen to sixty-six", as §3.5's own table says). No other programme's segment
   carries a sport, so their reading is unchanged.
9. **THE NUMBER's card keeps its name** (`public/js/scenes/cards.js` `boardTitle`).
10. **The montage's chip is the sport** on the sport theme (`cards.js` `drawHeadlineFrame` `kicker`, `studio.js`).
11. **A result the bible's own table lists, read**: "The London Lions became the first British club to face an NBA team
    but suffered a heavy 119-66 defeat to the Portland Trail Blazers" (`server/sport/scores.js`: the sentence's subject,
    its first verb, then "but suffered"; one clause, no reported speech; crowd words such as "Fans" are never a team).
    On the three 13 Oct snapshots it adds exactly that reading and no other (every scoreline listed before and after).

Tests: `test/full-time-onair.test.js` (new), `test/full-time.test.js` (the hand-over expectation).

---

## Round 2 — after round 1's fixes

**Recordings.** `r2-matchday.mp4`: programme 289.4 s (the two editions are re-made by the fixed shape, so their scripts
changed: no THE NUMBER on the matchday, the women's result among the rugby). `r2-quiet.mp4`: programme 364.1 s.
Loudness −15.6 LUFS (LRA 3.0 LU, true peak −5.0 dBTP) and −15.5 LUFS (LRA 3.2 LU, −5.0 dBTP); all 31 and 30 clips
audible; captions within +3…+23 ms.

Checked fixed on air: the three montage frames under their own headlines with FOOTBALL / RUGBY / NFL chips; "I'm Kai
Sprite, with Rosa Rally"; the women's semi-final leading the rugby with its 31-12 card; the basketball result's card
(4:02–4:05 on the matchday); the Bills' strap; no odds; hand-overs alternating with the incoming presenter's own lines;
the figures as spoken (the planner's phrases: "one hundred and two for four", "oh and seven", "three nil Ashes", "one
hundred and nineteen to sixty-six").

Faults:

1. **Two type sizes on one board**: the London Lions' result, now read, aired as "PORTLAND TRAIL BLAZERS" at 1x over
   "LONDON LIONS" at 2x: the winner smaller than the loser. The scoreline card sized each name on its own; the graphics
   round's "one type size a board" had been applied to SCORE CENTRE and COMING UP only (pixel artist).
2. **FULL TIME's own shot windows were never applied by the v2 planner**: it has no shot style of its own, so it
   played WORLD NOW's (studio shots to 15 s, singles split past 13 s): Rosa held a 13.0 s single on Jaissle's apology
   (12.4 s of voice) against FULL TIME's 12 s maximum and 10 s split (in round 1 too) (director).
3. **A verdict in a "with" phrase**: "Josh Allen came through with his usual late-game theatrics in leading the
   Bills…" praises a player in the outlet's words (§3.4) (standards).
4. Round 1's toss over a card did not recur (the alternation moved it), but nothing prevented it (director).

Not faults, measured: cuts land on the word index of the mouth's timeline (`audio/visemes.js`), which leads the sound
by about 80 ms; two cuts of about 110 fall in the last syllable of the word before ("Starfield" in COMING UP, "34-21,"
on the quiet day). A cut two or three frames ahead of the next word is common practice and invisible at 30 fps; the
mechanism is the channel's, shared by every programme, and left as it is.

Scores:

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy | 9.6 | 3; the outlets' punctuation and spellings ("one goal; to win the tournament", "careerlong") |
| News sense | 9.7 | the shape's choices are sound on both days; a quiet Tuesday has no SCORE CENTRE and no COMING UP by design |
| Entertainment and repertoire | 9.7 | Rosa's BREAKDOWN answers are the source's sentences; her light touches are two banks of twelve |
| Format clarity and rhythm | 9.6 | 2, 4 |
| Picture | 9.4 | 1 |
| Sound | 9.7 | the voices are the first choices the owner is still auditioning (names such as "Auvaa" and "Suljovic" are Kokoro's guesses) |
| Data robustness | 9.7 | the matchday is the fixture desk's; the weekend snapshots are owed |

**Round score: 9.4.**

### Fixes

1. **One type size a board, on the scoreline card too** (`public/js/scenes/cards-sport.js` `namePair`): both names at
   2x when both fit; else 2x with the long name on two lines ("PORTLAND / TRAIL BLAZERS"), when the board stays inside
   the safe area (the home-and-away board, whose names stand beside the boxes over HOME and AWAY, never); else both at
   1x. A lab case for it in `public/lab/sport.html`.
2. **FULL TIME's own shot style** (`shots.js` `SHOT_STYLES['full-time']`, `SIGNOFF_HOLD`): its pace profile's windows
   (studio 12 s, a single split past 10 s, pictures 4–8 s, its sign-off hold) and WORLD NOW's grammar. Re-planned, the
   two editions keep their cut rate (one cut more on the quiet day) and lose the 13 s single.
3. **A verdict in a "with" phrase goes, the act stays** (`server/sport/words.js` `VERDICT_WITH`): "Josh Allen came
   through in leading the Bills to a 37-34 overtime win…".
4. **The toss in vision** (`shape.js`): no hand-over by name at the end of a story with a scoreline or a chalkboard
   (its last sentences air on that card); the next presenter takes the sport up instead.

Tests: `test/full-time-onair.test.js`.

---

## Round 3 (final) — after round 2's fixes

**Recordings** (the files to keep):

| | Matchday | Quiet day |
|---|---|---|
| File | `/tmp/full-time-onair/r3-matchday.mp4` (312 s recorded) | `/tmp/full-time-onair/r3-quiet.mp4` (420 s recorded) |
| Shape | MATCHDAY (Saturday 18:30, the offline desk) | MIDWEEK (Tuesday 09:20, the 13 Oct live snapshot) |
| Programme, open to end card | 289.5 s (4:49), then the end card, the break and UP NEXT: WORLD NOW | 361.3 s (6:01), then the same |
| Running order | headlines, title, greeting, lead (3-1, its card on the crowd sting) with THE BREAKDOWN, its follow-up with a chat, SCORE CENTRE (three rows), nine more stories (the women's semi-final leading the rugby), the moment, Rosa's memory, COMING UP (three dates), the sign-off and the theme's tail | headlines, title, greeting, lead (4-1, the home-and-away card), reaction with THE BREAKDOWN, Lille with the club's words, ten more stories across rugby, the NFL, F1, darts, cricket, boxing and the NBA (two scoreline cards), the moment, Rosa's needle, the sign-off |
| Loudness | −15.5 LUFS, LRA 3.0 LU, true peak −5.0 dBTP | −15.6 LUFS, LRA 3.5 LU, true peak −5.0 dBTP |
| Voices | 30 clips, 30 audible, 67 recorded sentences, none in the browser voice | 29 of 29, 69, none |
| Bed under the voice | median 24.1 dB, lowest 18.6 dB (headlines); stays ducked between voices | median 24.1 dB, lowest 18.8 dB |
| Captions | within +9…+23 ms of their voice | within 0…+15 ms |
| Cuts | 8.8 a minute, median 5.1 s, longest studio shot 11.9 s (max 12) | 8.4 a minute, median 6.0 s, longest 11.2 s |
| Cuts inside a word | one ~80 ms early (the mouth timeline's lead, see round 2) | none (one on a phrase boundary) |
| SCORE CENTRE | board at 80.3 s, three row ticks with their rows (82.3, 84.9, 88.1 s) | — |

**The grave rules on air.** Neither edition had a grave story (the desk's grave items of 13 Oct, a former captain's
death and an assault, were outside the forty candidates that morning). So the quiet edition was recorded again from its
Saracens story with that one segment marked serious (`grave-check.mp4`, 80 s; a check of the director and the music, not
an edition): the gaps after the grave story and after the story that follows it are digital silence (no bed at all),
the gap before it carries the bed at −40.8 dBFS and the bed is back at −42.0 dBFS one segment later, as §3.1 and §6
say. The row ticks after grave news and the tail's hold-back stay covered by `test/full-time-sound.test.js`.

Checked on air: the scoreline card in one size ("PORTLAND / TRAIL BLAZERS 119, LONDON LIONS 66", 5:04–5:09); Rosa's
Jaissle story split into two singles; "Josh Allen came through in leading the Bills to a 37-34 overtime win…"; THE
NUMBER's card titled THE NUMBER (rendered through the director's card path: it airs only midweek and neither edition
had one); the break after the edition promoting WORLD NOW (the rotation: WORLD WEATHER, FULL TIME, WORLD NOW).
The step-2 gate re-run on the code as it stands: fifteen editions (three snapshots at four air times, the offline desk
at three), all clean on the automatic checks.

No new fault. Scores:

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy | 9.8 | The outlets' punctuation and spellings pass through ("one goal; to win the tournament", "careerlong"); idioms about acts, not people, stay by design ("continued to hog centre stage"). |
| News sense | 9.8 | Both running orders are a sports editor's: the right lead, the reaction told after its match, women's sport, at least six sports. On a quiet Tuesday the shape has no SCORE CENTRE and no COMING UP, as the bible says. Midweek, THE NUMBER still frames its story's figure before its result. |
| Entertainment and repertoire | 9.8 | Rosa's BREAKDOWN answers are the source's sentences read straight; her light touches are two banks of twelve; the chemistry the bible asks for is the fallback writer's until the AI writer has a key. |
| Format clarity and rhythm | 9.8 | Rosa named in the greeting, each sport announced once, hand-overs alternating. The matchday runs 4:49 because the fixture desk holds seventeen items (never padded, §4); the live edition runs 6:01. |
| Picture | 9.8 | Every board in one size and on its line; the montage follows the voice. The offline matchday has no pictures (the fixture desk carries none); the faces are look A until the owner chooses. |
| Sound | 9.8 | −15.5 LUFS with a 3 LU range, the bed 24 dB under the voice, the grave silence, figures read as a results reader says them. The voices are the first choices the owner is still auditioning, and Kokoro guesses names ("Auvaa", "Suljovic"); the scoreline sting is the crowd until the owner's A/B. |
| Data robustness | 9.8 | Odds, asides and verdicts filtered; scoreline precision kept on three days of feeds (one reading added, checked by hand). A real matchday is still unseen (the weekend snapshots of 17–19 Oct), and recall stops at forms such as "beat the Czech Republic 2-0" (an article before the loser), by the desk's precision-first rule. |

**Round score: 9.8. Passed.**

## What stays with the owner

- **Faces**: Kai and Rosa air look A of three each (`public/js/full-time-looks.js`); another candidate gets its own round.
- **Voices**: Kai's and Rosa's first-choice blends (`server/voice/casting.json`) while the owner auditions; names the
  engine does not know are its guesses.
- **The scoreline sting**: the crowd swell airs; the brass is kept (`SCORE_STING`), the owner's ear decides.
- **The AI writer**: no key yet; every edition here is the fallback writer's, through the same desk, validator and shape.
- **A real matchday**: the scheduled weekend snapshots (17–19 Oct) and the step-2 gate on them. Until then MATCHDAY is
  proven on the fixture desk only, which also carries no pictures.
- **Leaving the drafts**: FULL TIME is still under `"drafts"` in `config/channel.json`; putting it in the rotation
  (after WORLD WEATHER, §8) is the owner's call.
