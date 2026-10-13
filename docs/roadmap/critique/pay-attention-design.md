# PAY ATTENTION — design critique log (programme #2)

The owner's process (13 Oct):

1. find the niches and design the next programme, with a repertoire that never feels repetitive;
2. a hostile self-critique, fixing every fault;
3. build;
4. then the next programme.

**Nothing passes below 9.7.** The niche study ranked a news quiz second (`docs/roadmap/NEW_PROGRAMMES.md` §3, 83 of 100),
behind sport (FULL TIME, built). This log is step 2 for the quiz's design: `docs/programmes/pay-attention.md`.

## The panel

- a senior quiz-show producer;
- a standards and legal editor;
- a senior broadcast director;
- a lead pixel artist;
- a first-time viewer.

Each category is scored 0–10; **the round's score is the lowest category.** The categories are the same in every round:

- **Editorial truth**: nothing false on screen or in a voice.
- **Standards**: what is never asked, and the grave-day rule.
- **Game**: is it fun, is there tension.
- **Variety**: the repertoire across a week.
- **Data viability**: can the archive feed it.
- **Craft**: look, sound and timing.
- **Consistency**: does the bible agree with itself and with the code.

## How it was looked at

- **Rounds 1–4** read the design on paper. They checked it against the niche study, the channel's bibles (WORLD NOW, COSMOS
  for UNIT-8, FULL TIME's standards) and how broadcast quizzes work.
- **Rounds 5–7** checked it against the code and the data:
  - **The archive.** `data/archive/` holds the development channel's ten hours of 12 Oct (14:00–24:00 London, five
    programmes, 714 real airings, 269 distinct real stories) and the morning of 13 Oct. The development runs' fixture
    stories, whose links are not web addresses, were left out.
  - **Measured with scripts**: eligibility under the bible's own exclusions, pictures, places, figures and quotes, and how
    many headlines are cut from the source's title. Also the grave and serious shares in every six-hour window, and how
    often one grave story leads.
  - **A model of the edition planner**: the pool per pairing, and which editions fit an afternoon and evening.
  - **The rest of the code**: the palette's contrast ratios (WCAG formula); `config/channel.json` (presenters, experts,
    rotation, dayparts); the fields `server/archive.js` records; `public/js/set.js` THEMES.

---

## Round 1 — the first draft

Faults:

1. **TRUE OR FALSE.** The desk wrote statements and half were false: a false statement on screen by design. (Standards.)
2. **HOW MANY? as multiple choice.** Its distractors were the true figure ×10 and ÷10: invented figures. (Standards.)
3. **WHO SAID IT? offered names.** The two wrong names put words beside people who never said them. (Standards.)
4. **Political quotes were allowed.** (Standards.)
5. **Grave stories were eligible** "for their non-grave facts": a question about the rainfall in a flood that killed
   people. (Standards, producer.)
