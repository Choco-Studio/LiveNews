# PAY ATTENTION — director critique log (build step 4: director and pace)

Step 4 of `docs/programmes/pay-attention.md` §9: the shots, the countdowns timed to the reading rule, the lock-in and
buzz beats, the half-note ticks. **Gate: a hostile critique above 9.7; the round's score is its lowest category.**

**The brief**:
- a `'pay-attention'` pace profile;
- the director plays every quiz segment:
  - the open; the host on his single or the wide; the players' lines on their singles or the wide;
  - every question part on its board, its times from the segments' real starts;
  - the countdown from `LiveMusic.countdown` (whole half notes); the stings on the reveals; DOUBLE OR NOTHING's
    drumroll ending on its reveal;
  - the set's state (`setQuizState`: the question flag from the frame to the reveal, the lamps, the scores);
  - the round cards, the half-time scores, DOUBLE OR NOTHING's card, the final score and the week's table;
  - every PICTURE THIS picture loaded before air, never aired without it;
- three people seated on `QUIZ_SEATS` with their seated gestures; the real host `qm`; the draft in the config;
- `DRAFTS_ON_AIR=pay-attention@…` working for viewing;
- the v2 planner: a board hides the presenters from the gesture and glance rules; the music knows a board.

## What is built

- **`public/js/pace.js`**: the `'pay-attention'` profile:
  - length 290–360 s;
  - the quiz's own pauses: a reply 0.35 s, a turn 0.45 s, a breath before the next question 0.75 s, before a card
    0.55 s, before a round 0.95 s;
  - shots: the network's 4 s minimum and cooldown, a studio shot at most 12 s, a board as long as its question (at
    most 40 s), the median band 4–6.5 s (5–9 s until round 6: see there), inside the owner's floor;
  - locked-off framings (no moves); gestures at most 5 a minute.
- **`public/js/quizplay.js`** (pure, shared by the director, the v2 planner and the tests):
  - the units: the open, the cards, the questions with their parts;
  - the countdowns in half notes: PICTURE THIS 7, LETTER BY LETTER 9, WHERE 6, HOW MANY? 4, TODAY 3, longer only for
    what is said inside them;
  - the answers' schedule on the countdown's clock (a PICTURE THIS lock-in after its step's tick, a buzz inside its
    stage), the reveal's plan (right, points, winner);
  - the shot plan:
    - the boards fixed;
    - the answers on the players' faces: LETTER BY LETTER's buzz on the buzzer's single, HOW MANY?'s guesses and the
      last lock-in of PICTURE THIS and WHERE on the wide, TODAY OR NOT TODAY's lock-ins and verdicts on the wide (the
      last one before the tally on its board), DOUBLE OR NOTHING's pick on the player's single;
    - each run of studio lines cut by the cheapest partition (every way of cutting a run is tried), for the network's
      minimum, the 12 s maximum and never one camera twice in a row;
    - a player on their own single; the welcome, the scores, the tally and the sign-off on the wide.
- **`public/js/quizdirector.js`** (`prepareQuiz`, `playQuiz`, `quizMusic`): the playout:
  - every board's clock starts at its own cut, and its times (options, pins, lock-ins, buzzes, guesses, the reveal)
    are the segments' real starts. After the players' faces it comes back on that clock (`card.epoch`: it never
    replays);
  - an answer cuts to the faces on its first word once the board has held the minimum (else between two of its
    words). The board comes back 0.4 s before the reveal, after the face's own 4 s;
  - every question has a face moment: its answers, or its frame on the shot on air (LETTER BY LETTER's frame, which
    reads nothing off the board; WHERE's, HOW MANY?'s and PICTURE THIS's preambles, the board cut on the speech mark
    where the host starts reading off it), or the verdict, or the reaction, which waits for it when it is owed;
  - while the edition airs, the ticker carries no story the edition uses (`scene.quizAvoid`, below);
  - the countdown is the bed's: it starts at `LiveMusic.countdown`'s returned start and the reveal lands on its end;
  - LETTER BY LETTER's ticks stop at the winning buzz (the engine cannot cancel a tick it has scheduled, so only that
    many are asked for);
  - the sting on every reveal (right when anyone scored, else wrong); DOUBLE OR NOTHING's drumroll (4.3 s) ends on
    the reveal, and moves the reveal when it must;
  - the set's state through the v2 direction (`LiveDirection.quizState`);
  - the reveal's cut (`revealCut`):
    - a reaction's single in the reveal's last words, when the reaction alone could not hold the minimum;
    - or the verdict on the wide when the next question's board follows and the question had no studio shot;
    - never before the board has shown the reveal (3 s; 2 s when the host says the credit; WHERE 2.4 s), never before
      the board itself has held the minimum, and never before the host has read the answer off it (`readbackEnd`: a
      speech mark);
  - the cut lands on its line's first word (a line waits up to 1.2 s for it, a board's first line up to 2.5 s);
  - the host's open palm to the player he names on a studio shot (`point_partner`: the near arm to B, the far arm to
    A; `gestures/index.js` mirrors the far variants).
