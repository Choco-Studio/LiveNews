# PAY ATTENTION — graphics critique log (build step 3)

Step 3 of `docs/programmes/pay-attention.md` §9: the question board, the lock-ins, the reveal, PICTURE THIS, LETTER BY
LETTER, the map round, HOW MANY?, TODAY OR NOT TODAY?, the scores and the table. **Gate: the lab page at 1x and 4x, a
hostile critique above 9.7.**

**What is built:**

- `public/js/scenes/cards-quiz.js`: the boards, each a pure function of its own clock and the times the director passes:
  - `drawQuestionBoard`: PICTURE THIS, the question board itself;
  - `drawLettersBoard`: LETTER BY LETTER and the tie-break;
  - `drawWhereBoard`, `drawHowManyBoard`, `drawTodayBoard`;
  - `drawScoresStrip`, `drawDoubleCard`, `drawTableBoard`, `drawRoundCard`.
- `public/js/scenes/quiz-fit.js`: how the boards lay their words out, with no canvas and no DOM. The question desk
  (`server/quiz/rounds.js`) now refuses, by the same measure, any headline, sentence or tag that would not fit its box.
- The accent registered: `PROGRAM_ACCENT['pay-attention']` in `scenes/cards.js` and `THEME_ACCENT.quiz` in `cast.js`.
  The top row's programme tag takes the fog rim purple needs on the dark set (`graphics/bug.js`).