6. **Contestants were asked about their own programme's stories.** (Producer.)
7. **Experts played**: a health correspondent who fails a health question. (Producer.)
8. **Nothing was measured.** The draft assumed the archive could feed any round. (Producer.)
9. **No rule for a grave news day.** (Standards.)
10. **No rotation**: the same four rounds every edition. (Producer, first-time viewer.)
11. **Length unchecked.** Four rounds of six questions run about nine minutes. (Director.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 4.5 | 1, 2, 3 |
| Standards | 5.0 | 5, 9 |
| Game | 7.0 | — |
| Variety | 6.0 | 10 |
| Data viability | 5.5 | 8 |
| Craft | 7.0 | 11 |
| Consistency | 7.5 | — |

**Round score: 4.5.**

## Round 2 — the second draft

**Fixed**:

- no TRUE OR FALSE; every option a real item from today's news;
- HOW MANY? options became real figures from other stories;
- WHO SAID IT? offers roles, not names;
- no politics in quotes;
- grave stories never asked;
- no contestant asked about their own programme's stories;
- presenters only;
- a first measurement of the archive;
- a grave-day rule;
- three of five rounds an edition;
- a 5–7 minute shape.

Faults:

1. **HOW MANY? with other stories' figures.** A phone's price beside a count of trees: the wrong options gave themselves
   away by their units, and the round was no game. (Producer.)
2. **Spoken guesses heard as facts.** A contestant's "It was twelve thousand" in a presenter's own voice is heard as news.
   (Standards.)
3. **No hook.** Right or wrong, then the next question: no ritual, no stake, no reason to stay to the end. (Producer.)
4. **Nothing persists.** Every edition stands alone, and there is no rivalry to follow. (Producer.)
5. **The tone on a heavy news day was undefined.** (Standards, director.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 7.5 | 2 |
| Standards | 8.0 | 5 |
| Game | 7.5 | 1, 3 |
| Variety | 8.0 | 4 |
| Data viability | 8.0 | — |
| Craft | 8.0 | — |
| Consistency | 8.5 | — |

**Round score: 7.5.**

## Round 3

**Fixed**:

- HOW MANY? has no options; each guess is labelled GUESS;
- every wrong answer is a guess in form;
- DOUBLE OR NOTHING;
- the weekly table;
- a first form of the grave-day rule: "a breaking story in the last six hours, or more than 40 % grave or serious".

Faults:

1. **Option layout.** Three headlines as plain text lines, with no tiles and no letters: nothing for a lock-in to point
   at. (Pixel artist.)
2. **The countdown was shorter than the time to read the options.** (Director, first-time viewer.)
3. **A predictable model.** The stronger player always won. (Producer.)
4. **The host's cost and approval were unstated.** (Producer.)
5. **The countdown's tick was off the bed's tempo.** (Director.)
6. **TODAY OR NOT TODAY was ambiguous** for a story that aired on two days. (Standards.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 9.0 | 6 |
| Standards | 9.0 | — |
| Game | 8.8 | 3 |
| Variety | 9.0 | — |
| Data viability | 8.8 | — |
| Craft | 8.8 | 1, 2, 5 |
| Consistency | 9.0 | — |

**Round score: 8.8.**

## Round 4

**Fixed**:

- lettered tiles on up to two lines;
- the countdown at least the reading time;
- variance targets for the model;
- the host as a new character for the owner;
- the countdown on the bed's grid;
- TODAY means the day a story first aired.

Faults:

1. **Player identity was colour only.** (Pixel artist, first-time viewer.)
2. **Captions against the board.** (Director.)
3. **DOUBLE OR NOTHING could be won by the leader at double points.** (Producer.)
4. **Thin early afternoons.** Fixed with "at least 24 eligible stories since 06:00", airing 14:00–23:00 only. (Producer.)
5. **Figures corrected between airings.** (Standards.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 9.4 | 5 |
| Standards | 9.5 | — |
| Game | 9.4 | 3 |
| Variety | 9.5 | — |
| Data viability | 9.4 | 4 |
| Craft | 9.4 | 1, 2 |
| Consistency | 9.5 | — |

**Round score: 9.4.**

After round 4's fixes, the bible's first draft announced a pass: "round 5: 9.75". **The panel refused it.** Not one number
in it had been checked against the code or the archive. Round 5 is that check.

## Round 5 — against the data and the code

The bible was measured against itself. Each claim was run against the archive with the bible's own exclusions, against
`server/archive.js`'s fields, against the palette and against the channel's config.

Faults:

1. **The measurement had not applied the bible's own exclusions.** "167 non-grave stories, 162 with a picture, 108 with a
   place, 37 with a quote, 19 with a figure" counted crime, politics, war and hardship as eligible. Among them were "Both
   Russia, Ukraine are using AI-powered drones", "UK PM Andy Burnham met Man City chairman", "Roofing scammers con
   homeowners out of thousands of pounds" and "I earn £120,000 a year making social media videos go viral".
   - With the exclusions, the ten hours give **30 usable stories**: 4 with a usable place, 4 figures (2 usable), 7 quotes.
   - The "full day of five programmes" was ten hours of the development channel. (Producer, standards.)
2. **The grave-day rule would have stopped the quiz on an ordinary day.** 41.6 % of 12 Oct's stories were read grave or
   serious, and 37–40 % in every six-hour window: serious news is most news. Counting only what was read grave, the day
   peaked at 14.1 %. (Standards, producer.)
3. **WHO SAID IT? cannot be built.** The archive's quote holds `by`, a name only ("Kirby", "Mendoza", "the company"), and
   no role. The quotes are clipped with "…", and several are from private people. Its role tiles ("A SPACE AGENCY
   CHIEF") would have been the desk's own descriptions: new text, never checked. (Standards.)
4. **HOW MANY? cannot be built as a round.** There were 4 eligible figures in ten hours, two with broken labels ("300
   NOT", "$49 BASECASE"). The round needed four, plus a figure for the tie-break. (Producer.)
5. **Two of five rounds unbuildable leaves the same three every edition**, against the owner's "no repetition".
   (Producer, first-time viewer.)
6. **The own-programme rule starves the quiz.** A WORLD NOW and TECH BYTES pairing left 10 of the 30 usable stories.
   The rule also went by airing, not by story, though NEWS IN 60 retells WORLD NOW's stories. With "never asked twice a
   day" and four editions, the pool would run out before the evening. Measured with the model: one day, one pool, no
   edition at 16:00, two after it. (Producer.)
7. **The desk would have rewritten headlines into questions.** The bible's own examples, "How many trees will Paris
   plant?" and "Where did archaeologists find…?", are new sentences that nobody checked when they aired. (Standards.)
8. **The Paris example breaks the bible's own politics rule**: a city government's plan. (Standards.)
9. **Broken headlines.** 22 of 57 non-grave aired headlines are the opening words of the source's title, and some stop
   mid-thought: "Chinese carmakers increasingly rely", "Mechanism's first Switch 2 case is as awesome". The channel's
   `isFragment` does not catch them. An option that is a broken sentence. (Standards, first-time viewer.)
10. **The options were not covered by the exclusions.** §3.1 said "never asked about": a grave headline could have aired as
    a wrong option. (Standards.)
11. **TODAY OR NOT TODAY**: round 4's fix ("first aired") was never written into the bible. A headline naming its day
    ("starts tomorrow", "2026") gives the answer away. (Standards, producer.)
12. **Holes in the exclusions**, found in the strict list:
    - a private person's earnings;
    - a match preview with predictions;
    - politics through an abbreviation ("UK PM");
    - "flop" stories about a named person's work ("Tom Cruise film Digger forecast to become one of Hollywood's biggest
      flops"): a game must not laugh at a real person;
    - reviews written in the first person.
    
    (Standards.)
13. **Inconsistencies inside the bible** (consistency):
    - §7 "HOW MANY? needs two", against §4's four questions a round;
    - PICTURE THIS had four steps but three point values;
    - 4 × 18 s against a 70 s round;
    - the reading rule (every option twice at the captions' pace) asked for 20 s against a 6 s countdown;
    - wrong character names in its examples ("Penny Pound", "Max Byte").
14. **The purple is too dark to be an accent on a dark set.** `P.purple` against `P.black` is 2.0:1 and against `P.ink`
    1.6:1, so as an edge light it vanishes. TECH BYTES dresses its set in purple and magenta rings, and COSMOS glows
    purple. (Pixel artist.)
15. **A letter clashes with the tiles.** "Each player is told apart by a letter" beside tiles lettered A, B, C: Ada's
    letter is A. (Pixel artist, first-time viewer.)
16. **The rotation rule "every type at least twice a day" cannot hold** when the data drops a type. (Consistency.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 8.0 | 7, 9 |
| Standards | 6.0 | 2, 10, 12 |
| Game | 8.0 | — |
| Variety | 6.0 | 5 |
| Data viability | 5.0 | 1, 3, 4, 6 |
| Craft | 7.5 | 14, 15 |
| Consistency | 6.5 | 13, 16 |

**Round score: 5.0.**

## Round 6 — the redesign

What changed:

1. **The material is the last seven days, today first.** At least five of an edition's ten questions are from the last 24
   hours, and the reveal says when the rest aired. A story is asked once a week. The quiz needs three days of archive.
   - Measured: by 13 Oct at 14:00, with one earlier day of archive, the pool was 50 stories. Every pairing holds 26–37.
2. **Eligibility goes by event.** If any airing of an event is grave, serious or excluded, the whole event is out. The
   exclusions now cover disasters without victims, fraud and scams, every form of politics, people's earnings, betting and
   predictions, hardship, a named person's failure, and reviews. **The options follow every rule the questions do.**
3. **The grave-day rule is calibrated.** It stops the quiz on any of three signals:
   - a grave breaking story in the last six hours;
   - more than 25 % read grave in six hours;
   - one story with people harmed leading WORLD NOW or NEWS IN 60 four times in six hours.
   
   12 Oct peaked at 14.1 % grave, and no severity-3 story led more than twice.
4. **WHO SAID IT? is dropped**, and why is recorded. It returns only if the archive keeps the speaker's role.
5. **LETTER BY LETTER** replaces it: the aired headline in tiles, filling in on the beat, first to buzz. It is data-rich
   (any usable story), visual, and a game the viewer plays too. A wrong buzz is a stall, so no wrong headline is ever
   spoken.
6. **HOW MANY? stays as a fifth type**, only when the pairing's pool holds three usable figures. It shows the aired
   sentence with the figure masked, so nothing is rewritten.
7. **The words are the channel's own.** A question is the aired headline verbatim in a fixed frame. A broken cut is
   replaced by the source title (up to 72 characters) or not used.
8. **Three questions a round**, with timings per round type. The reading rule is now characters ÷ 12 + 1.5 s, and every
   round meets it.
9. **Purple for fills only**, with white type (8.9:1) and a `P.fog` rim. **Lit is gold** (9.7:1). No purple-and-magenta
   rings.
10. **Players are told apart by shape** (circle, square) and name, never by a letter.
11. **The planner (§7)** builds the whole plan before an edition. If no pairing and three types fit, the quiz does not air.
12. **Two editions a day** (`minGapHours: 4`), in a slot after COSMOS, 14:00–23:00 London.
13. **A game, not a contest**: no prize, no entry, no phone line; scripted between the channel's characters.

The panel's faults on the redesign:

1. **TODAY and EARLIER had no fair boundary.** A headline from 23:50 yesterday beside one from 00:10 today: no viewer can
   tell them apart. (Producer, first-time viewer.)
2. **WHERE could mix a city and a country** among its options: a hint, and an unfair comparison. (Producer.)
3. **The planner would fill the table with the same faces.** Taking the biggest pool always picks the smaller programmes'
   presenters. In the model, Penny played two of three editions. (Producer.)
4. **LETTER BY LETTER's reveal was unspecified.** Random reveals can leave a board of vowels or a word with nothing shown.
   The digits would have been played as letters. (Producer, pixel artist.)
5. **At weekends the quiz would ask what SEVEN DAYS had just told.** (Producer.)
6. **The length had moved and the bible had not.** The new shape runs 300–330 s, but the bible still said "5–7 minutes,
   [300, 420]". (Director, consistency.)
7. **DOUBLE OR NOTHING had nothing to play** when the one type not played cannot be filled, as with WHERE on the archive's
   first day. (Consistency.)
8. **HOW MANY?'s exact bonus was unfair for a qualified figure.** An exact guess of "about 30" or "up to 40 %" is luck,
   and the mask could hide the qualifier. (Producer, standards.)
9. **Options from the players' own programmes would be free eliminations.** (Producer.)
10. **A place inferred from a company's home country** ("CMF's first wireless speakers…: INDIA") is no "where" at all.
    (Standards.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 9.7 | 10 |
| Standards | 9.6 | 5, 10 |
| Game | 9.3 | 1, 4, 8 |
| Variety | 9.2 | 3 |
| Data viability | 9.5 | 7 |
| Craft | 9.6 | — |
| Consistency | 9.4 | 6, 7 |

**Round score: 9.2.**

## Round 7 — after the fixes

1. **TODAY** means first aired since 06:00 London today. **EARLIER** means last aired two to seven days ago. Yesterday's
   stories are never used.
2. **WHERE's options are all of one kind**: three countries or three cities, in three regions.
3. **Seats are shared out.** Each presenter plays at most once a day (twice only when nothing else fits), and seats go to
   whoever has played least this week. In the model the three editions then went to five different presenters, and all
   three still fitted.
4. **LETTER BY LETTER's reveal is defined.** Every word's first letter, the digits and the punctuation show at once.
   Then a quarter, a half and three quarters of the other letters follow, in a seeded order that never leaves a word
   unrevealed past the second stage.
5. **At weekends**, no story SEVEN DAYS told in its latest edition.
6. **Length: 300–330 s** at the voices' rate (`targetSeconds [290, 360]`). An edition under 300 s takes a fourth question
   in its last round.
7. **DOUBLE OR NOTHING falls back to PICTURE THIS**: every usable story on 12 Oct had a picture.
8. **HOW MANY?'s exact bonus is only for a figure that aired without a qualifier**, and the qualifier stays visible
   beside the mask.
9. **No option from either player's programme.**
10. **A usable place is named in the aired text, but not in the headline, and is where the story happens.**

The whole bible was re-read against the measurements:

- every number in it is one of this log's;
- every code name in it exists: `server/archive.js` fields, `isGrave`, `severity`, `placeSupported`, `recentLinesHours`,
  `scenes/worldmap.js`, the dayparts, `P.purple`, `P.yellow`, `P.fog`, `P.slate`;
- the presenters' and experts' names match `config/channel.json`.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial truth | 9.9 | nothing is generated, but the quiz inherits the aired headlines' own faults: they were checked when they aired, and a bad cut is caught only by the clause-boundary list |
| Standards | 9.8 | the exclusions are word lists, so the step-1 gate checks every question and option by hand. The grave-day thresholds are calibrated on one ordinary day; no real grave day is recorded yet |
| Game | 9.75 | the contestants are a model: the tension rests on its variance (measured in step 2) and on the voices' delivery (step 6). No studio audience, by rule |
| Variety | 9.75 | four round types most weeks can fill, plus HOW MANY? when the week has figures (2 usable in ten hours); 25 pairings; the frames' banks decide how a week sounds |
| Data viability | 9.75 | measured on a day and a half of the development archive, with a model that counts stories, not each option's source. The step-1 gate records and checks three real days |
| Craft | 9.8 | the palette has one purple, and it is dark. As a fill with a rim it works; a lighter purple would need a colour from outside ENDESGA 32's |
| Consistency | 9.9 | — |

**Round score: 9.75. Passed.**

## Carried to step 1 (the question desk)

- The exclusion lists as code, with the 12 Oct measurement as their first test: the 30 usable stories, and the
  out-of-kind ones named in round 5.
- Eligibility by event (`archive.week` with `sameStory`), the headline-cut check, and the give-away checks for WHERE and
  TODAY OR NOT TODAY.
- The five round kinds with their options, under the reading rule's character limits.
- The grave-day rule, with its three signals.
- The planner: pairings, fairness, rotation, the three-day minimum.
- The gate's three real days: run the channel to record them, as the 12 Oct soak did.
