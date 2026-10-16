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
  happened yet. So until 14 Oct's afternoon no afternoon edition was possible on a real archive, and no TODAY OR NOT
  TODAY: its EARLIER needs a story last aired two days before, and on 13 Oct the archive is a day and a half old. The
  editions:
  - **E0, Monday 12 Oct, 22:00 London**, the week's first edition (history empty): Lola Byte v Sam Night, LETTER BY
    LETTER / PICTURE THIS / WHERE IN THE WORLD?, DOUBLE OR NOTHING on PICTURE THIS (technology or science);
  - **E1, Tuesday 13 Oct, 22:40 London**, made after E0 with E0 as its history (so its pairing and its round types follow
    the planner's rules from a real week): UNIT-8 v Penny Sterling in round 1 (WHERE / LETTER BY LETTER / HOW MANY?,
    DOUBLE OR NOTHING on PICTURE THIS); Paco Pixel v Penny Sterling from round 2, once the desk's new exclusions changed
    its pool (HOW MANY? / PICTURE THIS / LETTER BY LETTER, DOUBLE OR NOTHING on WHERE, a sudden-death tie-break);
  - **E2, Wednesday 14 Oct, 15:20 London** (the final round only), the afternoon edition, made from the archive copied
    afresh at 15:42 London with E0 and E1 as its history: Ada Volt v UNIT-8, LETTER BY LETTER / PICTURE THIS / WHERE IN
    THE WORLD?, DOUBLE OR NOTHING on TODAY OR NOT TODAY (three headlines: two from that day, one from Monday). At
    14:00 London, from the archive as it stood then, the planner filled no TODAY OR NOT TODAY for that pairing (its DOUBLE
    OR NOTHING was HOW MANY?); at 15:20 the afternoon's airings were enough.

  Every PICTURE THIS picture the plans asked for was fetchable when the edition was made (The Verge, TechCrunch, Ars
  Technica, BBC, ScienceDaily, The Guardian), so no moment had to be dropped for a picture. E1's pictures still did not
  reach the screen until round 6 (round 5, fault 1).
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

## Round 5 — after round 4's fixes

**Recordings.** `r5/e0.mp4` (programme 307.5 s) and `r5/e1.mp4` (328.1 s).

| Measure | E0 | E1 |
|---|---|---|
| Voices | 78 of 78 heard, 0 browser sentences | 71 of 71, 0 |
| Shots | 44 (20 studio); 8.6 a minute; busiest 11; median 4.77 s; longest studio 8.67 s | 45 (21); 8.2; 11; 5.37 s; 7.70 s |
| Boards' share; longest run | **67.7 %**; 35.9 s | **65.7 %**; 29.5 s |
| What the boards carry (share of the air) | the host reading the board's text 44.8 %; the clock under the picture's steps, the tiles and the pins 10.7 %; the players' lines 5.1 %; the host's other lines 1.5 %; nothing said 5.6 % | 44.7 %; 12.7 %; 2.9 %; 1.0 %; 4.3 % |
| The round's card giving way to the host | 1 of 3 (PICTURE THIS) | 0 of 3 |
| The cut to a buzz, a guess, a last lock-in | 132 ms before the first word, all nine; one buzz stays on its 3 s old board | all eight; one buzz on its 1.5 s old board |
| Cuts inside a word | 0 | 0 |
| Silent studio shots (≥ 1.5 s) | 6; longest 2.09 s (a verdict's wide before the next board) | 3; 1.98 s (the wide after a recap, the clock ticking) |
| The prompt or the pins to the first tick | +0.21 s, all seven | all four |
| The drumroll | PICTURE THIS's last four ticks, ending on the reveal | WHERE's, the same |
| Captions | 0…+33 ms | 0…+33 ms |
| Loudness | −15.7 LUFS, LRA 4.7 LU, −4.9 dBTP; open −18.0 | −15.6, 5.0, −4.8; −18.0 |
| Voice over the music (median; lowest) | 23.1 dB; 18.3 dB | 23.3 dB; 21.0 dB |
| Music between voices | −36.6 dBFS (10–90 % −39.6 to −33.4) | −36.2 (−38.4 to −35.2) |
| The ticker under the game | 3 items; none an edition story, none grave | 8; none |

Faults:

1. **PICTURE THIS without its picture.** In E1, all three questions aired with an empty frame. The viewer was asked
   "Which story did this picture come with?", the options were read, the clock ran and the reveal came, and the slate
   box stayed dark throughout. `/api/img` served a picture only for a story still on the news desk. The producer had
   fetched each picture when it made the edition, but E1's stories had left the desk by air. On the real channel that
   happens to any question about a story aired hours or days before. Every round from 2 on had it: a still of every
   PICTURE THIS reveal in rounds 1–5 shows E0's pictures and none of E1's since round 2. The panel missed it in rounds
   2–4, where the dark box read as a dark picture on the 1x sheets, so those rounds' game and picture scores were too
   high. Pixel artist, first-time viewer ("there is no picture"), quiz producer.
2. **A verdict's wide stood 2.1 s silent before the next board** (E0, WHERE): the wide was too young for the board when
   the next frame came, so the frame waited for the board's cut at the wide's minimum, and the wide stood silent until
   then. Director.
3. **"The answer: $149 HomePod mini"** (E1, HOW MANY?): the figure was said with the product it bought, as if that were
   its unit. Standards, first-time viewer.
4. **The rule and the frame presented the same sentence**: "HOW MANY? for round one. Here's the sentence as it aired,
   with the number covered up." and then "The sentence, with the figure hidden: …". Quiz producer.
5. **"Overpriced answer."** from Penny after a LETTER BY LETTER that nobody buzzed: she had given no answer. Quiz
   producer, first-time viewer.
6. **Boards 67.7 % and 65.7 %**, above the step-4 reviewer's 65 %. That figure was measured on the stub voice
   (58–64 %). Split by what is heard under the boards, 45 % of the air is the host reading the board's own text (the
   bible's reading rule: the options stay up from their reading to the last lock-in). Another 11–13 % is the clock
   running under the picture's steps, the tiles and the pins. Only 4–6 % is a board with nothing said. E0 is the
   archive's fallback edition: DOUBLE OR NOTHING could fill no type not played that night, so it is a fourth PICTURE
   THIS. The desk would not make that edition without `QUIZ_VIEW`, because the archive is under its three days.
   Director.

| Category | Score | Worst fault |
|---|---|---|
| Editorial accuracy and standards | 9.5 | 3 |
| Entertainment and repertoire | 9.5 | 4, 5 |
| Game legibility and tension | 6.5 | 1 (a round no viewer could play) |
| Format clarity and rhythm | 9.5 | 2, 4 |
| Picture | 6.5 | 1, 6 |
| Sound | 9.7 | — |
| Data robustness | 6.5 | 1 (no test served a picture whose story had left the desk) |

**Round score: 6.5.**

### Fixes

1. **The station keeps PAY ATTENTION's pictures as it fetched them** (`server/producer.js` `quizPictures`,
   `quizPicture`; `server/index.js` `serveImage`). The producer keeps each picture it fetched for an edition (the last
   16), and `/api/img` serves those before the news desk's. A story days old airs with its picture, from the bytes that
   were checked when the edition was made. Test: the pictures-or-no-edition test now also requires every fetched
   picture to be kept for `/api/img`.
2. **A beat, then the frame on the face** (`quizdirector.js` `playQuestion`). When the face on air is too young for the
   board, the frame waits the beat that lets the face carry it to its end (LETTER BY LETTER, PICTURE THIS) or to its
   mark (WHERE, HOW MANY?), and the board comes on the mark. The silence is shorter by the frame's words on the face,
   and there are no extra cuts. Test: "a face too young for the board carries the next frame after a beat…".
3. **A sum of money takes only its rate** (`writer.js` `figureSaid`): "$200 per month", "$149", "$1.3 billion".
4. **HOW MANY?'s rule** is "Guess the number we covered up."; no round's rule says "Here's" (test).
5. **A miss is regretted only by a player who answered** (`writer.js`): no reaction when nobody buzzed (test).
6. The boards' share: no change beyond 2. The panel keeps it as what holds the picture from 10.

## Round 6 — after round 5's fixes

**Recordings.** `r6/e0.mp4` (programme 311.0 s) and `r6/e1.mp4` (320.0 s).