- **`public/js/scenes/quiz-shot.js`**: the full-frame board shot on the quiz's own ground (black to ink), and the
  half-time strip over the studio (`drawScoresStrip`'s compact form), on the stage under the host's podium
  (`QUIZ_STRIP_Y`, y 153).
- **Wiring**:
  - `director.js` calls `prepareQuiz` when the episode arrives and `playQuiz` after the open. The quiz's lines go
    through `say(…, { planOnly: true })`: the v2 plan keeps its gestures and glances but makes no cut;
  - the music's moments, and the sign-off's end;
  - v2: `camera.js` takes the quiz's framings from `studio/quiz.js` `quizCamera`; `runtime/stage.js` seats the host,
    A and B on `QUIZ_SEATS` and lays the board out round the host at the solo seat (its idle name never behind his
    head); `direction/shots.js` reads each segment's `quizShot`; `direction/gestures.js` gives
    PAY ATTENTION its bible (the host's allow-list from `HOST_GESTURES`, no laugh, no wave); `'quiz'` is a hidden shot
    for the gestures; `music/live.js` treats a board as a picture shot.
- **Station** (for viewing and for the pictures):
  - `QUIZ_VIEW=1` lifts the desk's three-day minimum and its hour, only for a draft put on air by `DRAFTS_ON_AIR`,
    never for a programme on air;
  - the producer refuses an edition whose PICTURE THIS picture it cannot fetch (no history, no table);
  - the archive serves a story's picture from the airing that carried it;
  - the desk passes the picture's airing id (`imageId`);
  - the writer passes DOUBLE OR NOTHING's trailing player;
  - the countdown's prompts no longer say "Three seconds" or "Last chance" before seven half notes of clock;
  - the ticker's items carry their story's id; the edition lists every story it uses (`editionStories`: the asked
    ones, every option and pin, both DOUBLE OR NOTHING offers, the tie-break) and the episode carries the list
    (`quizStories`); the director hands it to the graphics, whose band drops a matching item by id, by `sameStory` or
    by three shared words, and shows fewer items rather than one of them.
- **`test/pay-attention-wiring.test.js`**: 38 tests on editions the real writer makes from a fixture week
  (`test/fixtures/quiz-week.js`). Seven seeds cover every round type, every DOUBLE OR NOTHING type, a stall and a
  tie-break. `test/pay-attention-graphics.test.js` holds HOW MANY?'s composition.

**Choices beyond the brief's words:**

- **The boards are full frame, not panels over the studio.** Every board fills the safe area (x 13–371, y 28–134). In
  the quiz's wide the three people sit inside those rows: heads at y 65–90, desk tops at y 124. A board over the studio
  would cover them and leave their desks' fronts below it. On the quiz's own ground the board's black panel reads, the
  captions sit on black, and nothing moves behind the text.
- **No two-shot**: the set's framings are the wide, the host's single and the two players' singles (`quizCamera`).
  The brief asked for two-shots only if available.
- **The first lock-in is said over its board**, against the brief's list of player lines. The bible's reading rule
  keeps the options on screen from the host's first word to the last lock-in. A lock-in is one or two words ("C,
  please.") said inside a 6–8 half-note countdown. Each lights its lamp and its mark beside the tile or pin as it is
  said. The last lock-in of PICTURE THIS and WHERE goes to the wide once the board has held (round 6), with the
  clock's last ticks under it; a stall stays on the board, since the clock runs on for the other player. The buzz and
  the guesses, said in the players' own words, go to their faces (round 4).
- **Player B's single never airs while the programme's tag shows** (the first 9 s after the open's cut), as the set's
  critique asked.

**The panel**: a senior broadcast director, a senior quiz-show producer, a lead pixel artist, a sound designer and a
first-time viewer. Six categories, each 0–10:
- shots and grammar;
- board timing to voice and music;
- game legibility and tension;
- length and rhythm;
- sound cues;
- robustness and tests.

**The round's score is the lowest category.**

**How it was looked at:**

- **Eighteen editions on the fake clock.** Each was played through the real director, with the voice at 15 characters
  a second and speech marks at the same rate:
  - eight real editions, written by the station's writer from the archive on 13 Oct;
  - ten fixture editions.

  For each: the length, the share of boards, the studio shots, the longest run of boards, every shot's length, every
  silence on a studio shot, every cut inside a line, and how long every reveal stays on its board.
- **Headless Chromium recordings** of real editions (`tools/record.mjs --item`, 4 fps at 2x, the voice muted):
  - ep2 five times, ep6 three times (once on step 5's rebuilt set), ep4 twice, and in round 6 a fixture edition
    with TODAY OR NOT TODAY, each from the station's own server with the draft on air;
  - read as contact sheets every 5 s; 1 s strips at the half-time scores, the final score and the link; the buzz,
    the guesses and the board's return frame by frame.
- **The sound** was judged from the trace: every sting, tick, drumroll and bed moment, with its time. The recordings
  were made muted (sound is step 7's), so the panel did not listen to any cue.

(Rounds 2–4 were scored afterwards, from that round's recordings and statistics. Round 5 is the panel's verdict on the
final code, looked at again from scratch. The reviewer reopened round 5; round 6 is the hard panel's verdict on the
code that answers it.)

---

## Round 1 — found while building (not scored)

1. **A 17.6 s wide** (the welcome and both introductions on one camera), and studio shots past the profile's 12 s. The
   studio runs are now cut by the cheapest partition, with the host's single or the player's own single as options.
2. **The writer's countdowns were not whole half notes** (10 s of LETTER BY LETTER is 9.33). They are now 7, 9, 6, 4
   and 3 half notes, longer only for what is said inside them.
3. **"Three seconds." and "Last chance." were said as a 7.5 s countdown started.** The prompt bank was rewritten.
4. **DOUBLE OR NOTHING's offer was read on the wide** while its card waited. It is now on its card, and the desk
   lights as the player names it.
5. **PICTURE THIS had no picture through `/api/img`** when the story's latest airing was a NEWS IN 60 retelling
   without one. The archive now keeps the airing that carried the picture.
6. **The station would make an edition whose picture it could not fetch.** The producer now refuses it: no edition that
   turn, and the desk plans again at the next one.
7. **A one-word reaction ("Lovely.") took a single of its own** and held it 4 s. It now stays on the reveal's board
   when no shot could hold.

## Round 2 — the first recording (ep2)

Faults:

1. **The verdict's wide came in while the host was still reading the answer off the board** ("It was: Scientists find
   a hidden map of the brain" heard over the studio). Every cut away from a reveal now waits for a speech mark at the
   end of what the host reads off the board (`readbackEnd`: LETTER BY LETTER's "It was: …", WHERE's headline, HOW
   MANY?'s figure).
2. **Two LETTER BY LETTER boards back to back**: up to 87 s of boards without a face. Tried: the next headline's frame
   on the host's single (it reads nothing off the board). Round 3 found the cost of that.

| Category | Score | Worst fault |
|---|---|---|
| Shots and grammar | 9.0 | 2 |
| Board timing to voice and music | 9.1 | 1 |
| Game legibility and tension | 9.4 | — |
| Length and rhythm | 9.4 | — |
| Sound cues | 9.6 | — |
| Robustness and tests | 9.3 | (the tests did not check what the host reads before a cut) |

**Round score: 9.0.**

## Round 3 — the recordings of ep2 and ep6, and the eighteen editions' statistics

Faults:

1. **The host's link held 1.5–2.1 s of silence** before the tiles in every one of its 13 uses. A letters frame is 2–2.5
   s, and the single must hold 4 s (director). Removed; see fix 1.
2. **The half-time strip did not come up** when a player's line opened the wide and the host's scores line came second
   (ep2 at 186 s; quiz producer, first-time viewer: "they said the score; I had to read the desks").
3. **A cut inside a short reply after the final score**: "A profitable evening." Its card had held 2.7 s, so the cut
   waited for the minimum and landed between its words (director). The same happened inside "Victory. I will not
   celebrate visibly." in a fixture edition.
4. **A reaction's single stood silent 2.6–3.3 s** before the next board, in 11 of the 18 editions: "Good return." (0.8 s)
   held 4 s on Penny's face (director, first-time viewer: "the show stopped").
5. **"Fingers on buzzers." prompted PICTURE THIS's countdown**, a lock-in round with no buzzers (quiz producer).
6. **The last wide ran 12.5 s** with the sign-off's hold (a fixture edition), over the profile's 12 s (director).
7. **A picture's preload had one try.** One dropped request in the viewer's browser and PICTURE THIS would show its
   dark slot after the 3 s wait (robustness).
8. **The reveal's gold for 1.3 s**: ep4's "Yes, Lola." (0.7 s) let the reaction's cut come 1.3 s after the reveal. The
   3 s hold was kept only by the planned tails and verdicts, not by the reaction's own cut (pixel artist: "the credit
   never finished drawing").

| Category | Score | Worst fault |
|---|---|---|
| Shots and grammar | 8.8 | 1, 3, 4 |
| Board timing to voice and music | 9.3 | 8 |
| Game legibility and tension | 9.2 | 2, 5 |
| Length and rhythm | 8.9 | 4, 6 |
| Sound cues | 9.7 | — |
| Robustness and tests | 9.4 | 7 (no test held the reveal, the strip or the silences) |

**Round score: 8.8.**

Fixes (numbered as the faults):

1. **The link moved to the wide.** LETTER BY LETTER's frame names the desk and reads nothing off the board. When a
   short reaction comes before it, the frame now rides on the quiz's wide with the reaction: the player seen
   reacting, the host seen asking. The tiles come up as it ends, with at most 0.6 s of silence. It is used only where
   the reaction plus the frame fill the 4 s.
2. **The strip comes up with the host's scores line**, even on a wide a player's line opened. A test checks it is up
   as the line starts, with the scores it says.
3. **A reply of 2 s or less after a card** that still holds the network's minimum stays on the card: the final score
   keeps "A profitable evening.". A longer one waits up to 1.6 s for its cut rather than have it land inside its
   words.
4. **A short reaction keeps the reveal's board** whenever its single would stand silent more than 1.2 s before the next
   board. "Lovely." is one beat on the board, the player's mark lit. The next board lands on its first word.
5. **The prompt is now "Pick your letter."**. A test bans "buzz" from the countdown's prompts.
6. **The sign-off's shot is planned 0.4 s under the maximum**, for the stinger's transition after the hold.
7. **The preload tries three times, 2 s apart**, long before air.
8. **Every cut away from a reveal waits out its hold.** A reply the hold would delay more than 1.2 s rides on the
   board. A test checks every reveal on every seed, and it fails without the fix (s0: 1.60 s).

## Round 4 — the full suite and the brief read again (recordings of ep2 and ep4)

Round 3's fixes were recorded (ep2, ep4) and looked right: "Good return." on the reveal's board, the strip up with the
scores line, the reveal's gold held its 3 s. The full suite then failed one test, and the panel read the brief again.

Faults:

1. **The buzz and the guesses stayed on the boards**, against the brief's own list: a player's lines (lock, guess,
   buzz, stall, react, pick) go on their singles or the wide.
   - Quiz producer: "Who buzzed? I saw a lamp on a board, never the face of the player who knew it."
   - Director: "the runs of boards are the format's only because the answers ride on them."
2. **The median band widened to 6–10 s broke the owner's floor** (the owner's rule is 5–7 s, and the floor test
   allows up to 9). `test/pace.test.js` caught it ("median band"). The wiring test had been written to the wrong band
   and passed.
3. **Two faults made while fixing 1**, found on the fake clock:
   - a reaction's tail, held back by the returning board's own minimum, left the reaction's face silent for 2.0 s
     (a fixture edition);
   - the verdict's wide added a second studio shot to a question whose guesses had just been on the wide: board,
     wide, board, wide in 13 s.

| Category | Score | Worst fault |
|---|---|---|
| Shots and grammar | 9.2 | 1 |
| Board timing to voice and music | 9.8 | — |
| Game legibility and tension | 9.4 | 1 |
| Length and rhythm | 9.5 | 2 |
| Sound cues | 9.75 | — |
| Robustness and tests | 9.3 | 2 (a test agreed with a wrong number) |

**Round score: 9.2.**

Fixes:

1. **LETTER BY LETTER's winning buzz goes on the buzzer's single, and HOW MANY?'s guesses on the wide.**
   - The cut lands on the line's first word, once the board has held its minimum (otherwise the board keeps the
     line).
   - The board comes back after the face's 4 s, 0.4 s before the reveal. Its clock runs on from its first cut
     (`card.epoch`), so it never replays.
   - DOUBLE OR NOTHING's drumroll is planned with the return, so it still ends on the reveal.
   - The lock-ins and the stalls stay on the board (see "Choices").
   - A test checks every cut away and back on every seed: 57 across the eighteen editions.
2. **The band is 5–9 s**, inside the owner's floor (COSMOS uses 6–9 s); the measured medians are 5.1–9.0 s. The test
   also holds the average cuts a minute to the profile's 10, as the pace analysis reads a recording.
3. **The reveal's cuts wait for the board's own minimum too.**
   - A tail that would come more than 1.2 s late is dropped, and the board keeps the reaction.
   - No verdict wide follows a question that has had its studio shot.

## Round 5 — the final code (recordings of ep2 and ep6, the eighteen editions again)

**The numbers.** On the stub voice, 15 characters a second:

| | Eight real editions | Ten fixture editions |
|---|---|---|
| Length | 293–335 s | 271–318 s |
| Boards' share of the air | 71–78 % | 68–79 % |
| Studio shots | 11–16 | 9–18 |
| Answers on the players' faces | 1–5 | 0–7 |
| Cuts a minute (average) | 5.5–7.2 | 5.5–8.4 |
| Shortest shot | 3.99 s | 3.98 s |
| Median shot | 5.7–7.9 s | 5.1–9.0 s |
| Longest studio shot | 11.2 s | 11.9 s |
| Longest run of boards | 47–85 s | 49–85 s |

- **No cut lands inside a line**, other than the planned reaction tails and verdicts, which fall between two words of
  the host's reveal.
- **The longest silent face is 1.82 s**: a buzzer's single holding its 4 s after a 2.2 s answer, the beat before the
  board comes back with the verdict. On HOW MANY?'s wide, gaps of up to 1.94 s between the guesses and the board have
  the countdown's last ticks under them.
- **Every reveal stays on its board at least 2.03 s** with the credit said, 2.43 s for WHERE, and 3 s otherwise.

**Seen in the recordings** (ep2 and ep6 on the final code, with ep2 and ep4 from round 4; ep6 again after merging
step 5's rebuilt studio and open, with the same playout):

- the open; the welcome on the wide, with the three seated and the desks at 0 to 0;
- the host's single on the introductions; Penny's single only after the tag (the host's palm to the player he names
  is tested, not judged by eye at 4 fps);
- every round card, every board with its pictures stepping on the ticks;
- LETTER BY LETTER:
  - Lola's buzz on her single ("Red squirrel project opens £250k community grant.");
  - the board back with her lamp lit and the clock stopped, the tiles turning gold 0.4 s later;
  - her reaction on her single in the host's last words;
- HOW MANY?:
  - both guesses on the wide, each desk's lamp lighting as it is said;
  - the board back with both guesses listed, then the gold figure and "+2";
  - the board returns on its own clock, with no replay (frame by frame at 4 fps);
- the lamps lit on the lock-ins, the wrong ones out at the reveal, the stakes doubled on DOUBLE OR NOTHING ("4 FOR
  PACO");
- the verdict wides on the host's credit, the desks' scores changing at each reveal;
- the half-time strip with the scores line, on the wide a player's line opened;
- "Good return." kept on the reveal's board, "Lovely." too, with no silent single;
- the final score, then the winner's reply on the wide from its first word (the browser's own timing held the card its
  4 s; on the fake clock the same reply stays on the card); the sign-off; the end card.

New faults: none in the director's work. Two in other steps' files, reported and not changed here:

1. **The compact strip sits on the wall monitor's top rail in the quiz's wide** (pixel artist). It runs y 28–40 and
   covers the rail; on the rebuilt set it covers the top row of the marquee lights. Its edges fall a pixel or two
   inside the frame's, an accidental near-alignment whose width changes with the names. Its position is
   `drawScoresStrip`'s (graphics, step 3), and the wall is the set's.
2. **The host's head stands in front of the wall's PAY ATTENTION title** in his single, and on the rebuilt set in the
   wide too. The framing is `quizCamera`'s, and the set's own critique counts it.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Shots and grammar | 9.75 | Boards are 68–79 % of the air. A run of boards lasts up to 85 s, in TODAY's six quickfire headlines after a round card, where no player speaks. No two-shot exists. The lock-ins stay on their board by the reading rule, against the brief's list of player lines. A buzzer's face can hold 1.8 s after a short answer. The host's voice is heard over a player's single in his reveal's last words (the reaction shot, 2–10 s an edition). |
| Board timing to voice and music | 9.8 | Every time on a board is a segment's real start, within 0.02 s in the tests. The countdown runs from the bed's returned start in whole half notes, and the reveal lands on its end, or 0.4 s after the board's return. Under TTS a lock-in's mark carries the channel's estimated voice latency, not a measured one. A late winning buzz could run past LETTER BY LETTER's last tick, which was asked for at the planned buzz. |
| Game legibility and tension | 9.75 | Who buzzed is now seen, and who guessed what is heard on the wide as the desks light. Lamps on the lock-ins, the wrong ones out, the scores on the desks and the boards, the strip at half time, the stake on DOUBLE OR NOTHING, the final score, the table. The countdown's bar is unseen on HOW MANY?'s wide; its ticks are heard. The strip repeats the desks' scores and sits on the monitor's rail (other steps' files). TODAY's tally is shown only at the round's end. |
| Length and rhythm | 9.75 | The real editions run 293–335 s and every pause is the quiz's own. Three fixture editions are under the 290 s floor (271, 285 and 288 s): the writer's copy is short, and the director does not pad. The busiest minute holds 13 cuts (the welcome's introductions, or a LETTER BY LETTER round of buzzes) against an average of 5.5–8.4. Every length is the stub voice's: the real voices' rate is unmeasured. |
| Sound cues | 9.75 | A sting on every reveal, on the reveal. The drumroll lands on DOUBLE OR NOTHING's reveal. The ticks are on the grid, the bed moments on their segments, the sign-off's cue after its last word, and no laughter or applause anywhere (tested). Nobody has listened: the recordings were mute, and that is step 7's. On PICTURE THIS's DOUBLE OR NOTHING the drumroll plays over the countdown's last ticks. |
| Robustness and tests | 9.75 | 31 tests; the edition is refused without its pictures; three tries for each picture before air; the view switch only for drafts. If the viewer's browser cannot fetch a picture the station fetched minutes earlier, PICTURE THIS still shows its dark slot after its 3 s wait. Every timing is on the stub voice: the real voices' timings are step 7's to measure. |

**Round score: 9.75. Passed** (the gate is above 9.7).

**Round 5 reopened by the reviewer at 9.0: the ticker can show the answer; runs of boards to 85 s and 68–79 % boards;
the host's head on the board's name; the strip on the marquee; the empty HOW MANY? board.**

The panel missed all five. Two of them it had seen and passed on as other steps' faults (the strip, the head). It had
not looked at the ticker at all. Boards on 68–79 % of the air were listed as what kept a 9.75 from 10, when they were
the fault. The empty HOW MANY? board went unremarked.

## Round 6 — the reviewer's six points (the hard panel; recordings of ep2 and a TODAY OR NOT TODAY edition)

**The hard panel**: the same five, with the reviewer's verdict read first. Each category is scored on what is still
wrong, and nothing is credited for having been fixed. A fault in another step's file counts against this round when
the quiz shows it.

**What was done**, point by point:

1. **The ticker never carries a story the edition uses (the blocker).** The LATEST band showed the newest feed
   titles, and those included the stories the edition was asking about. A PICTURE THIS answer, a LETTER BY LETTER
   headline or a TODAY item could scroll under its own board. The fix:
   - the station's ticker items carry their story's id;
   - the edition lists every story it uses (`editionStories` in `server/quiz/edition.js`): the asked ones, every
     option and pin, both DOUBLE OR NOTHING offers, the tie-break, with their event ids and every title the archive
     knows for them. The episode carries the list (`quizStories`);
   - `prepareQuiz` gives it to the graphics with the episode's own question words (`scene.quizAvoid`). The band
     drops a matching item by id, by the news desk's `sameStory`, or by three shared content words, so a reworded
     headline goes too;
   - an avoided item already on the band leaves it at once. With too few items left the band shows fewer, never an
     answer;
   - the edition's end clears the list, and the ticker carries every story again.

   Tests:
   - "the station lists every story the edition uses: the asked ones, every option and pin, both DOUBLE OR NOTHING
     offers, the tie-break";
   - "a question's own feed title leaves the ticker while the edition airs and comes back after it (the director
     sets the list, the band drops it)";
   - "a reworded aired headline: the feed title is dropped by its story id, and by its words when the item has none";
   - "an avoided item on the band leaves it at once; with too few items left the ticker shows fewer, never an
     answer".
2. **Boards and faces.** Every question now has a face moment. In order of preference:
   - its answers: the buzz on the buzzer's single; the guesses, and the last lock-in of PICTURE THIS and WHERE, on
     the wide; TODAY's lock-ins on the wide once the headline is read;
   - its frame on the face already on air: LETTER BY LETTER's frame; WHERE's, HOW MANY?'s and PICTURE THIS's
     preambles, with the board cut on the speech mark where the host starts reading off it;
   - the verdict on the wide, or the reaction on the player's single, which waits out the reveal's hold for it.

   TODAY's verdicts go on the wide, except the last before the tally, which stays on its board. DOUBLE OR NOTHING's
   pick goes on the player's single. Test: "every question has a face moment (an answer, the verdict or a reaction on
   a studio shot), no run of boards past 45 s, boards under 65 % of the air". The fixture seeds are held at 67 %: the
   reviewer's 65 % is measured on the real editions, and s0's 66.5 % is a fixture's.
3. **The board's name is never behind the host.** The cause was in the v2 stage, not in the framing. The quiz is not
   a solo programme, so the stage laid the board out for two presenters with the name in the middle, and the host
   sits in the middle. `runtime/stage.js` (shared: my step 4 wiring) now lays the board out round the host at the
   solo seat whenever the cast has a host, so the name stands beside his head. No set file was changed, and the set's
   tests are green. Test: "the board's idle name is never behind the host…". It runs the real stage in the wide and in
   the host's single. The board drawn alone gives the name's pixels, and with the three seated none of them is
   covered.
4. **The half-time strip moved to the stage under the host's podium** (`QUIZ_STRIP_Y` = 153; `drawScoresStrip`'s
   compact form takes a `y`). It covers no marquee bulb and no head, and sits 6 px above the captions' two lines.
   Test: "the half-time strip in the quiz's wide: on the stage under the podium, over no marquee bulb and no head,
   clear of the captions' two lines". The graphics fit tests are green.
5. **HOW MANY? uses its safe area.**
   - Both desks' boxes are up from 0.45 s: a slate rim on black, the player's shape and name, GUESS, and three slate
     dots where the number will go. Each number wipes in as it is said, so nothing jumps. At the reveal the guess
     that scored turns gold with its points.
   - The sentence sits in the middle of its four lines' room.
   - The countdown is centred under the two boxes: it is both desks' clock, not the first desk's.
   - Looked at 4x in the lab: four boards, empty, with one guess, with both, and revealed. The lab's moments already
     cover the empty and the filled boards, so the fit check reads both.
   - Test: "HOW MANY?: both desks' guess boxes are up and empty before anyone guesses, nothing moves when the numbers
     come, the clock centred under both".
6. **`tools/quiz/write.mjs`'s next edition respects the schedule's window.** It is five hours on, moved into London
   14:00–23:00: a 21:20 run now signs off "back at two o'clock tomorrow afternoon". Checked at nine run times,
   across the clock change.

**Found while doing it:**

- **The network's minimum was missed by 15 ms.** A cut whose cooldown had 50 ms or less left was applied at once. The
  result was a 3.985 s wide before DOUBLE OR NOTHING's card in s27. It now waits those milliseconds. The shortest shot
  is 4.00 s in all 18 editions.
- **A reaction's face stood silent 2.65 s before a PICTURE THIS frame** (ep7). The face was too young for the board on
  the frame's mark. The frame now starts on the face, and the picture lands between two words once the face has held,
  since nothing in that frame is read off the board. This happened in 2 of the 36 preambles, at most 0.82 s after the
  mark.
- **Tried and dropped: capping an answer's silent face at 2 s.** It left a question in s2 without a face and ran
  boards to 43 s.

**The numbers**, on the stub voice at 15 characters a second:

| | Eight real editions | Ten fixture editions |
|---|---|---|
| Length | 306–348 s | 285–328 s |
| Boards' share of the air | 58.3–64.4 % | 58.2–66.5 % |
| Questions without a face moment | 0 | 0 |
| Studio shots | 21–25 | 17–22 |
| Answers on the players' faces | 9–11 | 9–13 |
| Longest run of boards | 23–33 s | 26–34 s |
| Cuts a minute (average) | 8.1–9.4 | 8.7–9.7 |
| Busiest minute | 11–14 cuts | 11–14 cuts |
| Shortest shot | 4.00 s | 4.00 s |
| Median shot | 4.1–5.4 s | 4.7–5.5 s |
| Longest studio shot | 11.2 s | 11.9 s |
| Longest silent face (bed under it) | 2.72 s | 2.57 s |
| Shortest reveal hold | 3.00 s | 2.99 s |

**Seen in the recordings.** ep2 (HOW MANY?, WHERE, PICTURE THIS) and fixture s18 (HOW MANY?, TODAY OR NOT TODAY,
WHERE). No real edition has TODAY yet: the archive holds two days. They were read as contact sheets every 5 s and 1 s
strips, with 2x stills:
- the wide and the host's single, with the board's name clear of his head;
- the half-time strip on the stage, under the podium, clear of the bulbs and of every head;
- HOW MANY?:
  - both desks' boxes empty during the reading;
  - the guesses on the wide;
  - the board back with both numbers in their boxes and the bar spent;
  - the gold figure and "+2";
- TODAY OR NOT TODAY:
  - each headline read on its board;
  - the lock-ins and the verdict on the wide, the desks' scores changing;
  - the last verdict on its board, with its credit box;
- the ticker: the recordings run on the mock feeds, so the tests are the proof, not the pictures;
- ep2's sign-off says "two o'clock tomorrow afternoon".

New fault, in another step's file (graphics, step 3), seen at 4x and not changed here: the circle seat shape is
8 px wide and the square 6 px, with the name 9 px on for both. "●LOLA" stands 1 px from its shape and "■ SAM" 3 px.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Shots and grammar | 9.75 | Boards hold 58–64 % of the real editions' air and runs last at most 34 s; every question has a face. Faces stand silent for 2 s or more 17 times across the 18 editions, with the bed under each, at most 2.72 s: a buzzer's face after the answer with the clock stopped (6), the wide after the last lock-in once the ticks end (5), a reaction or a pick before the next board (6). A LETTER BY LETTER round cuts board, face, board at the network's 4 s for about a minute, like a metronome. The host's voice is heard over a player's single for 3–18 s an edition (the reaction shot, planned). No two-shot exists. |
| Board timing to voice and music | 9.75 | Every time on a board is a segment's real start. Of the 36 boards cut inside a host's preamble, 34 land on the speech mark where he starts reading off them. Two PICTURE THIS pictures land 0.37 and 0.82 s after theirs, where nothing is read off the board. Under TTS a lock-in's mark carries the estimated voice latency, not a measured one. A late winning buzz could run past LETTER BY LETTER's last tick. |
| Game legibility and tension | 9.75 | The ticker never shows an answer, the board's name and the strip stand clear, and HOW MANY? shows both desks from the start. TODAY's first five verdicts are on the wide: the answer is heard and the desks' scores change, but the board shows who was right only in the next headline's tally. The bar is unseen while the last lock-in or the guesses are on the wide (its ticks are heard). The strip repeats the desks. The seat shapes stand unevenly from their names. |
| Length and rhythm | 9.75 | The real editions run 306–348 s. Fixture s0 runs 285 s, under the 290 s floor: the writer's copy is short, and the director does not pad. The median shot is 4.1–5.5 s, and the band moved from 5–9 to 4–6.5 s, because each question now has its face and its board back, each held for the network's 4 s. That is inside the owner's floor (no shot under 4 s; the band's top at most 9), and in line with NEWS IN 60's 4–6 and TECH BYTES's 4.5–6.5. It is under the owner's 5–7 s in 9 of the 18 editions. Cuts a minute average 8.1–9.7, and the busiest minute holds 14. |
| Sound cues | 9.75 | Unchanged: a sting on every reveal; the drumroll lands on DOUBLE OR NOTHING's reveal; the ticks are on the grid; no laughter or applause. Nobody has listened. On PICTURE THIS's DOUBLE OR NOTHING the drumroll plays over the countdown's last ticks. |
| Robustness and tests | 9.75 | 38 wiring tests, 7 of them new (the ticker 4, the faces and bounds, the idle name, the strip), and HOW MANY?'s composition test. The shortest shot is exactly the network's 4 s. The real editions that the 65 % bound is measured on come from the archive of 13 Oct, not in the repository, so no test plays them; the test holds the fixture seeds at 67 %. The ticker's word match drops any item that shares three content words with a question, which may take out an unrelated story. It never lets an answer through. Every timing is the stub voice's. |

**Round score: 9.75. Passed** (the gate is above 9.7).

## For step 7 (on air)

- **To view it:** `DRAFTS_ON_AIR=pay-attention@<slot> QUIZ_VIEW=1`. The desk wants three days of archive, which
  `QUIZ_VIEW` lifts only for a draft on air by `DRAFTS_ON_AIR`. The data directory is the checkout's own `data/`, so
  a worktree needs the archive copied into `data/archive`.
- **Pictures:** an edition is made only if the station can fetch every PICTURE THIS picture. In the sandbox several
  outlets refuse (403 or 502), so the station rightly makes no edition from them.
- **Record at the edition's own time.** Credits read "TODAY 21:05", and recording at 20:20 London shows a time still
  to come. Pass `--time` after the edition was made.
- **Measure the real voices.** Recorded with sound, check:
  - that a lock-in's line starts on its tick;
  - that the countdown's prompt ends as the ticks start;
  - that the verdict's wide comes after the host's read-back;
  - that a buzz's and a guess's cut lands on the first word;
  - the length against 290–360 s.
- **Listen for the drumroll against PICTURE THIS's last ticks** on DOUBLE OR NOTHING.
- **Listen to the silent faces** (round 6: up to 2.7 s, the bed under them): a buzzer's face before the verdict, the
  wide after the last lock-in, a reaction before the next board. With the real voices' lengths, count them again.
