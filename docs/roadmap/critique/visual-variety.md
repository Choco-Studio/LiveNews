# PAY ATTENTION and FULL TIME — visual variety (critique log)

The owner, 18 Oct, on both programmes: **"necesitan algunas diapositivas más o cosas que no lo hagan muy repetitivo"**
(they need a few more slides, or things that stop them being so repetitive). **Gate: a hostile critique above 9.7 for
pacing and visual variety, judged on fresh recordings; the round's score is its lowest category.** PAY ATTENTION's host
is candidate B, Theo Tally (look B, voice B), the owner's choice of 18 Oct.

## Method

- **What a viewer sees, shot by shot**: `public/js/variety.js` names every shot on air (`shotLayout`: its group,
  presenter, board, picture, map; its kind, the picture as a viewer tells it apart: the wide, the two-shot, the single,
  the over-the-shoulder, every board by its name, a question board's reveal view, a headline frame by what fills it;
  its exact layout) and measures a timeline (`varietyReport`).
- **Recordings**: `tools/record.mjs --trace` (deterministic, any machine load) of a real edition each, made by the
  station's own desks from the real archive (PAY ATTENTION, 17 Oct 15:40, Lola Byte v Penny Sterling: WHERE IN THE
  WORLD?, TODAY OR NOT TODAY?, LETTER BY LETTER) and the real Saturday sport snapshot (FULL TIME, 17 Oct, 12 stories,
  the 18:40 snapshot `data/sport-snapshots/2026-10-17T1840`), measured by `tools/pace/variety-report.mjs` (the
  director's own `shot` trace since this round; before it, the stage's cuts named by the quiz director's). The before
  editions were made and recorded with the code as it stood (e0c53e9, a clean export), the after ones with this round's.
- **Every fixture edition on the fake clock**: `tools/pace/variety.mjs` plays an episode through the real v2 director
  (the recorded voices' timing when the episode has them); 40 PAY ATTENTION fixture editions, the 17 Oct FULL TIME
  edition.
- **The owner's two 16 Oct videos**, frame by frame (1 fps contact sheets and the cut list).

## The standard (public/js/variety.js VARIETY; test/visual-variety.test.js)

| | PAY ATTENTION | FULL TIME |
|---|---|---|
| a board, a picture, at most | 15 s (PICTURE THIS's reading board 22 s: its three headlines from the first word that reads them to the last lock-in, the picture sharper at every step) | 12 s, SCORE CENTRE too (two pictures) |
| a studio shot, at most | 12 s | 12 s (planned to 11) |
| a shot, at least | 4 s (the network's floor) | 4 s |
| the same layout twice in a row | never | never |
| kinds of picture in any 60 s | at least 3 | at least 3 |
| cuts a minute | at most 10 (the owner's floor) | at most 10 |

`test/visual-variety.test.js` holds ten PAY ATTENTION fixture editions (every round type, every DOUBLE OR NOTHING, a
stall, a tie-break) and the 17 Oct FULL TIME edition, with its recorded voices' timing
(`test/fixtures/full-time-17oct.json`), to it.

## Before: the repetition, measured

**The owner's 16 Oct videos** (frame by frame):
- PAY ATTENTION (about 343 s of programme): boards 68 % (234 s); one identical wide 16 times (83 s, 24 %); the host's
  single 18 s, a player's 8 s (one player only); no picture or map of its own; the PICTURE THIS board held **32 s**;
  TODAY OR NOT TODAY? alternated the board and the same wide for **87 s**; eight kinds of picture in all.
- FULL TIME (the fixture desk, about 289 s): the presenters 73 % (the over-the-shoulder 141 s, the wide 69 s); boards
  19 % (the scoreline card six times, one layout); the headlines montage text only; no picture or map; Rosa's
  over-the-shoulder held 20 s; the screen behind them always the idle emblem.

**Fresh recordings, the code as it stood** (e0c53e9):

| | PAY ATTENTION (17 Oct 15:40, WHERE / TODAY / LETTERS, host A) | FULL TIME (17 Oct, 12 stories) |
|---|---|---|
| length, shots, cuts a minute, median | 297.9 s, 47, 9.27, 4.85 s | 365.4 s, 45, 7.22, 7.47 s |
| longest shot | PICTURE THIS (DOUBLE OR NOTHING) **26.6 s** | SCORE CENTRE **20.2 s**; the wide 16.2 s and 13.3 s |
| share | boards 64 %, presenters 36 %, pictures 0, maps 0 | presenters **79 %**, boards 16 %, pictures 4 % (text frames) |
| kinds of picture / layouts | 10 / 12 | **6** / 7 |
| the same layout twice in a row | 3 | 2 (the headline frames) |
| fewest kinds in a 60 s window | **2** (TODAY: its board and the wide, from 92 s) | **2** (singles and the wide, from 140 s) |
| most repeated | the quiz's wide, 14 times | the wide, 12 times |
| breaches of the standard | 3 | 5 |

**Every fixture edition, the code as it stood** (40 PAY ATTENTION editions on the fake clock): longest shot
17.2–21.7 s, 94 layouts twice in a row in all, 2–3 kinds in the flattest minute, 9–10 kinds an edition, boards
56–67 %, presenters 33–44 %, pictures and maps none; **all 40 breach the standard**.

**The other programmes, the same measure** (fixtures, fake clock): WORLD NOW (14 stories) 8.33 cuts a minute, median
7.0 s, longest the wide 14.8 s, presenters 47 %, pictures 16 %, maps 32 %, boards 6 %, 8 kinds, the map four times
twice in a row, 3 kinds in its flattest minute; COSMOS DESK 5.3 cuts a minute, median 9.5 s, presenters 94 %, 3 kinds.
PAY ATTENTION and FULL TIME were the two most repetitive programmes on the channel by the kinds they showed (10 and 6
against WORLD NOW's 8 in a programme half as long) and by their flattest minute (2).

## What was added

**PAY ATTENTION** (`public/js/scenes/cards-quiz-more.js`, `public/js/quizdirector.js`, `public/js/quizplay.js`,
`studio/quiz.js`; host B in every framing):
- **round transitions**: each round's card is its emblem (sixteen pixels: the picture, the letters, the pin, the
  calendar, the counter, the sudden death), its name at 2x, its rule, and from round two the scores so far;
- **reveal views**, a question's second picture: PICTURE THIS's picture full width with the right headline in gold and
  its credit; WHERE IN THE WORLD?'s map zoomed onto the right pin; LETTER BY LETTER's answer **as it aired** (the
  programme, the day and the time, who named it, the source); HOW MANY?'s figure at 3x on a number line with both
  guesses ("REPORTED");
- **PICTURE THIS opens on its picture alone** across the frame (cleared pictures only), the frame said over it;
- **the half-time race**: the scores line on its own board, the bars, each round's points, who leads by how many, the
  quick replies over it;
- **the studio**: a tighter wide of both desks, the host's two-shot with each player (a reaction in turn with the
  player's single), TODAY OR NOT TODAY?'s verdicts on the scorer's two-shot, the host's single, the wide and the tighter
  wide in turn; a push on the welcome's wide, a pull on the sign-off's (two moves, never more);
- **the cut budget**: the owner's 10 cuts a minute over the edition (a later opening picture only when the edition has
  room for its cut, `affordCut`; the half-time scores on the wide with the strip in a minute already full).

**FULL TIME** (`server/sport/stats.js`, `server/sport/shape.js`, `public/js/scenes/cards-sport-more.js`,
`public/js/director.js`, `public/js/v2/canvas25d/direction/shots.js`, `public/js/graphics/index.js`):
- **the sport's slate** at each turn of the running order, **MOMENT OF THE DAY**'s title board;
- **WHERE THEY STAND** and **THE RUN** from the story's own words, the side the sentence names (never a table, a run or
  a side the story does not state: §3.6);
- **SCORE CENTRE in two pictures**, the stadium's board then the wall of results, turning on the row nearest the middle
  of its voice (a timer when the voice's marks do not come);
- **the results ticker**: the results read so far, the winner first, then COMING UP's fixtures once read;
- **the screen behind them**: a result story's result in words (never a plate, never another number);
- **the studio**: a presenter-only story turns on the wide; the two-way, Rosa's answer on the two-shot after the
  question's wide (inside the answer when the question is short); the two-shot where an over-the-shoulder would frame
  the bare emblem; studio shots planned to 11 s, every single still past it split on a sentence or a phrase;
- **the headline frames** of a picture-less story carry its sport's emblem (racing's horseshoe added to the icons);
- **credits**: a board on its own ground (the slate, the chalkboard, COMING UP) no longer carries the story's FILE
  credit.

## After: the same measures

| | PAY ATTENTION (17 Oct 15:40, LETTERS / PICTURE / WHERE, host B) | FULL TIME (17 Oct, the same snapshot) |
|---|---|---|
| length, shots, cuts a minute, median | 294.4 s, 46, 9.17, 4.77 s | 376.4 s, 55, 8.61, 6.70 s |
| longest shot | PICTURE THIS's reading board 22.0 s (its rule); the longest studio shot 7.4 s | SCORE CENTRE's board 10.6 s; the longest studio shot 10.3 s |
| share | boards 58 %, presenters 30 %, pictures 6 %, maps 6 % | presenters 68 %, boards 23 %, pictures 10 % |
| kinds of picture / layouts | **16** / 19 | **13** / 16 |
| the same layout twice in a row | **0** | **0** |
| fewest kinds in a 60 s window (mean) | **3** (5.6) | **4** (5.4) |
| most repeated | the quiz's wide, 9 times | Kai's single, 10 times |
| breaches of the standard | **0** | **0** |

(The desk planned a different PAY ATTENTION from the same archive at the same hour: LETTERS, PICTURE, WHERE. TODAY OR
NOT TODAY?, the old worst minute, is measured on the fixture editions: its verdicts now rotate through four pictures.)

**Every fixture edition** (40 PAY ATTENTION editions): longest shot 14.8–21.5 s (only PICTURE THIS's reading board past
15 s), the longest studio shot 8.1–11.9 s, **0** layouts twice in a row, **3–4** kinds in the flattest minute,
**14–16** kinds an edition, boards 51–64 %, presenters 29–40 %, pictures 4–8 %, maps 0–6 %, 8.85–9.99 cuts a minute,
median 4.5–5.9 s; **none breaches the standard**. The 17 Oct FULL TIME edition with its recorded voices' timing holds
it on the fake clock too (`test/visual-variety.test.js`).

## Hostile critique

Five categories, each scored on the recordings (one frame a shot, contact sheets) and the measures; **the round's score
is its lowest category**.

### Round 1: 9.0 (editorial integrity)

Judged on the first after recordings (FULL TIME v1, PAY ATTENTION), the lab boards and the fixture editions.

| Category | Score | The critic |
|---|---|---|
| Pacing | 9.3 | Two fixture editions of PAY ATTENTION ran 10.2 and 10.5 cuts a minute, over the owner's 10: the opening picture, the half-time race and a wide for two quips all cut. A closing wide planned at 11.5 s aired 12.1 s. FULL TIME's SCORE CENTRE turned to its wall at 8.1 s and left the wall 12.2 s. A two-way's question stood 2.1 s on the wide. |
| Visual variety | 9.6 | Better by every measure, but the picture round is 64 s of board in 96 s (three PICTURE THIS boards of 20–22 s). FULL TIME is still 68 % presenters. |
| Editorial integrity | **9.0** | The story's FILE credit sat in the corner of the sport's slate (TENNIS, WNBA): a picture credited that no one can see. |
| Craft | 9.2 | The headline frames' 7x emblem ran into the top caption's plate; WHERE THEY STAND's credit sat under its own orange box; the scores wall's third row covered its credit. |
| Host B | 9.8 | Theo Tally in every framing; the two-shots are composed on look B's metrics. |

**Fixed**:
- the credit: a board on its own ground (the slate, the chalkboard, COMING UP) shows no picture and carries no credit
  (`graphics/picture.js`, tested);
- the layouts: WHERE THEY STAND's height, the wall's height by its rows, the emblem at 6x at the frame's right edge under
  the captions' two rows;
- the cut budget: the half-time race keeps the players' quick replies, the closing wide's cap 11.5 s and the sign-off's
  hold shorter when the closing shot would pass 12 s, a later opening picture only when the edition has room for its cut
  (`affordCut`), the half-time scores on the wide with the strip when the minute is full; ten fixture editions now run
  8.9–10.0 cuts a minute (`test/pay-attention-wiring.test.js`, `test/visual-variety.test.js`);
- SCORE CENTRE turns on the row nearest the middle of its voice (10.6 s, then 9.7 s);
- the two-way's short question: the answer opens on the same wide and turns to the two-shot once the wide has held 4 s.

**Not changed, and why**: PICTURE THIS's reading board stands by the bible's reading rule (the options on screen from
the first word that reads them to the last lock-in); its picture sharpens on every step, the lock-ins land on it, its
frame is on the picture alone or a face, its reveal on the reveal view. FULL TIME's share of presenters follows from the
desk's material (4 of 12 stories had a picture): no board shows a fact the stories do not state.

### Round 2: 9.75 (pacing, craft)

Judged on the final recordings (both editions re-recorded with every fix, on the channel as it now airs: the channel's
ident with its AI disclosure before the programme, nothing over it; they are the owner's videos, shot for shot the same
timelines as the first after recordings) and the 40 fixture editions.

| Category | Score | The critic |
|---|---|---|
| Pacing | **9.75** | Every recording and fixture edition at or under 10 cuts a minute (the busiest fixture 9.99: no margin to spare), nothing under 4 s, no studio shot past 12 s (FULL TIME's longest 10.3 s), SCORE CENTRE in two even halves. Deducted: PICTURE THIS's reading boards still stand 20–22 s, by rule. |
| Visual variety | 9.8 | PAY ATTENTION 16 kinds (was 10), FULL TIME 13 (was 6); never the same layout twice in a row (was 3 and 2); the flattest minute 3 and 4 kinds (was 2 and 2); pictures and maps on PAY ATTENTION for the first time. Deducted: the quiz's wide is still its most repeated shot (9 times), FULL TIME 68 % presenters. |
| Editorial integrity | 9.85 | The table and form boards show a story's own words about the side the sentence names, never a run that ended or is still to come; the ticker carries only results already read, winner first; credits only with their picture; no betting, no grave story with a board. |
| Craft | **9.75** | The emblems clear of the captions and the chip, every board inside its panel, the reveal views' gold only where right, the cuts on words. Deducted: the PICTURE THIS opening picture at its first step reads as a coarse mosaic for 4 s (it is the game: the picture sharpens), and a slate replaces a story's opening picture when the running order turns. |
| Host B | 9.8 | Theo Tally in the welcome, the questions, the two-shots and the sign-off's pull. |

**Round score: 9.75**, above the gate.

## Still open

- **PICTURE THIS's reading board** (20–22 s): the reading rule keeps the options up to the last lock-in; a players' inset
  on the board during the countdown (their faces without leaving the options) would break the hold without a cut.
- **FULL TIME's presenters' share** falls only with more of the desk's own material: the picture desk found pictures for
  4 of 12 stories on 17 Oct (none in the first run, when its Wikimedia titles step timed out); stat comparisons and a
  match centre need data the desk does not read yet (line-ups, possession), and a venue card a venue the stories state.
- **The busiest fixture edition sits at 9.99 cuts a minute**: any new optional cut in PAY ATTENTION must ask `affordCut`.