- `public/lab/quiz.html`: 27 boards, each on its own clock (`?moment=`, `?t=`, a scrubber, play), at 1x, 2x and 4x, with
  the overlay toggle (the channel's top row and a two-line caption, as on air).
- `test/pay-attention-graphics.test.js`: 16 tests.

The panel is the design critique's: a lead pixel artist, a senior broadcast director, a standards and legal editor, a
senior quiz-show producer and a first-time viewer. Each category is scored 0–10, and **the round's score is the lowest
category.**

**How it was looked at:**

- The lab rendered in headless Chromium and read canvas by canvas:
  - at 1x, the stream's own pixels, with the overlay on;
  - at 2x and 4x;
  - every board at seven named moments: the open, the reading, the countdown, the lock-ins, the last step, the reveal and
    settled;
  - filmstrips at 0.1–0.4 s steps through the moves: the tiles coming up, the reveal, the map's move onto the right pin,
    the stages and buzzes of LETTER BY LETTER.
- **The data was real.** Every question in the lab that is not marked otherwise comes from the eight editions the writer
  wrote from the archive at 13 Oct, 20:20 London: their headlines, masks, figures, letter reveals and airings.
- **The hardest cases were built on purpose:**
  - three 71–72 character headlines on three-line tiles;
  - a masked place and a six-block masked figure;
  - "UNITED ARAB EMIRATES" on a pin's tag, and three neighbouring pins (Egypt, Jordan, Greece);
  - a six-digit figure under "UP TO", and a price in billions;
  - a tie and sudden death;
  - both players on one tile and on one pin, and both wrong on one tile;
  - DOUBLE OR NOTHING with its doubled stake.
- **The pictures were generated.** The archive's own pictures stay on the outlets' servers, so the lab draws six test
  pictures. They go through the channel's own pixelation, as an aired picture would.
- **The headlines were measured.** All 41 eligible headlines of the week's pool (the archive at 13 Oct, 20:20) were set
  in the tiles:
  - all 41 fit three lines of the tile's 150 px;
  - the widest needs exactly 150 px (Ultrahuman, 71 characters);
  - on two lines the tiles would need 199 px, which the board does not have beside a picture.

**One type size, read as the bible means it.** FULL TIME's rule (round 2 of its graphics log) is that a board never mixes
sizes within one role. Here:

- the frame, the board's fixed question, is 2x;
- every tile, headline, letter, name and guess is 1x;
- kickers, labels and credits are in the micro face, as across the channel's package;
- nothing ever shrinks to fit. A text that would not fit is refused by the desk.

---

## Round 1 — found while building

Not scored: these faults were found and fixed before the board was shown to the panel.

1. **The credit's second line was cut** by the panel's foot (it ended on row 134).
2. **The wrong tiles' letters were unreadable**: slate on steel, about 1.6:1.
3. **LETTER BY LETTER left a third of its board empty.** The 9 × 13 tiles filled two rows at the top. They are now 11 ×
   15 tiles, still at 1x, with the rows centred.
4. **Two questions on one board.** HOW MANY? put "HOW MUCH?" under the kicker "HOW MANY?" for a price, and TODAY OR NOT
   TODAY? put "TODAY OR EARLIER?" under its own name.
5. **Who they are, drawn as a lamp that is off.** The marks on the scores, DOUBLE OR NOTHING and TODAY were slate and
   fog, the look of an unlit lamp.
6. **The table broke out of the safe area.** Eight rows made it 108 px tall, and its numbers ran past the panel's edge.
7. **A revealed "$1.3 billion" lit as two gold boxes**, with a dark gap between them.
8. **The stamp popped**, with a 2 px "thump" for two frames.
9. **The top row's tag was purple without its fog rim**, against the bible's own rule.
10. **The 1x bullet read as a plus sign** in "SATURDAY • COSMOS DESK".

## Round 2 — the panel's first look

Faults:

1. **The stake was nowhere.** PICTURE THIS pays 3, 2 or 1 points by step and LETTER BY LETTER by stage, and neither board
   said what a lock-in or a buzz was worth now. The viewer had no reason to feel the picture sharpening as a loss
   (producer).
2. **The quickfire's tally was pips without a number** (first-time viewer).
3. **The fit check was an export only.** Nothing refused a headline the tiles could not hold, and the bible says such a
   headline is not used (standards).
4. **Two made-up names.** A board drawn without its players showed "PLAYER ONE", cut by the gutter to "PLAYE"
   (standards).
5. **The map's reveal:**
   - the wrong tags rode the zoom out past the map's edge, half cut by its frame;
   - the right tag changed sides halfway through the move;
   - with three neighbouring pins the framing view was already at zoom 4, so the "zoom to the right one" was only a pan
     (director).
6. **Slivers.** The wipes kept a 1 px minimum, so a mark leaving left a one-pixel gold sliver of its square for a frame
   (pixel artist).
7. **"WHICH STORY?" ended 4 px from tile A's rim** (pixel artist).
8. **Two crashes in waiting:**
   - a picture the page may not read (cross-origin, without CORS) would throw inside the board;
   - a pin without coordinates drew at NaN (robustness).
9. **Work every frame:**
   - `creditOf` ran `Intl.formatToParts` three times per frame on every revealed board;
   - the layout caches built a key string per text per frame;
   - every word of a headline was its own text image, more than 30 blits per board (engineering).

| Category | Score | Worst fault |
|---|---|---|
| Legibility at 1x and 4x | 9.3 | 2, 7 |
| Editorial fidelity | 8.8 | 3, 4 |
| Broadcast craft | 8.9 | 1, 5 |
| Pixel art | 9.2 | 6, 7 |
| Data robustness | 8.5 | 3, 8 |
| Consistency and performance | 8.6 | 9 |

**Round score: 8.5.**

## Round 3 — after the fixes

What changed, fault by fault:

1. **The stake beside the countdown**, in the micro face: "3 POINTS", "2 POINTS", "1 POINT" (`stakeOf`). The bar is
   shortened, so the two never touch.
2. **The tally's count** after the pips: "4 RIGHT".
3. **The desk refuses by the boards' own measure.** `quiz-fit.js` holds the layouts and the checks: `fitsTile`,
   `fitsLetters`, `fitsWhere`, `fitsSentence`, `fitsToday` and `quizFits`. `rounds.js` uses them:
   - a story is never asked, nor a headline offered, that would not fit;
   - the eight real editions came out identical (none of the pool was refused).
4. **No made-up names.** A board without its players shows the shapes alone.
5. **The map's reveal is choreographed:**
   - at the reveal the right tag turns gold and takes the side it keeps;
   - 0.6 s later the wrong pins and tags wipe away (0.2 s);
   - then the map moves onto the right pin (1.4 s), always closing in: twice the framing zoom, 4 to 8.
6. **Nothing under a whole pixel is drawn.**
7. **The tiles' letter badge is 9 px**, as on the map's tags. The frame gets 6 px of air, and the tile text keeps its
   150 px.
8. **No crashes.** An unreadable picture leaves the slot dark and logs once. Pins without coordinates are left out, and
   a WHERE question with none draws nothing.
9. **Cached:**
   - `creditOf` per airing and minute;
   - the credit's lines per credit;
   - the layouts in nested maps (no key string per frame);
   - the lock lists per list;
   - LETTER BY LETTER's stages per reveal;
   - a line of plain words is one text image.

New faults:

1. **DOUBLE OR NOTHING understated its stake.** The new stake read "3 POINTS" while the player behind played for 6. A
   board must never show a lower stake than the one being played for (standards).
2. **Gold stopped meaning right.** After the reveal a wrong player's lamp stayed gold beside a slate tile. TODAY already
   dimmed a wrong lamp, so the boards disagreed with each other (first-time viewer).
3. **LETTER BY LETTER's clock ran on after the winning buzz.** Stages kept revealing and the bar kept ticking while the
   player said the headline (director, producer).
4. **The table ranked equal records apart, by alphabet** (MAX 7th, ADA 8th on one win from one game) (standards).
5. **The credit could run past its lines.** Its last resort wrapped a long source to three lines, and the third would
   have fallen below y 134 (robustness).
6. **The scoring rules, misstated in two places:**
   - the lab gave "+3" for the right number on a figure that aired "UP TO"; the bible's exact bonus is for unqualified
     figures only;
   - the HOW MANY? round card stated half the rule (standards, producer).

| Category | Score | Worst fault |
|---|---|---|
| Legibility at 1x and 4x | 9.7 | — |
| Editorial fidelity | 9.3 | 1, 6 |
| Broadcast craft | 9.4 | 2, 3 |
| Pixel art | 9.7 | — |
| Data robustness | 9.5 | 5 |
| Consistency and performance | 9.6 | 2 |

**Round score: 9.3.**

## Round 4 — after the fixes

1. **The doubled stake, and whose it is**: "6 FOR PENNY" (the board's `double`: the seat behind). The leader's single
   points go unsaid, never misstated.
2. **A lamp beside a wrong answer goes out at the reveal**, on the question board and on the map, as on TODAY's. After the
   reveal gold only ever means right.
3. **The game clock stops at the winning buzz**: stages, cells and stake freeze as they stood. A stall does not stop it,
   since the other player may still buzz.
4. **Equal records share a rank** (`tableRows`): 1, 2, 3, 3.
5. **The credit keeps to its lines.** A source no step fits takes the lines but the last, and the day and time keep the
   last. Dots appear only when even that cannot hold it, as on FULL TIME's boards.
6. **The scoring rules, now stated in full:**
   - the lab's right number under "UP TO" is the closest guess, 2 points;
   - the round card states "THE CLOSEST GUESS 2 · EXACTLY RIGHT 3" when one of the round's figures aired unqualified
     (`exact`).

The tests (16) cover:

- the safe area of every board at every moment;
- the 72-character tiles and the refusals, by the board and by the desk;
- one size per role: nine 1x tile lines on the longest headlines;
- gold right and slate wrong, and a lamp going out beside a wrong tile;
- the circle and the square, row by row, with names and never a letter;
- the four steps in whole blocks on the beats, and the full picture at the reveal;
- LETTER BY LETTER's stages and the clock stopping at the winning buzz;
- the mask as a solid block with no ▮ reaching the font, and the reveal's gold span;
- the map's tags inside it and apart, even "UNITED ARAB EMIRATES";
- TODAY's lamps, stamp and tally, the stake, the countdown's half notes, the credit and the shared ranks;
- palette colours only, in every fill of every board and every text (never magenta or cyan).

The whole lab was read again at 1x with the overlay, at 2x, and at 4x for the question board, the map, LETTER BY LETTER,
HOW MANY? and TODAY. Filmstrips were made of the reveal, the map's move and the buzzes.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Legibility at 1x and 4x | 9.8 | the credit and the kicker are in the micro face, 5 px caps (25 px on a 1080p screen), the channel's face for sources. A three-line tile holds its text 2 px inside the rim. The tally's pips are 5 × 3, with their count beside them |
| Editorial fidelity | 9.8 | the board draws the plan and the game's points as it is given them, and does not check the scoring rules itself (the writer is their source). "WHICH STORY?" stands for the bible's "Which story is this picture from?". A source too long for two lines of 132 px would be cut with dots; none in the archive comes near, and the widest, "THE WALL STREET JOURNAL", takes one |
| Broadcast craft | 9.75 | the lamps' column beside the tiles is empty while the options are read, until the first lock-in. Every time on the boards is the lab's own; step 4 sets them from the voices, and WHERE's reveal needs 2.2 s of the host |
| Pixel art | 9.8 | real photographs have not been through the steps in the lab (the generated pictures have, by the same pixelation the channel uses). The question board fills the action-safe width, wider than the channel's other boards, because three-line tiles beside a picture need it |
| Data robustness | 9.8 | a name wider than 32 px would be cut in the gutter (none in the cast: UNIT-8 is exactly 32). Without its picture, PICTURE THIS shows a dark slot: the director must not air it so |
| Consistency and performance | 9.8 | the map rebuilds its 213 × 101 base every frame of the 1.4 s move, as the locator does on its own fly. `preparePicture` costs a few milliseconds on the board's first frame unless the director calls it ahead |

**Round score: 9.75. Passed.**

## Carried to step 4 (the director)

- **Map the writer's segments onto the boards.** The kicker comes from `kickerOf`, the frame from `frameOf`, the credit
  from `creditOf(aired, { now, titles })` with the channel's programme titles, and the players as `[{ seat: 'A', name },
  { seat: 'B', name }]`: the writer's anchor A is the circle, B the square.
- **The times on the board's clock:**
  - PICTURE THIS: `optionsAt` is the start of the "options" segment; `countdown: { at, dur }` is the "countdown"
    segment's start and its `countdown` (7.5 s, seven half notes); the default `stepTimes` are the countdown's start and
    two and four ticks into it; `locks` come from the "lock" segments' starts (`quiz.lock.answer`); `revealAt` is the
    "reveal" segment;
  - LETTER BY LETTER: three `stageTimes` on the beat and `buzzes` from the "buzz" and "stall" segments. The writer's
    countdown, 10 s, is not a whole number of half notes (9.33): make it 9 or 10 half notes;
  - WHERE: `pinsAt` is the "pins" segment, as the host names them;
  - HOW MANY?: `guesses` from the "guess" segments (`said`, `points`);
  - TODAY: one board per headline, with `index`, `locks` and the round's `tally` so far.
- **Pass `double` (the seat behind) on DOUBLE OR NOTHING's question board**, and `exact` on HOW MANY?'s round card when
  one of the round's figures aired unqualified.
- **Preload each picture through the station's own `/api/img`** and call `preparePicture` ahead. Never air PICTURE THIS
  without it.
- **WHERE's reveal segment must last at least 2.2 s** (0.6 s of the dimmed pins, their 0.2 s wipe, then the 1.4 s move).
