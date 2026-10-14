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
    most 40 s), the median band 5–9 s, inside the owner's floor (see round 4);
  - locked-off framings (no moves); gestures at most 5 a minute.
- **`public/js/quizplay.js`** (pure, shared by the director, the v2 planner and the tests):
  - the units: the open, the cards, the questions with their parts;
  - the countdowns in half notes: PICTURE THIS 7, LETTER BY LETTER 9, WHERE 6, HOW MANY? 4, TODAY 3, longer only for
    what is said inside them;
  - the answers' schedule on the countdown's clock (a PICTURE THIS lock-in after its step's tick, a buzz inside its
    stage), the reveal's plan (right, points, winner);
  - the shot plan:
    - the boards fixed;
    - LETTER BY LETTER's buzz on the buzzer's single and HOW MANY?'s guesses on the wide;
    - each run of studio lines cut by the cheapest partition (every way of cutting a run is tried), for the network's
      minimum, the 12 s maximum and never one camera twice in a row;
    - a player on their own single; the welcome, the scores, the tally and the sign-off on the wide.
- **`public/js/quizdirector.js`** (`prepareQuiz`, `playQuiz`, `quizMusic`): the playout:
  - every board's clock starts at its own cut, and its times (options, pins, lock-ins, buzzes, guesses, the reveal)
    are the segments' real starts. After the players' faces it comes back on that clock (`card.epoch`: it never
    replays);
  - a buzz or a guess cuts to the faces on its first word once the board has held the minimum. The board comes back
    0.4 s before the reveal, after the face's own 4 s;
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
  half-time strip over the studio (`drawScoresStrip`'s compact form).
- **Wiring**:
  - `director.js` calls `prepareQuiz` when the episode arrives and `playQuiz` after the open. The quiz's lines go
    through `say(…, { planOnly: true })`: the v2 plan keeps its gestures and glances but makes no cut;
  - the music's moments, and the sign-off's end;
  - v2: `camera.js` takes the quiz's framings from `studio/quiz.js` `quizCamera`; `runtime/stage.js` seats the host,
    A and B on `QUIZ_SEATS`; `direction/shots.js` reads each segment's `quizShot`; `direction/gestures.js` gives
    PAY ATTENTION its bible (the host's allow-list from `HOST_GESTURES`, no laugh, no wave); `'quiz'` is a hidden shot
    for the gestures; `music/live.js` treats a board as a picture shot.
- **Station** (for viewing and for the pictures):
  - `QUIZ_VIEW=1` lifts the desk's three-day minimum and its hour, only for a draft put on air by `DRAFTS_ON_AIR`,
    never for a programme on air;
  - the producer refuses an edition whose PICTURE THIS picture it cannot fetch (no history, no table);
  - the archive serves a story's picture from the airing that carried it;
  - the desk passes the picture's airing id (`imageId`);
  - the writer passes DOUBLE OR NOTHING's trailing player;
  - the countdown's prompts no longer say "Three seconds" or "Last chance" before seven half notes of clock.
- **`test/pay-attention-wiring.test.js`**: 31 tests on editions the real writer makes from a fixture week
  (`test/fixtures/quiz-week.js`). Seven seeds cover every round type, every DOUBLE OR NOTHING type, a stall and a
  tie-break.

**Choices beyond the brief's words:**

- **The boards are full frame, not panels over the studio.** Every board fills the safe area (x 13–371, y 28–134). In
  the quiz's wide the three people sit inside those rows: heads at y 65–90, desk tops at y 124. A board over the studio
  would cover them and leave their desks' fronts below it. On the quiz's own ground the board's black panel reads, the
  captions sit on black, and nothing moves behind the text.
- **No two-shot**: the set's framings are the wide, the host's single and the two players' singles (`quizCamera`).
  The brief asked for two-shots only if available.
- **The lock-ins are said over their board**, against the brief's list of player lines. The bible's reading rule
  keeps the options on screen from the host's first word to the last lock-in. A lock-in is one or two words ("C,
  please.") said inside a 6–8 half-note countdown, so no face could hold 4 s. Each lights its lamp and its mark beside
  the tile or pin as it is said. A stall stays on the board too, since the clock runs on for the other player. The
  buzz and the guesses, said in the players' own words, go to their faces (round 4).
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
  - ep2 four times, ep6 twice, ep4 twice, each from the station's own server with the draft on air;
  - read as contact sheets every 5 s; 1 s strips at the half-time scores, the final score and the link; the buzz,
    the guesses and the board's return frame by frame.
- **The sound** was judged from the trace: every sting, tick, drumroll and bed moment, with its time. The recordings
  were made muted (sound is step 7's), so the panel did not listen to any cue.

(Rounds 2–4 were scored afterwards, from that round's recordings and statistics. Round 5 is the panel's verdict on the
final code, looked at again from scratch.)

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

**Seen in the recordings** (ep2 and ep6 on the final code, with ep2 and ep4 from round 4):

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

1. **The compact strip sits on the wall monitor's top rail in the quiz's wide** (pixel artist). It runs y 28–40 and the
   monitor's frame starts at y 27, so its edges fall a pixel or two inside the frame's, an accidental near-alignment
   whose width changes with the names. Its position is `drawScoresStrip`'s (graphics, step 3). The wall is the set's,
   which is still being enriched.
2. **The host's head stands in front of the wall's PAY ATTENTION title** in his single ("PAY A[head]TION"). The
   framing is `quizCamera`'s, and the set's own critique counts it.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Shots and grammar | 9.75 | Boards are 68–79 % of the air. A run of boards lasts up to 85 s, in TODAY's six quickfire headlines after a round card, where no player speaks. No two-shot exists. The lock-ins stay on their board by the reading rule, against the brief's list of player lines. A buzzer's face can hold 1.8 s after a short answer. The host's voice is heard over a player's single in his reveal's last words (the reaction shot, 2–10 s an edition). |
| Board timing to voice and music | 9.8 | Every time on a board is a segment's real start, within 0.02 s in the tests. The countdown runs from the bed's returned start in whole half notes, and the reveal lands on its end, or 0.4 s after the board's return. Under TTS a lock-in's mark carries the channel's estimated voice latency, not a measured one. A late winning buzz could run past LETTER BY LETTER's last tick, which was asked for at the planned buzz. |
| Game legibility and tension | 9.75 | Who buzzed is now seen, and who guessed what is heard on the wide as the desks light. Lamps on the lock-ins, the wrong ones out, the scores on the desks and the boards, the strip at half time, the stake on DOUBLE OR NOTHING, the final score, the table. The countdown's bar is unseen on HOW MANY?'s wide; its ticks are heard. The strip repeats the desks' scores and sits on the monitor's rail (other steps' files). TODAY's tally is shown only at the round's end. |
| Length and rhythm | 9.75 | The real editions run 293–335 s and every pause is the quiz's own. Three fixture editions are under the 290 s floor (271, 285 and 288 s): the writer's copy is short, and the director does not pad. The busiest minute holds 13 cuts (the welcome's introductions, or a LETTER BY LETTER round of buzzes) against an average of 5.5–8.4. Every length is the stub voice's: the real voices' rate is unmeasured. |
| Sound cues | 9.75 | A sting on every reveal, on the reveal. The drumroll lands on DOUBLE OR NOTHING's reveal. The ticks are on the grid, the bed moments on their segments, the sign-off's cue after its last word, and no laughter or applause anywhere (tested). Nobody has listened: the recordings were mute, and that is step 7's. On PICTURE THIS's DOUBLE OR NOTHING the drumroll plays over the countdown's last ticks. |
| Robustness and tests | 9.75 | 31 tests; the edition is refused without its pictures; three tries for each picture before air; the view switch only for drafts. If the viewer's browser cannot fetch a picture the station fetched minutes earlier, PICTURE THIS still shows its dark slot after its 3 s wait. Every timing is on the stub voice: the real voices' timings are step 7's to measure. |

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
