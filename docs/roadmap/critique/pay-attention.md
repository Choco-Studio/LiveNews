# PAY ATTENTION — on air (build step 7)

Step 7 of `docs/programmes/pay-attention.md` §9: **record two real editions with sound and critique the whole programme
on air above 9.7.** Steps 1–6 were built, and 3–6 passed their own critiques (graphics, director, set and sound, cast). This
log is the programme as a viewer meets it: the open to the end card, with the host's and the players' recorded voices,
the bed, the stings, the boards and the ticker, and what follows on the channel.

The panel: a senior quiz-show producer, a standards and legal editor, a senior broadcast director, a lead pixel artist, a
sound designer and a first-time viewer. Seven categories, each 0–10: editorial accuracy and standards, entertainment and
repertoire, game legibility and tension, format clarity and rhythm, picture, sound, data robustness. **The round's score is
its lowest category; above 9.7 passes.** The owner's pending choices (the host among A/B/C, leaving the drafts) are not
faults of the build; they are listed at the end.

## How the editions were made and recorded

- **The server under a chosen clock** (`tools/quiz/onair.mjs`, new, in the image of FULL TIME's `tools/sport/onair.mjs`).
  The real server runs with the whole process's clock frozen at the air time and running on from there:
  - PAY ATTENTION put on air after COSMOS and starting the channel (`DRAFTS_ON_AIR=pay-attention@cosmos`,
    `ROTATION_START`);
  - `QUIZ_VIEW=1` (`--view`), because the archive holds under the desk's three days;
  - Kokoro voices, the mock writer for the programmes after it, one episode made ahead, the first edition waiting for all
    its voices.

  The quiz desk plans the edition from `data/archive` (a copy of the station's real archive, 12–14 Oct, never written:
  the tool makes the archive read only, so nothing the server airs under its borrowed clock enters it) and the history
  and weekly table in `data/quiz`. The tool saves the edition once every voiced segment has its clip and puts it on air
  in the station's history, so a recording meets what follows it on the channel (the break, UP NEXT: WORLD WEATHER). The
  same server serves the clips, the pictures and the live ticker.
- **The moments.** The real archive allows few. Its first day (12 Oct) starts at 14:25 London; on 13 Oct the only real
  airings before 20:00 are the offline fixture's (the desk's `realEntry` leaves them out), and 14 Oct's afternoon had not
  happened yet. So no afternoon edition was possible on a real archive, and no TODAY OR NOT TODAY: its EARLIER needs a
  story last aired two days before, and on 13 Oct the archive is a day and a half old. The editions:
  - **E0, Monday 12 Oct, 22:00 London**, the week's first edition (history empty): Lola Byte v Sam Night, LETTER BY
    LETTER / PICTURE THIS / WHERE IN THE WORLD?, DOUBLE OR NOTHING on PICTURE THIS (technology or science);
  - **E1, Tuesday 13 Oct, 22:40 London**, made after E0 with E0 as its history (so its pairing and its round types follow
    the planner's rules from a real week): UNIT-8 v Penny Sterling in round 1 (WHERE / LETTER BY LETTER / HOW MANY?,
    DOUBLE OR NOTHING on PICTURE THIS); Paco Pixel v Penny Sterling from round 2, once the desk's new exclusions changed
    its pool (HOW MANY? / PICTURE THIS / LETTER BY LETTER, DOUBLE OR NOTHING on WHERE, a sudden-death tie-break).

  Every PICTURE THIS picture the plans asked for was fetchable (The Verge, TechCrunch, Ars Technica, BBC, ScienceDaily,
  The Guardian); no moment had to be dropped for a picture.
- **Recording**: `tools/record.mjs` at the channel's normal scale (384 × 216 × 5, 1920 × 1080, 30 fps) with sound,
  `--progressive`, the page's clock a minute or two after the edition was made (`--time`), so no credit shows a time
  still to come. A new `--trace` option writes the director's timeline into the report: every music cue and countdown the
  director asks for (with the ticks the bed scheduled), the pace trace (every cut with its board or framing) and the quiz
  director's own trace (the lines, the faces, the returns, the reveals).