| Measure | E0 | E1 |
|---|---|---|
| Voices | 78 of 78 heard, 0 browser sentences | 71 of 71, 0 |
| PICTURE THIS pictures on screen | 4 of 4 | **3 of 3** (none in rounds 2–5) |
| Shots | 43 (19 studio); 8.3 a minute; busiest 11; median 4.75 s; longest studio 10.05 s | 46 (21); 8.6; 12; 5.03 s; 8.45 s |
| Boards' share; longest run | **68.2 %**; 32.7 s | 63.9 %; 30.4 s |
| What the boards carry (share of the air) | the host reading the board's text 44.7 %; the clock 10.5 %; the players' lines 5.5 %; the host's other lines 1.5 %; nothing said 6.0 % | 44.2 %; 11.6 %; 2.9 %; 1.0 %; 4.2 % |
| Buzzes on the buzzer's single | 1 of 3, on its first word; 2 kept on their boards | 2 of 3 (one held 0.5 s for the board's minimum), on their first words; 1 kept |
| The cut to a guess or a last lock-in | 132 ms before the first word, all seven | all seven |
| Cuts inside a word | 0 | 0 |
| Silent studio shots (≥ 1.5 s) | 3; longest 2.19 s (the wide under DOUBLE OR NOTHING's last ticks) | 3; 2.26 s (the wide after the final score) |
| The prompt or the pins to the first tick | +0.21 s, all seven | all four |
| The drumroll | PICTURE THIS's last four ticks, ending on the reveal | WHERE's, the same |
| Captions | +1…+33 ms | 0…+33 ms |
| Loudness | −15.7 LUFS, LRA 4.5 LU, −4.9 dBTP; open −18.1 | −15.6, 5.1, −4.9; −18.0 |
| Voice over the music (median; lowest) | 23.4 dB; 17.9 dB (a lock-in on WHERE's clock) | 23.0 dB; 20.1 dB |
| Music between voices | −36.5 dBFS (10–90 % −38.9 to −32.0) | −36.7 (−39.1 to −33.9) |
| The ticker under the game | 4 items; none an edition story, none grave | 8; none |

Checked fixed on air: every picture on its board, 1x and 2x (the Facebook settings screen, the Shopify phone, Niobia's
battery); "The answer: $149, as reported…"; "HOW MANY? for round one. Guess the number we covered up." then "Here it
is: …"; no reaction after a headline nobody buzzed.

Faults:

1. **A round's card stood 2.2 s silent** (E0, PICTURE THIS). The last LETTER BY LETTER question had no face: its buzz
   came 3.05 s into its board, 0.07 s past the second the director would hold an answer for the buzzer's single. So
   the wide was owed after its reveal. The wide's minimum then held back the round's card, which came in on "picture."
   inside the rule and held its own 4 s after the words. Director.
2. **The winner's reply stayed on the final score card** (E1): "That's a strong close." on the card, the loser's "Back to
   reading the news, then." on the wide, then the wide stood 2.3 s silent. The card's minimum was 1.64 s away when the
   reply was due, 0.04 s past the 1.6 s a reply waits for its cut. Director, quiz producer ("the winner is the shot").
3. **E0's boards 68.2 %**, the fallback edition (round 5, fault 6). Director.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy and standards | 9.7 | the ticker carries hard politics under the game (Pakistan's emergency rule, a White House briefing): allowed, as no tragedy is, but a lighter band would sit better beside a game |
| Entertainment and repertoire | 9.7 | a bank of eight recaps a kind; a round of three both-right answers in E0's WHERE has no tension (the players' model) |
| Game legibility and tension | 9.6 | 1 (a buzz with no face) |
| Format clarity and rhythm | 9.6 | 1, 2 |
| Picture | 9.6 | 3, 1 |
| Sound | 9.7 | a reply's beat on a card |
| Data robustness | 9.6 | 1, 2 (each a cliff of a few hundredths of a second, which the stub voice's fixtures never reached) |

**Round score: 9.6.**

### Fixes

1. **A buzz is held up to 1.2 s for the buzzer's single** (`BUZZ_HOLD`, was 1.0 s). That is still inside the buzz's
   stage, since the next is three half notes (3.2 s) on. Test: a held buzz is answered before its stage ends.
2. **A reply after a card waits up to 1.8 s for its cut** (`CARD_WAIT`, was 1.6 s): a beat on the final score, then the
   winner on a face. Test: "the winner's reply to the final score is on a face…".

## Round 7 — after round 6's fixes

**Recordings.** `r7/e0.mp4` (programme 335.7 s: level at 19–19, a sudden-death LETTER BY LETTER, Lola on the
tie-break) and `r7/e1.mp4` (323.1 s).

| Measure | E0 | E1 |
|---|---|---|
| Voices | 83 of 83 heard, 0 browser sentences | 71 of 71, 0 |
| PICTURE THIS pictures on screen | 4 of 4 | 3 of 3 |
| Shots | 52 (23 studio); 9.3 a minute; busiest 13; median 4.34 s; longest studio 8.47 s | 49 (23); 9.1; 14; 4.72 s; 9.08 s |
| Boards' share; longest run | 65.5 %; 26.5 s | 62.3 %; 29.0 s |
| What the boards carry (share of the air) | the host reading the board's text 42.0 %; the clock 12.8 %; the players' lines 2.8 %; the host's other lines 2.2 %; nothing said 5.9 % | 43.4 %; 10.7 %; 2.1 %; 1.0 %; 5.2 % |
| The round's card giving way to the host | PICTURE THIS | PICTURE THIS |
| Buzzes on the buzzer's single | 4 of 4 (the tie-break's too), two held 0.5–0.6 s for the board's minimum, all on their first words | 3 of 3, two held |
| The cut to a guess or a last lock-in | 132 ms before the first word, all seven | all seven |
| Cuts inside a word | 0 | 0 |
| Silent studio shots (≥ 1.5 s) | 2; 1.61 s (the final reactions' wide; the sign-off's hold) | 3; 2.11 s (the wide after a short recap, the clock ticking) |
| The prompt or the pins to the first tick | +0.21 s, all seven | all four |
| The drumroll | PICTURE THIS's last four ticks, ending on the reveal | WHERE's, the same |
| Captions | +1…+33 ms | 0…+33 ms |
| Loudness | −15.7 LUFS, LRA 4.9 LU, −4.7 dBTP; open −18.0 | −15.6, 5.1, −5.1; −18.1 |
| Voice over the music (median; lowest) | 23.4 dB; 18.7 dB | 24.2 dB; 19.7 dB |
| Music between voices | −36.5 dBFS (10–90 % −38.3 to −32.8) | −36.5 (−38.9 to −33.8) |
| The ticker under the game | 4 items; none an edition story, none grave | 7; none |

Fault:

1. **A reveal's cut to a face fell inside a phrase**: "From Euronews | Business, on MONEY MINUTE", "It's C. Points for both
   of | you.", "This evening, from | TechCrunch.". The cut was word-safe but went to the first gap between words after
   its planned moment, without regard to the sense. Director.

E0's boards (65.5 %) carry a tie-break's two boards; E1's are 62.3 %.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy and standards | 9.7 | the ticker's hard politics under the game (allowed) |
| Entertainment and repertoire | 9.7 | the recap bank; a round where both are right three times |
| Game legibility and tension | 9.7 | the wide after a short recap stands 2 s with only the clock |
| Format clarity and rhythm | 9.7 | 1 |
| Picture | 9.6 | 1; E0's boards at 65.5 % |
| Sound | 9.7 | — |
| Data robustness | 9.7 | no afternoon edition, no TODAY OR NOT TODAY on the real archive yet |

**Round score: 9.6.**

### Fixes

1. **A reveal's cut lands on a phrase's first word when one is within reach** (`quizdirector.js` `phraseStarts`,
   `sayReveal`). That means up to 0.6 s before or 0.8 s after the planned moment, inside the cut's own window: never
   before the board has shown the reveal, never too late for the face it opens. The phrase starts come from the
   recording's word marks. Test: "a reveal's cut to a face lands on a phrase's first word whenever one is within reach".

## Round 8 — after round 7's fix

**Recordings.** `r8/e0.mp4` (programme 318.4 s) and `r8/e1.mp4` (320.1 s).

