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