- **Measured, not only looked at** (scripts in the session's scratchpad, `onair7/`): contact sheets at one frame a second,
  2x stills at each board, reveal and verdict; every cut against the clip under it (its level in the 30 ms before and at
  the cut, the word marks); shot lengths, the boards' share and the cut rate from the open to the end card; the report's
  caption sync per sentence; sound onsets per cue (stings, ticks, the drumroll, the bed moments); EBU R128 loudness of the
  mix and of the open; the bed under each voice (each clip fitted to the mix by least squares and taken out) and between
  voices; the director's step-7 checks with the real voices.

---

## Round 1 — the build as it stood

**Found before recording: the station voiced none of the quiz.** The voice service speaks only the segment types in
`server/voice/plan.js` `SPOKEN`, and `'quiz'` was not one: the first edition was saved with 0 of its 70 lines voiced
(they would have aired in the viewer's browser voice). Every quiz timing until now had been measured on a stub voice
(step 4) and no person had heard the host's voice in a programme (step 6).

**Recordings.** `r1/e0.mp4` and `r1/e1.mp4` (400 s each: the edition, its end card, the break).

| Measure | E0 (12 Oct 22:00, Lola v Sam) | E1 (13 Oct 22:40, UNIT-8 v Penny) |
|---|---|---|
| Programme, open to end card | 330.8 s | 320.8 s |
| Voices | 73 clips, 73 heard, 0 browser sentences | 66 of 66, 0 |
| Loudness (programme) | −15.7 LUFS, LRA 6.1 LU, true peak −4.8 dBTP; the open −18.0 LUFS | −15.6 LUFS, LRA 4.8 LU, −4.9 dBTP; open −18.0 |
| Voice over the music (median; lowest) | 22.3 dB; **15.3 dB** (DOUBLE OR NOTHING's reveal) | 23.4 dB; **13.1 dB** (the same) |
| Music between voices | −36.5 dBFS median (1 s windows), 10–90 % −38.3 to −33.4 | −36.2, −38.1 to −33.8 |
| Captions | every recorded sentence within 0…+33 ms of its voice | 0…+32 ms |
| Shots | 49 (23 studio); 8.9 cuts a minute; busiest minute 13; median 4.38 s; shortest 4.00 s; longest studio 9.9 s | 47 (22); 8.8; 13; 5.52 s; 4.00 s; 8.9 s |
| Boards' share; longest run of boards | 63.9 %; 30.5 s | 62.5 %; 29.7 s |
| Cuts inside a word | 3 ("TECH" +195 ms, "right" +286 ms, "picture" +450 ms) | 0 |
| Studio shots with 1.5 s or more of no voice | 8; longest **4.49 s** | 6; longest 3.05 s |
| Stings (right ×10, the roll) | onset +58…+68 ms after the reveal's frame | the same |
| Ticks | 56 scheduled, 46 with an onset (≥3 dB, high band) within −40…+80 ms; median +9 ms | 55, 41, +9 ms |
| The prompt's end to the first tick | +0.17, +0.76, +0.83, +0.60 s | +0.92 s |
| A lock-in's first word after its tick | +0.22…+0.81 s (the model's reaction), 48 ms ahead of the plan | +0.0…+0.65 s |
| The cut to a buzz, a guess or a last lock-in | 132 ms before the first word, every one | the same |
| The drumroll | 300.48–304.78 s: two ticks under it, started off the bed's beat, 1.6 s past the clock's end | 289.30–293.60: one tick, 2.2 s past |

Faults:

1. **The station voiced none of PAY ATTENTION's lines** (above). Sound designer, quiz producer.
2. **An execution asked as a game question**: E1's LETTER BY LETTER opened with "Emergency calls from botched Christa
   Pike execution released" (BBC News on WORLD NOW), bought by UNIT-8 for points and read back with its credit. The
   desk's lists had no execution, death row or death penalty, and the presenters had not read the story grave. Standards
   (the blocker).
3. **A state's policy and a dispute as a question**: "India delays digital payments fee rollout [amid retailer pushback]"
   (TechCrunch on TECH BYTES): a country acting on a fee, its retailers pushing back. The bible's politics include
   policy. Standards.
4. **A firm's hardship in HOW MANY?'s own sentence**: "After years of declining subscriber numbers and falling revenue,
   Bumble just agreed to a ▮▮▮▮▮▮ acquisition", and as WHERE's headline "LVMH sales miss growth forecasts as ▮▮▮▮▮ luxury
   demand slows". The bible keeps "a struggling club or firm" out. Standards.
5. **Tragedy scrolling under the game**: the LATEST ticker carried, during both editions, an execution, Tupac Shakur's
   murder, a fatal rollercoaster ride, a flight attendant killed in a Houthi attack, five people killed by a hurricane,
   a gang sexual assault and the Pope's cancer, under a quiz whose bible says the channel does not play games beside a
   tragedy. Standards, first-time viewer.
6. **"On my left, UNIT-8 … On my right, Penny"**: player A sits on screen left, which is the host's right. Director.
7. **Everyone spoke like UNIT-8**: the banks were written without contractions, so Kokoro read "Let us say C.", "I am
   going with C.", "That is right, Sam", "Sam, there is always next time", "Hello! Fair warning, I am competitive." Only
   UNIT-8's bible asks for that. Quiz producer, sound designer.
8. **The same exchange twice in one edition**: E0's PICTURE THIS question 3 and DOUBLE OR NOTHING both had "Let us say C."
   / "C. Final answer.": eight lock-ins drew on a bank of six. Quiz producer.
9. **"Halfway: UNIT-8 9 points"**: a score said straight after a name that ends in a number is one number to the ear.
   Sound designer, first-time viewer.
10. **Sam's stall "Blank."**, the word the host says for every hidden word ("factory in blank"). First-time viewer.
11. **WHERE's reveal read the headline twice**: "It's France. Level on that one: both right. Chinese carmaker BYD
    considers opening factory in France. From Euronews Business…" (11.1 s; the others 10.4, 8.8, 6.2, 5.6 s). The
    headline is whole on the board with its place gold. Quiz producer.
12. **Silent faces after an early last lock-in**: the wide after Sam's step-2 lock-in held 5.6 s, 4.5 s of it silent,
    and PICTURE THIS's picture took its last two steps off air (a play-along viewer lost the picture). Eight such shots in
    E0 (2.7–4.5 s silent), six in E1. Director, first-time viewer.
13. **A dead beat before the clock**: "Pick your letter." ended 0.83 s before the first tick, "Your time starts now."
    0.92 s; the prompt was said, then the countdown waited for the bed's next half note. Sound designer.
14. **DOUBLE OR NOTHING's drumroll**: started off the bed's beat over the last lock-in, one or two ticks inside it, and ran
    1.6–2.2 s past the clock's end; its undecked landing left the reveal's first words 13–15 dB over the music (every other
    line at least 17.6 dB). Sound designer.
15. **The open's plate cut a name**: "WITH QUINN QUERY, UNIT-8 & PENNY STERLI…". Pixel artist.
16. **Cuts inside words**: the reaction's tail cut landed 195 ms into "TECH", the verdict's wide 286 ms into "right". The
    word-safe cut followed the mouth's timeline, which runs at its own pace between the recording's word anchors and
    changes word inside a long one. Director.
17. **"On WORLD NOW this morning"** for a story aired at 00:40, said at 22:51. Standards.

Noted, not counted:

- The cut to a buzz, a guess or a last lock-in comes 132 ms (four frames) before the first word: the director subtracts
  the channel's estimated voice latency (0.18 s) where the recorded voice starts after 0.132 s. A cut on the breath before
  a line is common practice; the lock-ins' words land 48 ms ahead of the plan for the same reason.
- A lock-in's first word comes 0.2–0.8 s after its step's tick by design: the players' model reacts to the sharper
  picture.
- The stings' onsets sit +58…+68 ms after the reveal's frame (the bed engine's scheduling), inside the lip-sync tolerance
  for sound after picture.

| Category | Score | Worst fault |
|---|---|---|
| Editorial accuracy and standards | 6.0 | 2, 5, 3, 4 |
| Entertainment and repertoire | 8.0 | 7, 8 |
| Game legibility and tension | 8.4 | 12, 9 |
| Format clarity and rhythm | 8.6 | 11, 13, 6 |
| Picture | 8.8 | 12, 15 |
| Sound | 7.0 | 1, 14, 13 |
| Data robustness | 7.5 | 1, 2 (no test saw either) |

**Round score: 6.0.**

### Fixes

1. **The quiz is voiced** (`server/voice/plan.js` `SPOKEN`; `public/js/voice/speechtext.js`: a `quiz` prosody, a
   game's quick turns, the clip's tail 0.3 s and no lead; the melody of a chat).
2. **The death penalty is crime** (`server/quiz/desk.js` `EXCLUDED`: executions, death row, death penalty, death sentence,
   capital punishment, lethal injection, firing squad, electric chair, gallows, inmates; and harm takes "fatal").
3. **A country acting on a policy is its government** (`desk.js` `stateActs`: a country's name as a headline's subject
   before a policy verb, "delays", "bans", "to tax"…; "Japan launches a probe" stays news), and **"pushback" is a
   dispute** with the backlash.
4. **A firm's falling sales, revenue, users or demand, and results that miss, are hardship** (`desk.js`).
5. **No tragedy under the game** (`desk.js` `tickerGrave`, `server/station.js`, `public/js/graphics/index.js`): the
   station marks a ticker item grave by its words or its kind (harm, disaster, crime, conflict, illness), and the band
   leaves it out while PAY ATTENTION airs, as it leaves out the edition's own stories; the channel carries it again after
   the end card.
6. **The seats' sides** (`server/quiz/banks.js`): "On my right, {a}… On my left, {b}".
7. **The banks as people speak** (`banks.js`): the host's lines and the players' answers contracted; Lola, Max, Nova,
   Penny and Sam contracted in their own banks; Paco (dignified) and Ada (precise) keep theirs; UNIT-8 says the shared
   answers in full (`writer.js` `literal`).
8. **Twelve answers a bank** (lock-ins, places, numbers), so an edition's eight lock-ins never repeat; a lock-in never
   starts "A for me" (Kokoro reads a letter before a noun as the article).
9. **A comma between a name ending in a number and its score** (`writer.js` `scoreSafe`): "UNIT-8, 9 points".
10. **Sam's stall is "Lost it."**
11. **WHERE's reveal**: the place, the verdict, the credit when it is due; the headline is not read again.
12. **The host recaps the locks on the clock** (`banks.js` `HOST.recap`, `writer.js`, `quizplay.js`, `quizdirector.js`):
    after the last lock-in of PICTURE THIS and WHERE, "Two locks on A.", "Lola says the Philippines, Sam says France.",
    on the same wide, the wait filled with what the desks show. **The board comes back once the faces have held** their
    minimum and said their lines, so an early lock-in leaves the clock's end and the picture's last step on the board.
13. **The prompt ends on the first tick** (`quizdirector.js` `sayOnTick`): the countdown is asked for first, on the bed's
    next half note after the line's length, and PICTURE THIS's prompt and WHERE's pins wait for it.
14. **The clock covers the faces** (`quizdirector.js` `coverHalves`): a countdown long enough for the players' faces and
    the board's return, so the ticks run under the faces and the reveal lands on the clock's last beat; DOUBLE OR
    NOTHING's roll therefore starts on a tick and ends on the reveal, on the bed's grid. **The roll ducks under a voice**
    like the quiz's other stings (`public/js/music/proposals/lofi/stings.js`).
15. **Whole names on the plate** (`public/js/scenes/opens/kit.js` `creditNames`): when the full names do not fit, every
    name by its first word ("QUINN, UNIT-8 & PENNY"), an ellipsis only after that.
16. **Cuts on the recording's own words** (`public/js/audio.js` `recordedVoiceAt`, `public/js/director.js`
    `cutWhenClear`): a cut that must fall between two words waits for the recording's next word mark, not the mouth's
    timeline.
17. **"Overnight"** for a story aired before 05:00 the same day (`writer.js` `airedWhen`).

Tests: `test/voice-server.test.js`, `test/pay-attention-desk.test.js`, `test/pay-attention-writer.test.js` (a new
"heard on air" block), `test/pay-attention-wiring.test.js` (the ticker's tragedy, the prompt on the tick, the clock under
the faces, the recap), `test/opens.test.js`, `test/camera-polish.test.js`, `test/pay-attention-sound.test.js`,
`test/server.test.js` (the ticker item may carry `grave: true`).

---
## Round 2 — after round 1's fixes

**Recordings.** `r2/e0.mp4` (programme 317.2 s) and `r2/e1.mp4` (333.9 s): E1 is now Paco v Penny (the new exclusions
changed its pool), HOW MANY? / PICTURE THIS / LETTER BY LETTER, DOUBLE OR NOTHING on WHERE, a sudden-death tie-break.

| Measure | E0 | E1 |
|---|---|---|
| Voices | 79 of 79 heard, 0 browser sentences | 77 of 77, 0 |
| Loudness | −15.7 LUFS, LRA 5.0 LU, −4.8 dBTP; open −18.0 | −15.6, 4.6 LU, −5.0; −18.0 |
| Voice over the music (median; lowest) | 23.1 dB; 18.5 dB (a buzz); DOUBLE OR NOTHING's reveal 26.2 dB (was 15.3) | 23.0 dB; 19.5 dB; its reveal 21.5 dB (was 13.1) |
| Shots | 46 (21 studio); 8.7 a minute; busiest 13; median 4.70 s; longest studio 7.75 s | 48 (21); 8.6; 12; 5.21 s; 8.70 s |
| Boards' share; longest run | **67.2 %**; 33.6 s | **67.5 %**; 26.9 s |
| Silent studio shots (≥ 1.5 s) | 2; longest 1.60 s (was 4.49) | 1; 1.60 s |
| The prompt or the pins to the first tick | +0.21 s, all seven | +0.21 s, all four |
| The drumroll | on the clock's last four ticks, ending on its last beat and the reveal | the same, on WHERE |
| Captions | 0…+33 ms | −1…+33 ms |

Checked fixed on air: the edition voiced; the recaps on the wide ("Agreed, then: C.", "Lola says the Philippines, Sam
says France.") and no studio shot silent past 1.6 s; the prompt a beat before the first tick; the roll on the grid; "On my
right, Paco… On my left, Penny"; contractions; no line twice; no tragedy on the band (the LATEST items under the game were
a legal claim over Falklands oil, a White House briefing, student protesters, a lonely-hearts business in China).

Faults:

1. **Boards 67 % of the air**, above the 65 % the reviewer held the director to in step 4. The faces now gave way to the
   board as soon as they had said their lines, and WHERE's shorter reveal left no words for the verdict's wide. Director,
   quiz producer.
2. **Cuts still inside words**: "reported" (+272 ms), "BBC" (+192 ms). The word-safe cut fired at once whenever the mouth's
   timeline sat between its words, while the recording was still inside one. Director.
3. **"A near thing. Nobody has it."**: $150 and $250 against $200, equally close, scored nobody. Quiz producer,
   first-time viewer ("they were both 50 off").
4. **"We are level, so Lola picks."**: the writer's own line, not contracted; and a level game could have drawn "you're
   behind" from the bank. Quiz producer.

| Category | Score | Worst fault |
|---|---|---|
| Editorial accuracy and standards | 9.5 | (none on the plan; the ticker's politics under the game, kept: see round 4) |
| Entertainment and repertoire | 9.2 | 3, 4 |
| Game legibility and tension | 9.2 | 3 |
| Format clarity and rhythm | 9.3 | 1 |
| Picture | 9.3 | 1, 2 |
| Sound | 9.5 | 2 |
| Data robustness | 9.4 | 2 (no test held a cut to the recording) |

**Round score: 9.2.**

### Fixes

1. **The faces hold to the reveal's beat** (`quizdirector.js` `back`): the countdown's last ticks and the host's recap on
   the players, as before round 1; only when PICTURE THIS's picture still has a step to take after they came in does the
   board come back once they have held the minimum and said their lines.
2. **A recorded voice's cut is the recording's** (`audio.js` `recordedVoiceAt`, `director.js` `cutWhenClear`): at once in
   the clip's own silence (its loudness envelope), else on the next word mark, or after the last word as the voice falls
   silent; never the mouth's timeline.
3. **Equally close guesses are both the closest** (`server/quiz/players.js`): two points each, "Equally close: two points
   each." (`banks.js` `equallyClose`).
4. **"We're level"**, and a level DOUBLE OR NOTHING never draws a line for the player behind (`writer.js`).

## Round 3 — after round 2's fixes

**Recordings.** `r3/e0.mp4` (327.7 s), `r3/e1.mp4` (327.8 s).

| Measure | E0 | E1 |
|---|---|---|
| Boards' share; longest run | **65.7 %**; 31.5 s | 63.5 %; 27.5 s |
| Shots | 47 (21 studio); 8.6 a minute; median 4.77 s; longest studio 9.06 s | 46 (22); 8.4; 4.84 s; 9.26 s |
| Silent studio shots (≥ 1.5 s) | 6; longest 2.22 s (a buzzer's single holding its 4 s after a 2.4 s answer) | 3; 2.05 s |
| Voice over the music | median 23.1 dB, lowest 18.5 dB | 22.7 dB, 19.7 dB |
| Music between voices | −36.4 dBFS (10–90 % −39.0 to −33.3) | −36.8 (−39.3 to −34.7) |
| Loudness | −15.7 LUFS, LRA 5.0, −4.9 dBTP | −15.6, 4.8, −4.9 |
| Cuts inside a word | 0 | 1 (below) |

Faults:

1. **A board cut 0.56 s early, inside "How many?"**: HOW MANY?'s board was to land on "A barn owl…", where the host starts
   reading off it; the speech marks fired on the mouth's timeline, and the recording's question pause is longer than the
   timeline's. Director.
2. **Boards still 65.7 % in E0**: the three round cards alone hold 16–20 s of every edition (5 % of the air), a title and a
   rule on the dark ground while the host speaks. Director, quiz producer.

| Category | Score | Worst fault |
|---|---|---|
| Editorial accuracy and standards | 9.6 | (the ticker's politics; HOW MANY?'s "$149 HomePod mini" said as the answer) |
| Entertainment and repertoire | 9.6 | (the host's recaps are a bank of eight a kind) |
| Game legibility and tension | 9.6 | 2 |
| Format clarity and rhythm | 9.5 | 2 |
| Picture | 9.5 | 1, 2 |
| Sound | 9.7 | — |
| Data robustness | 9.5 | 1 (the marks' test ran on the browser voice only) |

**Round score: 9.5.**

### Fixes

1. **Speech marks fire on the recording's words** (`audio.js` `#pollMarks`): a mark is reached when the recording's first
   word at or after its character starts. Test: `test/audio-engine.test.js`.
2. **Every round opens on the host** (`quizdirector.js` `roundFace`): the round's card holds the network's minimum for its
   name, then the host's single takes the rest of the rule and the first question's frame up to where it reads off the
   board (LETTER BY LETTER's desk, a preamble, "Which story is this picture…"), when those words fill the single; the cut
   lands between two words. Test: "a round's card gives way to the host's single…".
3. **The recorder notes the ticker** (`tools/record.mjs`): every LATEST item on screen with its times, in the report, so
   the band under the game is checked item by item, not by eye.


## Round 4 — after round 3's fixes

**Recordings.** `r4/e0.mp4` (programme 317.2 s) and `r4/e1.mp4` (319.4 s). The writer and the players are seeded by the
moment the plan is made, so each round's remake has the same questions with fresh lines and play.

| Measure | E0 | E1 |
|---|---|---|
| Voices | 80 of 80 heard, 0 browser sentences | 72 of 72, 0 |
| Shots | 45 (20 studio); 8.5 a minute; busiest 12; median 4.88 s; longest studio 8.57 s | 45 (21); 8.5; 12; 5.32 s; 8.12 s |
| Boards' share; longest run | **67.2 %**; 29.2 s | 63.8 %; 30.1 s |
| The round's card giving way to the host | 0 of 3 rounds | 1 of 3 (LETTER BY LETTER) |
| Cuts inside a word | 0 | 0 |
| The cut to a buzz | **+856 ms** into the answer | **+681 ms** |
| The cut to a guess or a last lock-in | 132 ms before the first word, all seven | all six |
| Silent studio shots (≥ 1.5 s) | 3; longest 2.34 s (the late buzz's single) | 3; 2.22 s (the wide after a short recap, the clock ticking) |
| The prompt or the pins to the first tick | +0.21 s, all seven | all four |
| The drumroll | PICTURE THIS's last four ticks, ending on the reveal | WHERE's, the same |
| Captions | 0…+32 ms | 0…+33 ms |
| Loudness | −15.7 LUFS, LRA 4.9 LU, −4.9 dBTP; open −18.0 | −15.6, 4.8, −4.9; −18.0 |
| Voice over the music (median; lowest) | 23.4 dB; 18.9 dB | 22.6 dB; 18.6 dB |
| Music between voices | −37.0 dBFS (10–90 % −39.0 to −34.9) | −36.4 (−38.8 to −34.7) |
| The ticker under the game | 4 LATEST items; none an edition story, none grave | 7; none |

Faults:

1. **A buzz's cut inside the answer.** E0: "Scientists find | vanilla's hidden healing potential", 0.86 s in. E1: "Apple's
   smart | home lineup…", 0.69 s in. Each buzzer's single then stood 2.3 and 2.1 s silent before the board came back.
   Both buzzes came 3.4–3.5 s after their board's cut, before its 4 s minimum, and step 4's fallback then cut between the
   answer's words. The analysis printed the same in round 3 (+0.53, +0.63, +0.81 s): the panel counted the silent single
   there and missed its cause. Director (the step-7 check), first-time viewer ("I missed the start of her answer").
2. **The round's card gave way to the host in one round of six**, and E0's boards were 67.2 %. The round lines run
   4.4–5.7 s, so 0.4–1.7 s are left once the card has held 4 s. PICTURE THIS's frame was counted only up to "picture",
   although nothing in it is read off the board. Director, quiz producer.

| Category | Score | Worst fault |
|---|---|---|
| Editorial accuracy and standards | 9.6 | (as round 3) |
| Entertainment and repertoire | 9.6 | (as round 3) |
| Game legibility and tension | 9.5 | 1 (the answer starts on the board, the face after) |
| Format clarity and rhythm | 9.5 | 2 |
| Picture | 9.4 | 1, 2 |
| Sound | 9.7 | — |
| Data robustness | 9.4 | 1 (the faces test let a buzz's cut fall between its words) |

**Round score: 9.4**, below round 3's: a fault round 3 missed.

### Fixes

1. **A buzz is answered on the buzzer's single** (`quizdirector.js` `cutFor`, `answers`, `BUZZ_HOLD`). When the board has
   not yet held its minimum, the buzz still lands on its beat: the lamp lights, the board's clock stops and the ticks end.
   The answer is then said on the cut to the single, at most a second later. That stays inside the buzz's stage, because
   the next stage is three half notes on. A board younger than that keeps the buzz; the question has its face elsewhere
   (its frame, the reveal's tail, a reaction). The board's buzz records both times (`at`, `heard`). Test: the faces test
   now holds every buzz's cut to its first word and counts the held buzzes; the board times test checks `heard`.
2. **PICTURE THIS's whole frame rides the round's single** (`roundFace`), as LETTER BY LETTER's does. The picture lands
   on a word the single has reached, or as the frame ends. After a reaction, its frame rides the wide with the reaction
   when it reads nothing off the board before a word (`playLine`).