| Measure | E0 | E1 |
|---|---|---|
| Voices | 79 of 79 heard, 0 browser sentences | 71 of 71, 0 |
| PICTURE THIS pictures on screen | 4 of 4 | 3 of 3 |
| Shots | 45 (21 studio); 8.5 a minute; busiest 12; median 4.86 s; longest studio 9.85 s | 47 (22); 8.8; 12; 4.91 s; 7.86 s |
| Boards' share; longest run | 65.4 %; 26.9 s | 64.2 %; 26.4 s |
| What the boards carry (share of the air) | the host reading the board's text 43.8 %; the clock 10.5 %; the players' lines 4.2 %; the host's other lines 1.6 %; nothing said 5.5 % | 45.3 %; 10.0 %; 2.6 %; 1.2 %; 5.2 % |
| Buzzes on the buzzer's single | 1 of 3, on its first word (2 on boards under 3 s old) | 2 of 3 |
| The cut to a guess or a last lock-in | 132 ms before the first word, all seven | all seven |
| A reveal's cut to a face on a phrase's first word | aimed at one for 2 of 4 cuts; both landed a word later | 3 of 6; all a word later |
| Silent studio shots (≥ 1.5 s) | 3; 2.39 s (Sam's single after his pick, before "Watch it sharpen", which needs its board from the first word) | 3; 1.93 s |
| Loudness | −15.7 LUFS, LRA 4.7 LU, −4.8 dBTP; open −18.0 | −15.6, 4.6, −5.1; −18.1 |
| Voice over the music (median; lowest) | 22.6 dB; 18.5 dB | 22.5 dB; 19.5 dB |
| Music between voices | −36.6 dBFS (10–90 % −39.4 to −32.6) | −36.4 (−39.3 to −34.7) |
| The ticker under the game | 4 items; none an edition story, none grave | 7; none |

The prompts (+0.21 s), the drumroll, the captions (0…+33 ms) and the length bound held as in round 7.

Fault:

1. **The phrase cut came on the phrase word's own first sound, then moved one word on**: "Spot | on, Paco: three
   points.", "From The Verge, on | TECH BYTES". The director timed the cut 0.05 s before the word's first sound,
   counting the channel's voice latency (0.18 s). The recording starts 0.132 s after the line is asked for, so the cut
   came on the word itself. The word-safe cut then found the voice loud and waited for the next word. Director. The
   trace kept the cut's window in the director's clock, which the recorder's report could not place.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy and standards | 9.7 | the ticker's hard politics under the game (allowed) |
| Entertainment and repertoire | 9.7 | the recap bank |
| Game legibility and tension | 9.7 | a pick's single 2.4 s silent before a board |
| Format clarity and rhythm | 9.7 | 1 |
| Picture | 9.6 | 1 |
| Sound | 9.7 | — |
| Data robustness | 9.6 | 1 (the fixtures' stub voice has no latency error) |

**Round score: 9.6.**

### Fixes

1. **The phrase cut leads the word by 0.12 s** (`PHRASE_LEAD`), which allows for the recording starting up to 0.05 s
   sooner than planned. The cut lands in the pause before the word, or on its first sound when there is no pause. The
   trace keeps the window as offsets from the cut, so the report places it.

## Round 9 — after round 8's fix

**Recordings.** `r9/e0.mp4` (programme 315.3 s; Sam 19, Lola 8) and `r9/e1.mp4` (334.0 s; two LETTER BY LETTER
headlines nobody named).

| Measure | E0 | E1 |
|---|---|---|
| Voices | 79 of 79 heard, 0 browser sentences | 69 of 69, 0 |
| Facts said or shown, against the plan and the archive | 35 checked (every question, option, buzz, reveal and credit), 0 wrong | 30, 0 |
| PICTURE THIS pictures on screen | 4 of 4 | 3 of 3 |
| Shots | 44 (19 studio); 8.4 a minute; busiest 12; median 4.72 s; longest studio 7.85 s | 46 (22); 8.3; 11; 4.85 s; 8.96 s |
| Boards' share; longest run | **69.1 %**; 31.6 s | **65.1 %**; 31.9 s |
| What the boards carry (share of the air) | the host reading the board's text 44.8 %; the clock 11.9 %; the players' lines 4.3 %; the host's other lines 1.3 %; nothing said 6.6 % | 43.2 %; 14.1 % (two clocks run out); 2.2 %; 1.0 %; 4.5 % |
| A reveal's cut to a face on a phrase's first word | 2 of 4 ("From The Verge, \| on", "From Euronews Business, \| on"); the other two had none within reach (one by 0.01 s) | 3 of 5 ("\| Spot on, Paco", "\| Nearest guess", "\| From BBC Science"); two had none within reach |
| Buzzes on the buzzer's single; guesses and last lock-ins | 2 of 3, and all seven, on their first words | 1 of 1, and all seven |
| Cuts inside a word | 0 | 0 |
| Silent studio shots (≥ 1.5 s) | 3; 2.23 s (the wide after a short recap, the clock ticking) | 3; 1.89 s |
| The prompt or the pins to the first tick | +0.21 s, all seven | all four |
| The drumroll | PICTURE THIS's last four ticks, ending on the reveal | WHERE's, the same |
| Captions | 0…+32 ms | −1…+33 ms |
| Loudness | −15.7 LUFS, LRA 5.2 LU, −4.7 dBTP; open −18.0 | −15.6, 5.7, −4.8; −18.0 |
| Voice over the music (median; lowest) | 22.5 dB; 19.3 dB | 23.4 dB; 20.0 dB |
| Music between voices | −36.1 dBFS (10–90 % −38.6 to −33.0) | −36.2 (−38.1 to −35.3) |
| The ticker under the game | 4 items; none an edition story, none grave | 6; none |

No new fault was found in this round. The panel took the boards' share up again, now that six rounds of the same two
editions are measured with the recorded voices:

| Round | E0 (the fallback: four PICTURE THIS) | E1 |
|---|---|---|
| 4 | 67.2 % | 63.8 % |
| 5 | 67.7 % | 65.7 % |
| 6 | 68.2 % | 63.9 % |
| 7 | 65.5 % (a tie-break) | 62.3 % |
| 8 | 65.4 % | 64.2 % |
| 9 | 69.1 % (a one-sided game: fewer reactions) | 65.1 % (two clocks run out) |

**What the boards carry.** In every round:

- the host reading the board's own text is 42–45 % of the air: the options, the headlines, the sentences, the pins and
  the rules. This is the bible's reading rule (§4: the options stay up from their reading to the last lock-in) at the
  recorded voices' pace;
- the game's clock running under the picture's steps, the tiles and the pins is 10–14 %;
- the players' lines on a board are 2–5 %;
- a board with nothing said is 4–7 % (the pauses before the options and the pins, and a reveal's hold).

Every question has a face, and the runs of boards stay under 36 s. The step-4 reviewer's 65 % was measured on the stub
voice, which read faster than the recorded voices. The bound is not met on these editions: E0 is over it in every
round, and E1 in two rounds of six. The panel did not drop it. It is left open for the reviewer, and the remaining
levers that keep the reading rule were looked for: the board's 4–7 % with nothing said, and any text read twice (round
10).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy and standards | 9.8 | the ticker's hard politics under the game (allowed by the bible, no tragedy) |
| Entertainment and repertoire | 9.7 | an afternoon edition and TODAY OR NOT TODAY not yet heard |
| Game legibility and tension | 9.8 | a clock that runs out with nobody buzzing is 9.6 s of tiles and ticks |
| Format clarity and rhythm | 9.8 | the boards' share |
| Picture | 9.6 | the boards' share over the reviewer's 65 % (69.1 % and 65.1 %: open); a reveal's cut lands between words when no phrase start is within reach |
| Sound | 9.8 | the wide under a clock's last ticks after a short recap |
| Data robustness | 9.7 | no afternoon edition and no TODAY OR NOT TODAY on the real archive yet |

**Round score: 9.6** (the boards' share). Besides that, every edition so far is an evening, and the bible's step 7 asks for an afternoon and
an evening. The archive allowed no afternoon until 14 Oct's afternoon had aired.

## Round 10 — the boards' time with nothing said, and the words read twice

Round 9 left the boards' share open (the reviewer's 65 %). Two levers keep the bible's reading rule. One is the 4–7 % of
the air the boards stand with nothing said. The other is text read twice. Split by what comes before and after it
(rounds 8–9, both editions), the boards' silence is:

- **options → the prompt** (PICTURE THIS): 1.1–1.4 s each, the largest. That is a turn's pause (0.45 s), then the
  countdown asked for, then the bed's wait for its next half note (0–1.07 s) on top;
- **headline → pins** (WHERE): 0.9–1.5 s each, for the same reason;
- **a reveal → the next card or frame**: 0.7–1.9 s, the board's own 4 s and the reveal's hold;
- **the round's card → the frame**: 0.5 s, the card's 4 s against a shorter rule;
- **frame → options**: 0.4 s, a turn's pause.

Read twice: WHERE's frames "Here's the headline: … Where is this story?" and "… Where in the world?", where the pins
then ask "Is it Chile, Singapore or Greece?"; HOW MANY?'s "The sentence, with the figure hidden: …" over a board titled
FILL IN THE NUMBER. Found with them, a repertoire fault: DOUBLE OR NOTHING offered again a wrong option the rounds had
shown (E0: "NASA spots patch of Moon-like rock on Earth" in PICTURE THIS and in DOUBLE OR NOTHING). The planner allowed
it, because only one of the offers airs. Quiz producer.

Changes:

1. **The line on the first tick follows its options or headline by 0.2 s and the bed's wait, with no turn's pause on
   top** (`TICK_GAP`; `playQuestion`, PICTURE THIS and WHERE). Test: "the line said on the first tick follows the options
   or the headline by its gap and the bed's half-note wait…".
2. **Nothing read twice** (`banks.js`): WHERE's six frames end on the headline (the pins ask the question), and HOW
   MANY?'s frames never describe the board. Test: "nothing read twice…".
3. **DOUBLE OR NOTHING never offers a wrong option the rounds showed** when the pool allows (`planner.js`). Test.

**Recordings.** `r10/e0.mp4` (337.8 s; two LETTER BY LETTER headlines nobody named) and `r10/e1.mp4` (327.4 s).

| Measure | E0 | E1 |
|---|---|---|
| Boards' share; longest run | **68.4 %**; 27.7 s | 64.1 %; 30.8 s |
| What the boards carry | the host reading 42.6 %; the clock 14.2 % (two clocks run out); the players 4.7 %; the host's other lines 1.4 %; nothing said 5.5 % | 42.4 %; 13.5 %; 3.1 %; 1.1 %; 4.1 % |
| Options → the prompt | 0.90 s on average, four (1.15 s before) | 0.87 s, three |
| Headline → pins | 0.78 s on average, three (0.9–1.5 s before) | — |
| Facts against the plan and the archive | 33, 0 wrong | 31, 0 wrong |
| Shots | 43 (20 studio); 7.6 a minute; busiest 10; median 4.87 s | 46 (22); 8.4; 12; 4.80 s |
| Silent studio shots (≥ 1.5 s) | 5; 2.07 s | 1; 1.60 s (the sign-off's hold) |
| Loudness | −15.7 LUFS, LRA 5.5 LU, −4.9 dBTP; open −18.0 | −15.6, 5.6, −4.8; −18.0 |
| Voice over the music (median; lowest) | 22.6 dB; 19.2 dB | 23.9 dB; 20.0 dB |

The prompts (+0.21 s before the first tick), the drumroll, the captions (0…+33 ms) and the length bound held. The
cuts to answers came 132 ms before their first words, and no cut fell inside a word.

The two changes take about 0.3 s off each line on the tick and up to 1.5 s off a question that would have read its board
twice. That is 2–3 s an edition, about a point of the share. The share still moves more with the play: E0 ran 68.4 %
with two clocks run out, 14.2 % of its air.

Fault:

1. **A round's card stood 2.2 s silent again** (E0, PICTURE THIS). The last LETTER BY LETTER question had no face. Its
   reaction-led frame missed the wide's minimum by 0.3 s, so the reaction stayed on the board. Its only player line
   was a stall, which stays on the board. Its owed wide then pushed the round's card into the rule, as in round 6.
   Director.

### Fixes

1. **A reaction a little short of the wide's minimum still carries LETTER BY LETTER's or PICTURE THIS's frame**
   (`KEEP_BEAT` 0.4 s), the frame waiting the beat before its first word (`playQuestion`'s beat now applies to a link
   too). Test: "a round's card never stands silent past its rule by more than 1.5 s".

## Round 11 — after round 10's changes

**Recordings.** `r11/e0.mp4` (310.4 s; Lola 19, Sam 18) and `r11/e1.mp4` (315.0 s; Paco 16, Penny 15).

| Measure | E0 | E1 |
|---|---|---|
| Voices | 78 of 78 heard, 0 browser sentences | 72 of 72, 0 |
| Facts against the plan and the archive | 35, 0 wrong | 32, 0 wrong |
| PICTURE THIS pictures on screen | 4 of 4 | 3 of 3 |
| Shots | 44 (20 studio); 8.5 a minute; busiest 11; median 4.79 s; longest studio 7.09 s | 45 (22); 8.6; 11; 5.45 s; 8.13 s |
| Boards' share; longest run | **67.6 %**; 31.4 s | 62.3 %; 32.4 s |
| What the boards carry | the host reading 45.5 %; the clock 10.4 %; the players 4.8 %; the host's other lines 1.5 %; nothing said 5.4 % | 42.4 %; 9.3 %; 4.6 %; 1.2 %; 5.0 % |
| A reaction carrying the next frame after a beat | once ("Simple." then "From the science desk. Fill it in." on the wide, the tiles at its end) | twice |
| Silent studio shots (≥ 1.5 s) | 2; 1.60 s (the final reactions, the sign-off's hold) | 2; 1.87 s |
| The prompt or the pins to the first tick | +0.21 s, all seven | all four |
| The drumroll | PICTURE THIS's last four ticks, ending on the reveal | WHERE's, the same |
| Captions | 0…+33 ms | 0…+32 ms |
| Loudness | −15.7 LUFS, LRA 4.6 LU, −5.0 dBTP; open −18.0 | −15.6, 4.3, −4.7; −18.0 |
| Voice over the music (median; lowest) | 23.1 dB; 18.5 dB | 23.4 dB; 19.2 dB |
| The ticker under the game | 4 items; none an edition story, none grave | 6; none |

No new fault was found. The cuts to answers came 132 ms before their first words, and no cut fell inside a word. No
round's card stood silent. E1's boards are under the reviewer's 65 % and E0's are not (67.6 %). The bound stays open.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy and standards | 9.8 | the ticker's hard politics under the game (allowed, no tragedy) |
| Entertainment and repertoire | 9.7 | no afternoon edition, no TODAY OR NOT TODAY yet |
| Game legibility and tension | 9.8 | a clock that runs out with nobody buzzing is 9.6 s of tiles and ticks |
| Format clarity and rhythm | 9.8 | a reveal's board holds its 4 s before the next board when the reveal is short |
| Picture | 9.6 | E0's boards 67.6 %, over the reviewer's 65 % (open) |
| Sound | 9.8 | the wide under a clock's last ticks after a short recap |
| Data robustness | 9.7 | no afternoon edition, no TODAY OR NOT TODAY yet |

**Round score: 9.6.**

## Round 12 — after round 10's beat, with the archive copied afresh (14 Oct, 14:02 London)

**Recordings.** `r12/e0.mp4` (325.5 s) and `r12/e1.mp4` (325.5 s), made from the archive as it stood at 14:02 London on
14 Oct. E0 and E1 read only what had aired by their own clocks, so they are the same editions.

| Measure | E0 | E1 |
|---|---|---|
| Facts against the plan and the archive | 34, 0 wrong | 32, 0 wrong |
| Boards' share; longest run | **67.5 %**; 26.7 s | 61.4 %; 23.1 s |
| Silent studio shots (≥ 1.5 s) | 6; 2.39 s (Sam's pick single before "Watch it sharpen") | 2; 1.85 s |
| The prompt or the pins to the first tick | +0.21 s, all seven | all four |
| Cuts to answers; cuts inside a word | 132 ms before the first word; 0 | the same |
| Loudness | −15.7 LUFS, LRA 5.4 LU, −5.1 dBTP | −15.6, 4.9, −4.9 |

Fault:

1. **A round's card stood 2.2 s silent, a third time** (E0, PICTURE THIS). The last LETTER BY LETTER headline was one
   nobody named. Its reaction-led frame missed the wide's minimum by 0.03 s even with round 10's 0.4 s allowance, and
   the owed wide after its reveal pushed the round's card into the rule. Each allowance moves the cliff without
   removing it. Director.

A first version of the fix let any card short of its minimum carry the frame. In the fixtures' tie-break edition (s18)
that sent a quick buzz to its board. The owed reaction single then held the final score's card back, and the winner's
reply stayed on the card. Hence the second's margin in fix 1. Fix 2 covers the same reply after a short result line.

### Fixes

1. **A round's card that came in inside its rule carries the next frame as a face would** (`playQuestion`, `youngCard`).
   When the card is a second or more short of its minimum at the next frame, the frame's preamble or its desk is said
   over the round's name and the board comes on the mark or as the frame ends. The card stands no longer than the rule
   needs, and it is no face for the question that follows. A card that held its whole rule gives way to the board as
   before: the board's age then lets a quick buzz go to the buzzer's single. Test: "a round's card never stands silent
   past its rule by more than 1.5 s"; the link test admits the card.
2. **The final score lands a beat before a short result line** (`playCard`). When the winner's reply would otherwise
   wait more than `CARD_WAIT` for the card's minimum, the result line waits up to 1.2 s, so the reply goes to a face.
   Test: "the winner's reply to the final score is on a face…".

## Round 13 — after round 12's fixes

**Recordings.** `r13/e0.mp4` (322.0 s) and `r13/e1.mp4` (334.3 s).

| Measure | E0 | E1 |
|---|---|---|
| Facts against the plan and the archive | 35, 0 wrong | 31, 0 wrong |
| Boards' share; longest run | **66.4 %**; 34.6 s | 61.0 %; 23.1 s |
| Silent studio shots (≥ 1.5 s) | 4; 2.26 s | 2; 1.60 s |
| The prompt or the pins to the first tick | +0.21 s, all seven | all four |
| Cuts to answers; cuts inside a word | 132 ms before the first word; 0 | the same |

No round's card stood silent: E0's round 1 opened on the host, its later questions rode the faces. One new fault
came on DOUBLE OR NOTHING's card:

1. **A headline begun over the wrong card** (E1): "Here's the headline: 'Jellyfish' effect lights | up blank sky." The
   last LETTER BY LETTER headline had no face, so its owed wide pushed DOUBLE OR NOTHING's card into its line. WHERE's
   board was then held back 2.8 s by the card's minimum. That is longer than the 2.5 s a board's cut waits before the
   line starts without it. The host read half the headline over DOUBLE OR NOTHING's card, and WHERE's board came in on
   "up". It broke the reading rule (§9 step 4: the board is there for every word read off it). Director.

### Fixes

1. **A board's words wait for it as long as the shot on air holds its minimum** (`onBoard`: the cut waits up to the
   network's 4 s, not 2.5 s). The case is rare, and the beat and the young card take most of the wait.
2. **DOUBLE OR NOTHING's card, like a round's, carries the next frame** when it came in inside its words
   (`youngCard`). Its preamble ("Here's the headline:") is said over the card, after the beat that lets the board come
   on the headline's first word.

## Round 14 — the final round: two evenings and the afternoon

**Recordings.** `r14/e0.mp4` (12 Oct, 22:00, 312.8 s) and `r14/e1.mp4` (13 Oct, 22:40, 328.6 s), with round 13's fixes.
The afternoon edition came in two takes. `r14/e2.mp4` is 14 Oct 15:20, 359.8 s, made from the archive copied at 15:42
London. After fault 1 below it was made again as `r15/e2.mp4` (378.6 s, a sudden-death tie-break). Same moment, same
questions, fresh lines and play.

| Measure | E0 (evening) | E1 (evening) | E2 (afternoon, `r15`) |
|---|---|---|---|
| Rounds | LETTER BY LETTER / PICTURE THIS / WHERE; DOUBLE OR NOTHING on PICTURE THIS | HOW MANY? / PICTURE THIS / LETTER BY LETTER; DOUBLE OR NOTHING on WHERE | LETTER BY LETTER / PICTURE THIS / WHERE; DOUBLE OR NOTHING on **TODAY OR NOT TODAY**; a tie-break |
| Pair | Lola Byte v Sam Night | Paco Pixel v Penny Sterling | Ada Volt v UNIT-8 |
| Voices | 78 of 78 heard, 0 browser sentences | 71 of 71, 0 | 80 of 80, 0 |
| Facts against the plan and the archive | 35, 0 wrong | 31, 0 wrong | 36, 0 wrong |
| Excluded kinds asked; edition stories or grave items on the ticker | 0; 0 of 5 items | 0; 0 of 6 | 0; 0 of 9 |
| PICTURE THIS pictures on screen | 4 of 4 | 3 of 3 | 3 of 3 |
| Length (bound 290–360 s) | 312.8 s | 328.6 s | **378.6 s** (take 1, no tie-break: 359.8 s) |
| Shots | 43 (19 studio); 8.3 a minute; busiest 11; median 4.79 s; longest studio 7.42 s | 46 (22); 8.4; 11; 5.12 s; 7.81 s | 56 (27); 8.9; 13; 4.73 s; 7.38 s |
| Boards' share; longest run | **68.2 %**; 32.7 s | 64.5 %; 34.8 s | 63.8 %; 39.2 s |
| What the boards carry | the host reading 44.4 %; the clock 11.7 %; the players 5.3 %; the host's other lines 1.2 %; nothing said 5.5 % | 44.9 %; 12.0 %; 2.2 %; 1.0 %; 4.4 % | 42.2 %; 11.4 %; 3.2 %; 1.7 %; 5.3 % |
| Cuts to a buzz, a guess, a last lock-in | 132 ms before the first word, all | all | all (one buzz held for its single) |
| Cuts inside a word | 0 | 0 | 0 |
| Silent studio shots (≥ 1.5 s) | 4; 2.47 s (a verdict's wide before "Watch it sharpen") | 3; 1.96 s | 8; **3.12 s** (TODAY OR NOT TODAY's wide under the drumroll) |
| The prompt or the pins to the first tick | +0.21 s, all seven | all four | all six |
| The drumroll | PICTURE THIS's last four ticks, ending on the reveal | WHERE's, the same | TODAY's last headline, the same |
| Captions | 0…+33 ms | −1…+32 ms | 0…+33 ms |
| Ticks with an onset (≥ 3 dB, high band, −40…+80 ms) | 47 of 64, median +9 ms | 46 of 62, +9 ms | 53 of 68, +10 ms |
| Loudness | −15.7 LUFS, LRA 5.3 LU, −4.9 dBTP; open −18.1 | −15.6, 5.2, −4.9; −18.1 | −15.6, 5.4, −4.9; −18.1 |
| Voice over the music (median; lowest) | 22.6 dB; 18.1 dB | 23.4 dB; 20.3 dB | 23.8 dB; 19.2 dB |
| Music between voices | −36.4 dBFS (10–90 % −38.9 to −34.0) | −36.6 (−38.7 to −35.7) | −36.3 (−38.6 to −33.9) |

The step-7 checks with the real voices, across all three editions:

- every lock-in's line comes 0.25–1.0 s after its tick (the players' model reacts to the step);
- every prompt and the pins end 0.21 s before the first tick;
- every cut to a buzz or a guess lands 132 ms before its first word;
- every verdict's wide comes after the host's read-back;
- the drumroll covers the last four ticks and ends on the reveal;
- no laughter or applause anywhere;
- no sign-off time stated, so none can be false.

Faults:

1. **The afternoon spoke as the evening** (E2, take 1): "Tonight it is Ada Volt, from TECH BYTES…", UNIT-8's "Good
   evening. My memory is large.", "It's Ada's night: 14 to 9." The banks were written for the evening. Quiz producer,
   first-time viewer. Fixed and re-made (below). Take 2 says "Good afternoon. I have questions about the questions." and
   "this afternoon" in every credit.
2. **The afternoon edition runs long**: 359.8 s without a tie-break and 378.6 s with one, against the bible's 360 s. The
   writer estimated 335 s and 362 s (on the evenings its estimate is within 3 s). TODAY OR NOT TODAY is what it
   underrates. Each headline on air took about 16 s: the board, the headline, a 3-half-note clock, the lamps on the
   wide, the verdict, and on DOUBLE OR NOTHING's last headline the clock stretched for the drumroll. The bible's table
   gives about 9 s. The writer even let an edition estimated over 360 s go to air. Not fixed in this run. Quiz producer,
   director.
3. **TODAY OR NOT TODAY's wide stands without a voice for 2.1–3.1 s per headline**: the lamps are silent, so the clock
   (and on the last headline the drumroll) runs on the players' wide until the verdict. The step-4 design puts TODAY's
   lock-ins and verdict on the wide, so the board's stamp of the day is heard and not seen. Sound runs under it, but
   3.1 s is past the 2.7 s the director critique accepted for a silent face. Not fixed in this run. Director.
4. **The boards' share** is 68.2 % on E0 (the fallback edition), 64.5 % on E1 and 63.8 % on E2, against the step-4
   reviewer's 65 %. Reported, not argued (owner's choices, 3). Director.

### Fix

1. **An afternoon edition says the afternoon's words** (`writer.js` `afternoonWords`). Before 17:00 London a bank's line
   says "Good afternoon" for "Good evening", "today" for "tonight", "Ada's afternoon" for "Ada's night", and so on. The
   change is made to the line before its words are filled in, so an aired headline is never altered. Test: "an
   afternoon edition says the afternoon's words…".

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy and standards | 9.8 | every fact checked against the plan and the archive (102, 0 wrong), no excluded kind, no edition story or grave item on the band; the ticker's hard politics under the game is allowed |
| Entertainment and repertoire | 9.6 | 2 (an afternoon of 378.6 s outstays the format), 1 found on the air |
| Game legibility and tension | 9.6 | 3 (TODAY's stamp heard, not seen; its wide waits silently on the lamps) |
| Format clarity and rhythm | 9.5 | 2 (over the 360 s bound) |
| Picture | 9.6 | 4 (E0 68.2 %), 3 |
| Sound | 9.7 | 3: 3.1 s of drumroll and ticks under a wordless wide |
| Data robustness | 9.6 | 2 (the writer's TODAY estimate and its 360 s guard), 1 (no test wrote an afternoon edition) |

**Round score: 9.5. Not passed.** The evening editions are close: on E0 and E1 alone the panel's lowest is the
boards' share. The afternoon edition is not ready. It overruns the bound, and TODAY OR NOT TODAY's wides wait silent.
Next, in order:

- the writer's estimate for TODAY OR NOT TODAY, calibrated to the director's 16 s a headline, and a hard 360 s guard;
- TODAY's verdict on its board, or a host line under the lamps;
- the boards' share, as the reviewer decides.

The reviewer's note on round 14, verbatim:

> round 14 reviewed by the reviewer: not passed; the table line contradicts its board; a person's failure asked as an
> option; politics and grave items on the ticker under the game; afternoon length; TODAY's silent wides; DOUBLE OR
> NOTHING's repeated PICTURE THIS

## Round 15 — the reviewer's six faults, then the same hard panel on the final takes

The reviewer's verdict on round 14 (above) named six faults. The round fixed them first, with tests, then made the three
editions again from an empty `data/quiz` (E0, then E1 on E0's history, then E2 on both) and recorded them. Recording
brought more faults to light; each was fixed and recorded again (takes 1 to 3, then the final recordings). No test was
loosened, skipped or disabled, and every bound stands, the boards' 65 % included. The session stopped on 14 Oct at
21:40 UTC (the account's usage limit) and resumed on 16 Oct; the final recordings (`r20/`) were made on 16 Oct, with the
archive copied afresh at 15:38 London.

### The reviewer's faults, and their fixes

1. **The table line contradicted its board** (round 14's E2, about 6:10: the board showed PACO 1, SAM 1, UNIT-8 1; the
   host said "Paco and Sam share the lead on one win"). The writer named only the first two leaders. `writer.js`
   `tableLine` now takes the leaders from the standings the board shows, after this edition's result. That is every row
   the board ranks first: the same wins from the same games, as `tableRows` ranks them. All of them are named ("Max,
   Paco and Sam share the lead on one win, from one game each", heard on take 1's E2). Past four, the line gives the
   count; the counts are said as words ("one and a half wins"). Tests: "the table line names every player the board ranks
   first, a three-way tie said as one", and "the edition's table line and its board read the same standings, this
   edition's result in them".

   **The fact-check script now checks every spoken score and table fact against the board under it.** That covers the
   half-time scores, DOUBLE OR NOTHING's standing ("you're behind", "we're level"), TODAY OR NOT TODAY's tally, the result
   and the table line. Each is checked three ways: against the reveals' running points (DOUBLE OR NOTHING doubled for the
   player behind), against the desks' scores at the moment it is said, and against the board on air (the final score, the
   table). Run on round 14's E2 it finds the table line, and a second fault the panel had missed. After the sudden-death
   headline the desks read 16–19 for 7 s, then the final board read 16–16. **The sudden-death headline now wins the game
   and adds nothing to the desks** (`quizplay.js` `revealPlan`); who scored still lights the lamps and plays the sting.
   Test: "the desks' scores only climb and end on the final score the host says…". The final E2 ends on a tie-break, and
   the desks hold 12–12 through it.
2. **A person's failure as an option** ("Bayern's Michael Olise sent off for 'super dumb' yellows within seconds"),
   hardship ("Hundreds of Royal Mail staff quitting each week under efficiency plans", in TODAY OR NOT TODAY) and an
   incident ("BA flight forced to turn back", the tie-break). The `desk.js` lists now cover:
   - a sending-off, red cards, booing, "dumb", blunders, a missed penalty;
   - staff quitting, efficiency plans, a firm losing its workers;
   - a flight forced to turn back, an emergency landing, a diversion, an engine failure.

   Tests on the real headlines. **Round 14's three editions re-run** (52 headlines, questions and options, against the
   lists as committed, on the airings up to each edition's moment): 5 are now refused. They are Olise (a person's
   failure), Royal Mail (hardship), the BA flight (an incident), and two found by this round's own reading (below): "Taiwan
   plans to buy liquefied natural gas from Alaska pipeline project" (politics) and "China's trade surplus hits $938bn for
   Jan-Sep" (politics).
3. **Politics and grave items on the ticker under the game.** While PAY ATTENTION airs, the band now carries nothing the
   quiz itself would refuse. The station marks each feed item with the kind the desk would refuse it as (`desk.js`
   `quizRefuses`, the desk's own lists, `quizOut` on the item). The band leaves those items out (`graphics`
   `quizAvoided`), as well as the edition's own stories; it shows fewer items rather than one the game would not ask.
   Round 14's bands re-read under the rule: 15 of their 25 distinct items would now be held back. They include the White
   House briefing, Burnham, the midterms, the Paris protesters, Pakistan's emergency rule, Charlie Kirk's legacy and
   China's lonely. Tests: "nothing the quiz would refuse scrolls under the game…" (the station's mark is the desk's own
   judgement, and the band drops those items only while the edition airs), and the station's ticker contract (`quizOut`).
   This is removed from the owner's pending choices, as decided.
4. **The afternoon's length.** The writer's estimate is now calibrated on the recorded voices (`writer.js`
   `estimateSeconds`):
   - each player's lines at their own voice's measured rate (UNIT-8's is a third slower than the host's);
   - LETTER BY LETTER's clock to the winning buzz, past a stall;
   - a TODAY OR NOT TODAY headline at 12.5 s in a round and 14.5 s in DOUBLE OR NOTHING, measured on the four afternoon
     recordings (10.9–15.3 s and 11.7–18.0 s). The ~16 s in the brief was round 14's DOUBLE OR NOTHING with UNIT-8
     alone. Counted at 16 s, take 2's six-headline round came out 17.7 s over its air;
   - PICTURE THIS at 4.5 s and WHERE at 1.2 s a question over their speech.

   On 26 recorded editions the estimate is 0.6 s off on average, with a spread of 5.5 s; on the afternoon it had run
   16.6 s short. **The hard guard** (`writeEpisode`) shortens before air any edition estimated over its bound (345 s, or
   360 s with a tie-break) less 5 s:
   - by one or two optional lines (the latest reactions to a reveal), when that is enough;
   - else by whole TODAY OR NOT TODAY headlines: a round keeps four, DOUBLE OR NOTHING two, the dropped story leaves the
     asked list, and the round's lines say the count;
   - then by optional lines.

   The game is played again on what is left, and no question is cut mid-way. Tests: the calibration; the guard on an
   afternoon edition, where long headlines force it (every edition within its bound, whole headlines, both answers kept,
   the count said); `withoutTodayHeadline`'s floors. Take 1's E2 was estimated at 360 s and cut (a headline and two lines)
   to 318.6 s on air. That estimate counted a stalled LETTER BY LETTER clock whole and 16 s a TODAY headline. Both were
   corrected, and the final E2 (estimate 348 s, a tie-break) aired 351.6 s, cut by nothing.
5. **TODAY's silent wides** (2.1–3.1 s on the lamps and the ticks). The lamps now light on the board beside the headline,
   and the wide comes at most 1.6 s before the verdict's first word (`quizdirector.js` `TODAY_WIDE`; 1.54 s on each of
   the final E2's six). Test: "TODAY's wide… never standing silent past 2 s before its verdict". The takes showed the same
   fault elsewhere, and it is fixed everywhere:
   - **PICTURE THIS's wide stood 2.10 and 2.17 s on the ticks after the recap** (take 1's E1). Once the faces have held
     the network's minimum, they stand at most 1.8 s with only the ticks under them; then the board comes back with its
     clock (`FACE_QUIET`). Test: "never more than 1.8 s of ticks on the faces with nothing said".
   - **"There it is." left the winner's single 2.6 s silent before the final score** (take 3's E2, after the
     sudden-death verdict). A reaction opened in the reveal's last words that would leave its face more than 1.8 s
     silent before a board now stays on the reveal's board. The fake clock does not reproduce that moment's timing, so
     the fixture test checks the property on every edition ("a reaction's face opened in the reveal's last words never
     stands more than 1.8 s after its last word before a board"). The final E2 shows the fix: the reply sits on the
     verdict's board.

   **No studio shot in the final recordings stands silent for more than 1.80 s.**
6. **DOUBLE OR NOTHING's repeated PICTURE THIS.** When neither type left can be filled, DOUBLE OR NOTHING now falls back
   to a type already played that offers two desks, LETTER BY LETTER or WHERE, and only then to PICTURE THIS (`planner.js`
   `DON_REPLAY`; the bible's §4 and §7). E0 now plays DOUBLE OR NOTHING on LETTER BY LETTER (technology or science). Its
   round types have no alternative. On 12 Oct at 22:00 no pairing's pool can fill HOW MANY? (too few figures) or TODAY OR
   NOT TODAY (no earlier days), so E0's three rounds are the board-heaviest types. Its share was 68.2 % in round 14 and is
   now 64.6–66.7 % across the takes (65.8 % on the final recording).

### This round's own reading: faults found and fixed between the takes

Making the editions again under the new lists brought new stories to the screen and to the band, and the panel read every
one. Each was fixed in `desk.js`, `planner.js` or `rounds.js`, with tests:

- **one story asked twice in an edition.** "Facebook will let you customize your feed algorithm using AI" (PICTURE THIS)
  and "Facebook is giving users more control" (LETTER BY LETTER) are both Meta's "Your Algorithm" (in a first making of
  E1, stopped before its recording). Two headlines that open on the same name are now one story when their sources'
  openings share another name, or when both use a coined compound.
- **one story on two days.** "Google makes it easier to launch your vibe-coded apps" was asked on the 13th, and "Google
  wants to host your personal vibe-coded apps" was planned for the 14th. Asked once in seven days now goes by story.
- **one story under two pictures.** "Citroën's iconic 2CV returns as all-electric model" and "Revival of classic:
  Citroën unveils electric version of its 2CV" appeared as wrong options of two questions.
- **a state's deal as a WHERE question.** "Taiwan plans to buy liquefied natural gas from Alaska pipeline project"; its
  aired text says "This is what Donald Trump, the U.S. President, said", behind a presenter's "Thanks, Lola." Now a head
  of state named anywhere in a story makes it politics, a country that plans, agrees, pledges or signs stands for its
  government, and a story's subject skips a presenter's handoff.
- **trade frictions, loneliness and price rises.** "China's trade surplus hits $938bn… as pressure ramps up to rebalance
  trade"; "'I'd talk to the TV': The paid companions bringing warmth to China's lonely"; "Skydance's Discovery+ prices
  increase by up to 20%".
- **what the bands carried under the game.** On take 1's E0 and E1 (14 Oct's feeds), "Netflix to cut 1,000 jobs as
  subscriptions slow" and the Taiwan deal scrolled under the game. A check of the live feeds then found:
  - "Espada not returning as Astros manager" and "College Football Bottom 10: Texas takes major fall";
  - "NFL suspends Rams' Jackson for striking Bills' Chubb in face" and "another damaging Man Utd fallout";
  - "Matchup rankings for Week 6: Upgrade Tony Pollard, fade Trevor Lawrence" and "the labor battle";
  - "Prismm helps banks keep inherited money in-house" and "$15 gets you Psychonauts 2…";
  - "the slumping Eagles" and "Pakistan has locked down Imran Khan's stronghold".

  On the next recordings' bands (14 Oct, evening feeds) came "Sir Trevor Phillips encouraged CBS News colleagues to tell
  critics to '…'", with a quoted obscenity, and "The Archers cast 'angry' at BBC decision to scrap new Birmingham studio".
  16 Oct's feeds brought "Darnold owns up to mistakes in OT loss", "Eagles QB Hurts ruled out vs. Panthers with blood
  clot in calf" and "Tough loss for Sabalenka…". All are refused now: a firm's job cuts however phrased; a person's exit,
  anger, error or disgrace; fantasy tips; a labour dispute; an inheritance; a deal; a slump; an emergency rule; a player's
  injury; and a new kind, offensive language, anywhere in a story. The final recordings' bands carry none of these: 0 refused items under the game in all three.

Known and left as they are:

- "F1 in Singapore: There's new fastest car now" is refused because of a later airing whose text says "the floodlit
  streets" (the disaster list's "flood…"). A false refusal errs on the safe side; the story aired in E0 because the desk
  judges the airings up to the edition's moment.
- The band's items come from the live feeds at recording time (16 Oct), under the editions' own clocks (12–14 Oct), as in
  every round.

### The final recordings

The final recordings (`r20/`, 16 Oct) play the editions as made. E0 and E1 come from take 2 (`r17/`, made with commit
e44529c), and E2 from take 3 (`r18/`, made after the TODAY estimate's calibration). E2 has the same questions as take
2, fresh play, and a sudden-death tie-break. They were recorded on a fresh station, so its band is today's feeds through
the desk's lists. E1 and E2 were recorded with commit 3448cf5. E0's first recording there (kept in `r20/e0-band1/`) had
"UK's 'incoherent' approach to China plagued by lack of expertise, report says" as the only news on its band. That is a
state's foreign policy, which the lists then missed. The lists now refuse it (a state's dealings with another; a damning
verdict), and E0 was recorded again on a fresh station with them (the round's closing commit). The director's code is
the same as the 14 Oct recordings (`r19/`), and the shots match them. The takes before are kept for the faults above:
take 1 `r16/` (commit b720574), take 2 `r17/`, take 3 E2 `r18/`, and `r19/`.

| Measure | E0 (evening) | E1 (evening) | E2 (afternoon) |
|---|---|---|---|
| Rounds | WHERE / LETTER BY LETTER / PICTURE THIS; DOUBLE OR NOTHING on **LETTER BY LETTER** (technology or science) | LETTER BY LETTER / HOW MANY? / PICTURE THIS; DOUBLE OR NOTHING on WHERE | **TODAY OR NOT TODAY (six headlines)** / LETTER BY LETTER / PICTURE THIS; DOUBLE OR NOTHING on HOW MANY?; a sudden-death tie-break |
| Pair; result | Penny Sterling v Sam Night; Sam 17–15 | Paco Pixel v Penny Sterling; Paco 16–13 | Lola Byte v Sam Night; 12–12, Sam on the tie-break |
| The table line (its board ranks the same) | "Sam leads with one win from one game" | "Paco and Sam share the lead on one win, from one game each" | "Sam leads with two wins from two games" |
| Voices | 75 of 75 heard, 0 browser sentences | 69 of 69, 0 | 74 of 74, 0 |
| Facts: questions, options, answers, credits; every score, tally and table line against the board under it | 51, 0 wrong | 50, 0 wrong | 53, 0 wrong |
| Headlines against the desk's lists | 16, 0 refused | 16, 0 refused | 20, 0 refused |
| Band under the game: items the quiz refuses | 0 (only the station's WORLD WEATHER card: every news item of the hour refused) | 0 (seven sports items and the station's cards) | 0 (seven sports items and a programme card) |
| PICTURE THIS pictures on screen | 3 of 3 | 3 of 3 | 3 of 3 |
| Length (bound 290–345 s, 360 s with a tie-break); the writer's estimate | 303.4 s; 302 | 321.5 s; 323 | 351.6 s; 348 |
| Shots | 45 (20 studio); 8.9 a minute; busiest 13; median 5.22 s; longest studio 6.66 s | 48 (23); 9.0; 12; 5.03 s; 8.12 s | 50 (22); 8.5; 12; 5.28 s; 8.10 s |
| Boards' share; longest run | **65.8 %** (no alternative, below); 28.9 s | 62.0 %; 23.4 s | **67.9 %** (no alternative, below); 31.4 s |
| What the boards carry, as shares of the air | the host reading 42.4 %; the clocks 11.8 %; the players 4.2 %; nothing said otherwise 6.1 % | 43.2 %; 10.2 %; 3.2 %; 4.5 % | 43.0 %; 16.8 % (TODAY's lamps 4.9 %); 1.4 %; 5.4 % |
| Cuts to a buzz | 132 ms before the first word, all three | both | all three |
| Cuts inside a word | 0 | 0 | 0 |
| Studio shots silent 1.5 s or more; longest | 3; 1.71 s | 3; 1.73 s | 10; 1.80 s (TODAY's six wides 1.54 s each) |
| The prompt or the pins to the first tick | all six | all four | all three |
| The drumroll | LETTER BY LETTER: from the buzz, under the answer, to the reveal | WHERE's last four ticks, ending on the reveal | HOW MANY?'s last four ticks, ending on the reveal |
| Captions | 0…+32 ms | −1…+33 ms | −1…+33 ms |
| Ticks with an onset (≥ 3 dB, high band, −40…+80 ms) | 44 of 58, median +9 ms | 41 of 57, +9 ms | 61 of 69, +9 ms |
| Loudness | −15.7 LUFS, LRA 4.9 LU, −4.9 dBTP; open −18.0 | −15.6, 4.9, −4.8; −18.0 | −15.6, **8.5**, −4.7; −18.0 |
| Voice over the music (median; lowest) | 22.3 dB; 18.5 dB | 22.9 dB; 19.2 dB | 24.2 dB; 19.7 dB |
| Music between voices | −36.2 dBFS (10–90 % −39.0 to −33.6) | −36.8 (−38.5 to −32.9) | −36.2 (−38.0 to −33.7) |

**The boards' share, against the reviewer's rule.** The rule: 65 % for every edition; only an edition with no
alternative may exceed it, capped at 70 %, and the log must say so. This round has two such editions, both under the cap:

- **E0, 65.8 %.** On 12 Oct at 22:00 no pairing can fill HOW MANY? or TODAY OR NOT TODAY (checked for every pairing the
  planner could choose), so its three rounds are WHERE, LETTER BY LETTER and PICTURE THIS, the board-heaviest types.
  DOUBLE OR NOTHING now takes LETTER BY LETTER, not a fourth PICTURE THIS. Take 2 of the same edition measured 64.6 %. The
  1.2 points between take 2 and the final come from the cap on a reaction's silent face: DOUBLE OR NOTHING's reply now
  sits on its verdict's board, not 1.8 s silent on the single.
- **E2, 67.9 %.** Its pairing's pool (Lola Byte v Sam Night on 14 Oct at 15:20, with the week's asked stories out) fills
  only PICTURE THIS, LETTER BY LETTER and TODAY OR NOT TODAY, so the planner had no other set of rounds. Two things push
  it up:
  - the sudden-death tie-break, a LETTER BY LETTER headline on its board (take 2 of the same plan, without one, measured
    64.7 %);
  - TODAY's lamps, now seen on the board for 4.9 % of the air instead of on a silent wide.

  One lever is left untried: a host line under TODAY's lamps on the wide (the brief's other option) would move about
  15 s from the board to the studio, about 63–64 % on this edition. It needs a new writer line for each headline, and it
  adds about 1.5 s a headline: about 9 s on this edition, which with its tie-break already runs 351.6 s of its 360.

### The panel

Every member watched the three final recordings from the open to the end card, with sound, against the 1 s contact
sheets and the 2x stills.

- **Quiz producer.** The afternoon is now a real afternoon. It opens on TODAY OR NOT TODAY's six headlines (three from
  Monday's edition, which the week's regular viewer will remember), goes through a level LETTER BY LETTER and PICTURE
  THIS, and comes to a 12–12 tie. The sudden-death verdict holds the desks level, and the final board says what the host
  says. The table line names every leader in all three editions. On the 13th, DOUBLE OR NOTHING on LETTER BY LETTER
  (E0) is a better climax than a second picture: the drumroll runs under the player's answer. One note: the archive's
  small first days bring the same option headlines back across the week's editions ("New injection makes fat cells
  self-destruct" is asked on Monday and an option on Tuesday and Wednesday). The rules allow it, and the pool is the
  archive's.
- **Standards and legal editor.** 52 headlines across the three editions, every question and option, run against the
  lists: none refused. Every fact checked: 154, none wrong. The band under the game carries nothing the quiz would refuse
  (0 refused items in all three). The desk now errs towards refusing: F1's "floodlit streets", "Britain's Kartal upsets Svitolina to
  storm into Wuhan Open semi-finals" (harm) and Brighton's "Conference League" (politics) are all refused when they need
  not be. A false refusal
  costs a story, never a standards fault.
- **Director.** No studio shot stands silent for more than 1.80 s. TODAY's verdict wide comes 1.54 s before its words,
  and PICTURE THIS's faces give way to the board with its clock. The reply to the sudden-death verdict stays on the
  verdict's board. No cut lands inside a word, and every buzz cut lands 132 ms before the first word. The boards'
  share is the open point. E0 (65.8 %) and E2 (67.9 %) exceed 65 % under the rule's exemption, and E2's longest run of
  boards is 31.4 s. Under the rule as written, both are allowed.
- **Lead pixel artist.** The pictures are on screen in every PICTURE THIS question (9 of 9). The TODAY board shows
  "HEADLINE 1 OF 6" and its lamps, the final board shows a level 12–12 with the winner in gold, and the table shows the
  ranks. Nothing is clipped, and the strip and captions stay clear.
- **Sound designer.** The loudness and the voice over the bed are as in round 14. Every drumroll ends on its reveal; E0's
  runs under the buzzed answer, as LETTER BY LETTER's ticks stop at the buzz. E2's loudness range is 8.5 LU against
  4.9 on the evenings. TODAY's six silent clocks, now on the board with the ticks alone, and the tie-break widen it. It is
  within broadcast practice, and the ticks carry those moments (61 of 69 with an onset).
- **First-time viewer.** It is clear who leads and why, and the tie-break is understood without explanation ("First to
  name this headline wins"). The TODAY round is quick, and the board says which headline of six it is.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy and standards | 9.8 | every headline and fact checked (52 headlines, 154 facts, 0 wrong); the band clean under the game; the lists err towards refusing |
| Entertainment and repertoire | 9.8 | the archive's small pool brings the same option headlines back across the week's editions |
| Game legibility and tension | 9.8 | TODAY's lamps are seen on the board, its verdict on the wide; nothing open |
| Format clarity and rhythm | 9.8 | 303.4, 321.5 and 351.6 s within their bounds; the estimate within 3.6 s on all three |
| Picture | 9.8 | the boards' share: E0 65.8 % and E2 67.9 % under the rule's exemption (no alternative round set), the 31.4 s run of boards in E2 |
| Sound | 9.8 | E2's loudness range 8.5 LU |
| Data robustness | 9.8 | the estimate's spread (5.5 s against a 5 s margin); one face-silence fix measured on air but not reproduced on the fake clock |

**Round score: 9.8 (lowest category). Passed, on one condition: the reviewer's exemption for E0 and E2.** The Picture
score rests on the rule as the reviewer set it. Both editions over 65 % have no alternative set of rounds and stay under
70 %. If the reviewer does not accept E2's exemption (its tie-break, and TODAY's lamps on the board), the Picture score is
9.6 and the round is not passed. The lever is above.

### Every headline the three editions show, against the desk's lists

Each headline is checked on the airings up to its edition's moment, against the lists as committed. AI products' names
are written as [name], per the project's rule. "ok" means no kind refuses it.

- **r17/e0** (16 headlines):
  - ok: where question — "NASA spots patch of Moon-like rock on Earth"
  - ok: where question — "Smart ring maker Ultrahuman to roll out biological-age model across UAE"
  - ok: where question — "F1 in Singapore: There's new fastest car now" (a later airing: disaster)
  - ok: letters question — "Antarctic Sea Ice Grows to Its 2026 Maximum"
  - ok: letters question — "Just 10 minutes of daily exercise could unlock deeper sleep"
  - ok: letters question — "Honeyjar offers AI tools to improve PR and comms"
  - ok: picture question; picture option B (answer); picture answer — "New injection makes fat cells self-destruct"
  - ok: picture option A — "Fitbit Edge is Google’s middle ground between Fitbit Air and Pixel Watch"
  - ok: picture option C — "These execs think voice AI hasn’t reached its [name] moment yet"
  - ok: picture question; picture option C (answer); picture answer — "Inside mini factory where GM builds its EV future"
  - ok: picture option A — "Meta has some Wonder Full new AI models"
  - ok: picture option B — "Revival of classic: Citroën unveils electric version of its 2CV"
  - ok: picture question; picture option A (answer); picture answer — "This AI startup says it can generate permit-ready blueprints in minutes"
  - ok: picture option B — "Former Plaud exec raises $26M for AI app that listens to you"
  - ok: picture option C — "Stinky 'skunk' plant cleared from river"
  - ok: letters question — "Scientists find vanilla’s hidden healing potential"

- **r17/e1** (16 headlines):
  - ok: letters question — "This tiny jurassic predator helped pave way"
  - ok: letters question — "Red squirrel project opens £250k community grant"
  - ok: letters question — "Scientists find a hidden map of the brain"
  - ok: howmany question — "Owls ringed to measure benefits of wildlife farming"
  - ok: howmany question — "Apple refreshes its HomePod mini"
  - ok: howmany question — "SpaceXSI bundles X Premium, [name], and Cursor into one subscription"
  - ok: picture question; picture option A (answer); picture answer — "Shopify opens catalog up to more AI agents"
  - ok: picture option B — "Facebook is giving users more control"
  - ok: picture option C — "New injection makes fat cells self-destruct"
  - ok: picture question; picture option B (answer); picture answer — "Google makes it easier to launch your vibe-coded apps"
  - ok: picture option A — "NASA spots patch of Moon-like rock on Earth"
  - ok: picture option C — "Former Plaud exec raises $26M for AI app that listens to you"
  - ok: picture question; picture option B (answer); picture answer — "Paris Auto Show is full of interesting cars Americans can’t have"
  - ok: picture option A — "Long-lost horror gaming cult classic P.T. gets much-needed PC port"
  - ok: picture option C — "Scientists find hidden factor that can make or break chemical reactions"
  - ok: where question — "'Jellyfish' effect lights up US sky"

- **r17/e2** (19 headlines):
  - ok: today headline (TODAY) — "Scientists find how harmful “zombie cells” hide"
  - ok: today headline (EARLIER) — "These execs think voice AI hasn’t reached its [name] moment yet"
  - ok: today headline (EARLIER) — "Former Plaud exec raises $26M for AI app that listens to you"
  - ok: today headline (EARLIER) — "Meta has some Wonder Full new AI models"
  - ok: today headline (TODAY) — "Fairphone’s repairable earbuds are smaller"
  - ok: today headline (TODAY) — "Anthropic warns AI models could self-replicate"
  - ok: letters question — "Facebook is giving users more control"
  - ok: letters question — "Tesla Roadster could have stayed vaporware"
  - ok: letters question — "CMF’s first wireless speakers look like musical milk cartons"
  - ok: picture question; picture option C (answer); picture answer — "Xbox is officially embracing chaos of AI-powered game ports"
  - ok: picture option A — "Antarctic Sea Ice Grows to Its 2026 Maximum"
  - ok: picture option B — "Scientists reveal why some workout recovery tricks can backfire"
  - ok: picture question; picture option C (answer); picture answer — "Scientists may have finally solved mystery of Moon’s two faces"
  - ok: picture option A — "Google makes it easier to launch your vibe-coded apps"
  - ok: picture option B — "'Jellyfish' effect lights up US sky"
  - ok: picture question; picture option B (answer); picture answer — "Mars moon lander set to launch on 19 October"
  - ok: picture option A — "NASA Science, Cargo Launch on 35th SpaceX Resupply Mission to Station"
  - ok: picture option C — "Niobia takes guesswork out of some of tech’s most expensive mistakes"
  - ok: howmany question — "Planet 320 light-years away confirms what scientists long suspected"

- **r18/e2** (20 headlines):
  - ok: today headline (TODAY) — "Scientists find how harmful “zombie cells” hide"
  - ok: today headline (EARLIER) — "These execs think voice AI hasn’t reached its [name] moment yet"
  - ok: today headline (EARLIER) — "Former Plaud exec raises $26M for AI app that listens to you"
  - ok: today headline (EARLIER) — "Meta has some Wonder Full new AI models"
  - ok: today headline (TODAY) — "Fairphone’s repairable earbuds are smaller"
  - ok: today headline (TODAY) — "Anthropic warns AI models could self-replicate"
  - ok: letters question — "Facebook is giving users more control"
  - ok: letters question — "Tesla Roadster could have stayed vaporware"
  - ok: letters question — "CMF’s first wireless speakers look like musical milk cartons"
  - ok: picture question; picture option C (answer); picture answer — "Xbox is officially embracing chaos of AI-powered game ports"
  - ok: picture option A — "Antarctic Sea Ice Grows to Its 2026 Maximum"
  - ok: picture option B — "Scientists reveal why some workout recovery tricks can backfire"
  - ok: picture question; picture option C (answer); picture answer — "Scientists may have finally solved mystery of Moon’s two faces"
  - ok: picture option A — "Google makes it easier to launch your vibe-coded apps"
  - ok: picture option B — "'Jellyfish' effect lights up US sky"
  - ok: picture question; picture option B (answer); picture answer — "Mars moon lander set to launch on 19 October"
  - ok: picture option A — "NASA Science, Cargo Launch on 35th SpaceX Resupply Mission to Station"
  - ok: picture option C — "Niobia takes guesswork out of some of tech’s most expensive mistakes"
  - ok: howmany question — "Planet 320 light-years away confirms what scientists long suspected"
  - ok: letters question — "Microsoft’s AI chip makes it less reliant on Nvidia’s GPUs"

## The owner's pending choices

These are not faults of the build. (Two earlier entries were decided by the reviewer in round 15 and are no longer
pending: the boards' share keeps its 65 % bound for every edition, an edition with no alternative capped at 70 %; and the
band under the game carries nothing the quiz would refuse.)

1. **The host.** Every recording uses the provisional candidate A: the name Quinn Query, face A, voice A. The owner
   chooses:
   - the name: Quinn Query (A), Theo Tally (B) or Layla Level (C), in `config/channel.json`;
   - the face: `HOST_LOOK` in `public/js/pay-attention-looks.js`;
   - the voice, by ear: `qm.candidates[letter]` into `qm` in `server/voice/casting.json`, with its gender, lang, pitch
     and rate in `presenters.qm.voice`. Look B takes voice B; looks A and C take voice A or C.
2. **Leaving the drafts.** PAY ATTENTION is still a draft (`"drafts"` in `config/channel.json`), aired here by
   `DRAFTS_ON_AIR=pay-attention@cosmos` and `QUIZ_VIEW=1`. Once step 7 passes and the host is chosen, the owner moves it
   to `programs` and into the rotation after COSMOS. The desk then wants its three days of archive, which the station's
   archive has had since 15 Oct, 14:25 London (the desk counts from the oldest airing). Its week has a gap, though: the
   station's recorder was down from 14 Oct's evening to 16 Oct's afternoon, so the pool for the next days is thinner.
3. **The sign-off names no next edition.** The rotation does not know its next slot. The writer says the time when the
   station passes one (`nextAt`); the producer does not yet.

**Round 15 accepted by the reviewer at 9.75.** Checked on 5 s contact sheets of E0 and E2 and frames at their table,
final score and ticker: the table line names every player the board ranks first; the ticker under the game carries
only what the quiz would ask (sport and technology on 16 Oct's feeds); the afternoon edition runs 351.6 s with a
tie-break (bound 360); TODAY OR NOT TODAY's verdict is on its board and its wide is never silent past 1.8 s; DOUBLE OR
NOTHING no longer repeats PICTURE THIS. E0 (65.8 %) and E2 (67.9 %) are over 65 % on the boards under the rule set in
advance (no alternative set of rounds, under the 70 % cap). Still against it, none above the gate: the questions lean
on technology and science because the pool does (the desk's exclusions take most world news), to be measured again
on the gate's three days; the options' pool repeats across a week on a young archive.
