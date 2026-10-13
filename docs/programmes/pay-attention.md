# PAY ATTENTION — style bible (design passed, round 7: 9.75)

The week's news as a game on GLOBIT 24 (working title; the owner names it). Owner, 13 Oct: new programmes, planned
systematically; the niche study ranks a news quiz second (`docs/roadmap/NEW_PROGRAMMES.md` §3: 83 of 100). Programmes
must entertain, not only inform. This file builds on `docs/ART_DIRECTION.md` and `docs/programmes/world-now.md` and states
only the differences. The design's critique rounds are in `docs/roadmap/critique/pay-attention-design.md`.

## 1. The idea in one paragraph

Five minutes in which two of the channel's own presenters play a quiz on what GLOBIT 24 told this week, today's news
first, and the viewer plays along at home. Every question comes from a story the channel has already aired and checked
(the archive, `server/archive.js`): its picture, its headline, its place, its figure. **Nothing false is ever on the
screen**: every option is a real headline or a real place from the channel's own news, every answer is shown with its
source and when it aired, and a contestant's wrong answer is always a guess. The fun is the game: a picture that sharpens,
a headline that fills in letter by letter, a pin on the map, a quickfire on today or not today, the scores on the desks, a
rivalry kept in a weekly table. It never makes a game of grief, crime, war or politics, and on a grave news day it does not
air.

## 2. Cast

| | Role | Character | On air |
|---|---|---|---|
| **The host** (new character; name, face and voice for the owner) | Quizmaster | Quick, warm, exact; enjoys the game more than winning it; keeps the score and the facts straight | Asks every question, reveals every answer with its source, keeps the table |
| **Two contestants** | Players | Two of the channel's presenters each edition, from different programmes: Paco, Lola, Max, Ada, Nova, UNIT-8, Penny, Sam and, once approved, Kai and Rosa | Lock in, buzz, guess, banter about themselves and the game |

- **The host is new** and needs the owner's approval of face and voice (as Kai and Rosa did). Until then the quiz cannot
  air; its build can proceed with a placeholder look.
- **Contestants are presenters only.** Never the experts (Omar, Clara, Dev, Amara, Leo, Ines, June, Tomas): an expert who
  fails a question in their own field would undercut the authority they bring to the news programmes. Never the
  correspondents.
- **A contestant is never asked about a story their own programme aired**, at any airing. The rule follows the story,
  not the airing: NEWS IN 60 retells WORLD NOW's stories, so a story both aired belongs to Paco, Lola and Sam alike. "The
  anchor who did not know his own news" is not a joke the channel tells about itself. The questions come from the other
  programmes' stories ("out of my patch").
- **Options follow the same rule.** No option comes from either player's programme. An option a player knows to be wrong
  would be a free elimination.
- **Pairings**:
  - never two from the same programme (Paco and Lola, Max and Ada, Nova and UNIT-8);
  - never the same pair within three days;
  - each presenter plays at most once a day, or twice when no other pairing fits;
  - among the pairings the data allows (§7), the seats go to whoever has played least this week, so the presenters of the
    smaller programmes do not fill the table. Their exclusion costs the planner least: on 13 Oct a MONEY MINUTE and NEWS IN
    60 pairing left 34 stories, a WORLD NOW and TECH BYTES pairing 26.
- **UNIT-8** plays deadpan, never laughs (COSMOS's bible) and loses gracefully.
- **Personalities come from their own bibles**, in reaction banks of their own (12 each, none again within six hours, the
  station's `recentLinesHours`):
  - Paco dignified and dry; Lola warm and competitive;
  - Max eager; Ada precise ("Approximately is not a number");
  - Nova dreamy; UNIT-8 literal;
  - Penny wry about money; Sam laid-back.
  
  They joke about themselves, the game and each other, **never about a story's subject or a real person**.
- **Seated**: the host at a centre podium, the contestants at two desks either side (the channel's seated poses and
  gestures; no new walk).

## 3. Editorial: what may be asked

### 3.1 The material

- **Only what the channel aired**, never the raw feeds. It comes from the archive, which keeps 14 days: the aired text and
  headline, the source's title, the picture, the place, the figures, the programme and the time.
- **The window is the last seven days, today first.** At least half of each edition's questions (five of ten) are on
  stories first aired in the last 24 hours. The rest come from earlier in the week, and the reveal says when they aired
  ("AS TOLD ON TUESDAY'S COSMOS"). A day alone is not enough material (measured below). The quiz needs **at least three
  days of archive**, so a fresh station does not air it on its first days.
- **Eligibility goes by event, not by airing.** The archive groups a story's airings by event (`archive.week` with the
  desk's `sameStory`). An event is eligible only when every airing passes all of these checks:
  - it was not read grave or serious (the archive's `grave` and `serious`);
  - it is not grave by `server/facts.js` `isGrave` on title, summary and text;
  - it is not in an excluded kind (below).
  
  One airing out puts the whole event out: a launch that later failed, a story that later turned to a death.
- **Never asked about, never shown as an option**:
  - deaths, injuries, casualties;
  - disasters and accidents of any kind, with or without victims (a fire, a flood, a storm, a crash);
  - crime, fraud, scams, tax evasion, courts, police, investigations;
  - war, armed forces, weapons (drones in a war included), terrorism;
  - illness, surgery or the health of a named person, and health tragedies;
  - children in any news role;
  - private people, their earnings and their homes;
  - politics in every form: elections, parties, governments, ministers, mayors, policy, trade disputes, tariffs,
    sanctions, protests, migration;
  - people's money: salaries, earnings, fines, damages, compensation;
  - betting, odds, tips and match predictions;
  - hardship: closures, job losses, shortages, a struggling club or firm;
  - a named person's failure or embarrassment: a flop, a bad review, a gaffe (a game never laughs at a real person);
  - reviews and first-person pieces ("as awesome as I hoped");
  - notices, job adverts, countdowns and promotions ("Job opportunities: NASA office of general counsel", "48 hours to…");
  - anything that is not a headline: a headline says what happened, so a picture caption with no verb ("Transporter-18
    SmallSats Encapsulation") is not one.
- **What the archive holds**, measured on 12 Oct. That is the development channel's ten hours, 14:00–24:00 London, five
  programmes and 269 distinct real stories:
  - 112 were read grave or serious;
  - 12 more are grave by text;
  - about 110 fall in an excluded kind;
  - 6 have a broken headline (§3.2).
  
  That leaves **30 usable stories in ten hours**, all with a picture: **4 with a usable place** (§4.1), **4 figures (2
  usable)** and **7 quotes, none with the speaker's role**. With the morning of 13 Oct the pool at 14:00 was 50 stories,
  6 of them with usable places.
- **The list is matched with care.** Harm, disasters, crime, conflict and betting count anywhere in a story. The other
  kinds are judged on its subject (headline, title, opening sentences): "The government says…" in a tunnel story's second
  sentence does not make it politics. Senses that only look excluded pass: deep time and history ("Roman troops"), cells
  ("destroys fat cells"), sky and space ("asteroid collisions"), "earns a draw", "bets on nostalgia". (Step 1's log,
  `docs/roadmap/critique/pay-attention-desk.md`, has what the lists caught and missed on real data.)
- **A story is asked at most once in seven days**; once asked it may still appear as an option. A story asked in an
  edition is never an option earlier in the same edition.
- **At weekends**, no story that SEVEN DAYS told in its latest edition: the viewer has just heard it.

### 3.2 Nothing false on the screen

- **Every option is real**:
  - three real headlines of eligible events (PICTURE THIS);
  - three real countries (WHERE IN THE WORLD?): the week's eligible story places first, then a fixed list of 49
    well-known countries in seven regions, never one named by a story the week left out;
  - real headlines of eligible events (TODAY OR NOT TODAY?).
  
  **No invented headline, place, figure, quote or statement, ever**, including as a wrong answer.
- **The words are the channel's own.** A question shows the aired headline verbatim inside a fixed frame ("Which story is
  this picture from?", "Where in the world is this story?"). The desk never rewrites a headline into a question: a new
  sentence is a new fact nobody checked when it aired.
- **Headlines that broke.** An aired headline is often the opening words of the source's title (22 of 57 non-grave stories
  on 12 Oct). It is used only when it stops at a clause boundary: the title goes on after a comma, a dash or a colon, or
  with a phrase opener from a checked list ("after", "ahead of", "at", "during", "over", "this week"…). Otherwise the
  quiz uses the source's title when it fits 72 characters, or does not use the story at all. Never "Chinese carmakers
  increasingly rely" (12 Oct; the title goes on "on overseas markets as September exports surge").
- **HOW MANY? has no options.** It shows the aired sentence with its figure masked; the qualifier stays visible ("UP TO
  ▮▮ MORE"). The players guess aloud and the screen labels each guess **GUESS** beside the player's name. The reveal
  shows the figure exactly as it aired, with its label, its source and when it aired ("AS REPORTED ON MONEY MINUTE,
  MONDAY 14:20").
- **A wrong answer is always a guess in form.** A player says a letter, a place or a number as a guess ("I'll go for B",
  "My guess is Madagascar", "Thirty per cent?"), never as a statement, and the host's reveal states the fact. In LETTER
  BY LETTER a wrong buzz is a stall ("I buzzed. Why did I buzz?"), **never a wrong headline spoken aloud**.
- **Corrections.** When a story's figure or place changed between airings, the question uses the latest aired version and
  says when ("AS REPORTED AT 18:00"). A figure that aired with two different values in one hour is not used.
- **No give-aways**:
  - WHERE's headline never shows the place, its country or its people (`server/gazetteer.js` `placeSupported`). When the
    headline names them, those words are masked with one mask's length for every name ("F1 in ▮▮▮▮▮: There's new fastest
    car now"), and the reveal shows the headline whole;
  - TODAY OR NOT TODAY's headlines name no day, date or year, and no "tomorrow" or "tonight".

### 3.3 When the quiz does not air

- **A grave news day.** The quiz is a game; the channel does not play games beside a tragedy. Any one of these stops it:
  - a breaking story that is grave (`severity` 2 or more) aired in the last six hours;
  - more than 25 % of the stories aired in the last six hours were read grave (the archive's `grave`);
  - one story in which people were harmed (`severity` 3) led WORLD NOW or NEWS IN 60 four or more times in the last six
    hours.
  
  Calibration: 12 Oct, an ordinary heavy day, peaked at 14.1 % grave in any six hours, no severity-3 story led more than
  twice, and nothing was breaking. The first draft's rule, "more than 40 % grave or serious", would have stopped the quiz
  on that ordinary day: 41.6 % of its stories were read grave or serious, and 37–40 % in every six-hour window.
- **The plan does not fit** (§7).
- **Overnight** (23:00–14:00 London): the quiz is an afternoon and evening programme.
- **The archive is unreadable**, or holds fewer than three days.

In each case the station plays the next programme in the rotation.

### 3.4 A game, not a contest

PAY ATTENTION is scripted entertainment between the channel's characters. There is no prize, no viewer entry, no phone
line, no "text in" and nothing to win; the viewer plays along for fun. The players' answers come from their model (§4.2).
The host never calls the game live and never suggests a real contest.

## 4. Shape and running order

| Segment | Who | What | Budget |
|---|---|---|---|
| Open | — | The title (§6) | 8 s |
| Welcome | Host | Greets and introduces tonight's two players by their programmes ("From MONEY MINUTE, Penny Sterling; from COSMOS, Dr Nova Reyes"), with the week's standing between them if they have met | 22 s |
| **Round one** | All | One round type (§4.1), three questions | 65–83 s |
| **Round two** | All | Another type, three questions | 65–83 s |
| Scores | Host | The scores on the board; a line of banter each | 15 s |
| **Round three** | All | Another type, three questions (TODAY OR NOT TODAY: six headlines) | 60–83 s |
| **DOUBLE OR NOTHING** | Trailing player | The round type not played tonight. The trailing player picks the desk (one of two offered). One question at double points (TODAY OR NOT TODAY: three headlines); the leader may answer too, for single points | 35 s |
| Result and the table | Host | The winner; the week's table (persisted, §5) | 22 s |
| Sign-off | Host | "That's PAY ATTENTION…" and when the next edition airs | 8 s |

- **Length: 300–345 s** at the voices' 15 characters a second, and up to 360 s with a tie-break (`targetSeconds [290,
  360]`). Measured on twenty editions written from the real archive (step 2): 308–343 s, and 360 s with a tie-break.
- **The reveal is short.** The source and the airing are always on the screen. The host says them at every third reveal
  and always for a figure, so the game keeps moving; a spoken credit on every reveal cost about 25 s an edition.
- **The reading rule.** The options stay on screen from when the host starts reading them to the last lock-in, for at
  least their characters ÷ 12 + 1.5 s:
  - PICTURE THIS: three 50-character headlines need 14 s and are on screen 17.5 s;
  - WHERE IN THE WORLD?: three place names (about 30 characters) need 4 s and are on screen 9 s;
  - TODAY OR NOT TODAY?: one headline needs 5.7 s and is on screen 7.5 s.
- **Rounds rotate.** Each edition plays three of the round types the plan can fill, never the same three as the edition
  before, in a different order. **Data comes first**: a type the plan cannot fill is not chosen.
- **DOUBLE OR NOTHING** falls back to PICTURE THIS when the type not played cannot be filled (pictures: 30 of 30 usable
  stories on 12 Oct).
- **Ties** are broken by a sudden-death LETTER BY LETTER headline, never a coin toss. If neither player names it, the
  game is drawn, and counts half a win to each in the table (1.6 % of simulated editions).

### 4.1 The rounds

| Round | How it plays | Options | Scoring | Each question | The plan needs (in the pairing's pool) |
|---|---|---|---|---|---|
| **PICTURE THIS** | A story's picture, beside the three tiles, sharpens in four steps (8, 16, 32, 64 blocks across, the channel's own pixelation). The host reads the three headlines during the first step; lock-ins open at the second | Three real headlines, at most two from one desk (13 Oct's pool: 20 technology, 13 science, 2 world), none sharing a name with another | 3 / 2 / 1 points for a lock-in at step 2 / 3 / 4; a wrong lock-in is out for that picture | ~26 s | 3 stories with pictures; 6 more headlines |
| **LETTER BY LETTER** | A real headline as letter tiles. Every word's first letter, the digits and the punctuation show at once; then a quarter, a half and three quarters of the other letters, on the beat, in a seeded order that never leaves a word unrevealed past the second stage. The first to buzz says the headline | None | 3 / 2 / 1 by stage; a stall locks that player out for the headline | ~20 s | 3 stories |
| **WHERE IN THE WORLD?** | The headline in its frame, its place masked if it names it; three pins on the world map (`scenes/worldmap.js`); the zoom to the right one | Three countries in three regions (§3.2). An answer is never another question's wrong pin, and no wrong pin shows more than twice in a round | 2 points | ~21 s | 3 stories with a usable place, 6 more places |
| **TODAY OR NOT TODAY?** | A quickfire of six real headlines. The players answer on their lamps, not aloud; the host names a player only when the two differ, and closes with the round's tally | TODAY: first aired since 06:00 London today. EARLIER: last aired two to seven days ago. Never yesterday's stories, which no viewer could place | 1 point each; the reveal stamps the day and programme it aired | ~9 s a headline | 3 for TODAY, 3 for EARLIER |
| **HOW MANY?** (when the week allows) | The aired sentence with its figure masked (§3.2) | None: each player says a guess, shown as GUESS | Closest 2 points; exactly right 3, but only for a figure that aired without "about", "around", "nearly" or "up to" | ~19 s | 3 usable figures |

- **A usable place** is a story's place, named in its aired words where the story happens: after "in", "at", "off"…, as
  the place's own ("Egypt's…") or as a dateline. A company's home country ("Indian brand CMF…") is no "where". When the
  headline names the place, it is masked (§3.2).
- **A usable figure** appears verbatim in the aired text, and its label's words appear in the same sentence. It is never
  the price of a person (§3.1).
- **WHO SAID IT?** was designed and dropped (round 5 of the critique):
  - the archive keeps only the speaker's name ("Kirby", "Mendoza", "the company"), with no role;
  - its quotes are clipped with "…";
  - several were from private people;
  - the roles on its tiles would have been the desk's own descriptions.
  
  It returns only if the archive keeps the speaker's role as the story stated it.

### 4.2 The players

- **The contestants' answers** come from a seeded model of each player, deterministic per edition
  (`server/quiz/players.js`). It has:
  - an accuracy by the question's desk, on a base of 60–66 %, and two strong desks for each player, at least one outside
    their own programme. A player is never asked about their own programme, so a strength only inside it would never
    show: Max is strong on technology and science, Nova on science and world, Penny on business and world;
  - a speed: lock-in timing in PICTURE THIS and buzz timing in LETTER BY LETTER;
  - guesses for figures drawn around the true value, with a spread set by confidence, said as people say numbers ("$800
    million", "$150"). Two players never say the same number.
- **Variance is real**, measured over 500 simulated editions (step 2):
  - a strong favourite (one who wins 65 % or more of 100 replays of the same plan) loses 28 % of the time;
  - the player behind at half time wins 29 % of the time;
  - 24 % of editions are decided before DOUBLE OR NOTHING;
  - every player's win rate lies between 43 % and 59 %.

## 5. Repertoire: never the same programme twice

- **Lines**: every spoken frame has a bank, picked by hash of the edition, the pair and the moment, and by the station's
  recent-lines memory, so that none repeats within six hours and no player's reaction repeats within an edition:
  - welcomes (10) and player introductions (10);
  - question frames, 12 for each of the five rounds;
  - countdown prompts (8);
  - reveals: right (12), wrong (12), both right (6), the closest guess (6), exactly right (4), nobody (4);
  - close calls (8), the quickfire's tally (4), a tie-break won (4);
  - DOUBLE OR NOTHING (8) and the desk pick (8);
  - results (10) and sign-offs (10).
- **No catchphrase**, but the genre's conventions as banks of variants ("Lock it in", "Fingers on buzzers").
- **The table**: a weekly league of the players' results, persisted in its own file beside the archive
  (`data/quiz/table.json`). It is shown at the end ("Penny leads the week with three wins from four"), and gives every
  edition a stake and a rivalry the viewer can follow.
- **Variety comes from**:
  - the rounds: four types that most weeks can fill, plus HOW MANY? when the week has figures; three each edition, never
    the same three twice running, the order changing;
  - the pairings: 25 possible, never the same within three days;
  - the stories: each asked once a week;
  - the players' reaction banks.

## 6. Look and sound

- **Accent: purple** (`P.purple`), for fills only:
  - always with white type on it (8.9:1);
  - with a 1-px `P.fog` rim on the dark set, since purple alone against `P.black` is 2.0:1 and would vanish.
  
  **Lit is gold** (`P.yellow`): a player's lock-in lamp and the right tile (black type on gold, 9.7:1). The wrong tiles dim
  to `P.slate`. Purple is distinct from every programme's accent:
  
  | Programme | Accent |
  |---|---|
  | WORLD NOW | red |
  | TECH BYTES | cyan |
  | COSMOS | magenta |
  | MONEY MINUTE | green |
  | NEWS IN 60 | yellow |
  | WORLD WEATHER | blue |
  | SEVEN DAYS | coral |
  | FULL TIME | orange |
  
  The set never borrows TECH BYTES's purple-and-magenta rings and LEDs, nor COSMOS's purple glow (`public/js/set.js`
  THEMES). The quiz's lights are white and gold.
- **The set: the quiz studio.** A low stage in a dark room:
  - a large question board behind the host (the network's main screen, as on every set);
  - two contestant desks either side, each with a buzzer lamp and a score display in pixel digits;
  - the host's podium in the centre;
  - a slow sweep of two moving heads on the back wall between questions; they are static during a question, so nothing
    moves behind the text.
  
  **The players are told apart by a shape** (a circle and a square) on their desk, their lock-in marks and the scores
  strip, and by their names. Never by colour alone, and never by a letter: the tiles are lettered A, B and C, and "Ada
  locks in A" must not be a puzzle.
- **Graphics** (the channel's board package):
  - the question board: the frame at 2x, the options as three lettered tiles at 1x on up to three lines, and the countdown
    bar;
  - the lock-in marks and the reveal (the right tile gold, the others dimmed, the source line);
  - PICTURE THIS: the picture beside the tiles, its pixelation stepping on the countdown's beats;
  - the LETTER BY LETTER board;
  - the map round on `scenes/worldmap.js`, with three pins and the zoom;
  - the masked sentence of HOW MANY?;
  - the scores strip and the week's table.
  
  Every board keeps clear of the top row and the captions (y 28..134). A headline that does not fit a tile's three lines
  is not used as an option.
- **The open (≈8 s, 112 BPM)**: a dark stage; the buzzer lamps of both desks light in turn on the beat; the question board
  flips to PAY ATTENTION; the plate.
- **Music**:
  - a bed at 112 BPM: light, bright, plucked;
  - countdown ticks on the bed's half notes (1.07 s), each countdown a whole number of half notes;
  - a right sting of two bright notes, and a wrong one that is a soft low note, never a buzzer's sneer;
  - a drumroll for DOUBLE OR NOTHING.
  
  **No laughter and no applause**: the owner's rule on laughs, and there is no studio audience.

## 7. Data robustness: the edition planner

Before each edition the desk builds the whole plan: the pairing (§2), three round types (§4), and every question and
option. It builds it from the pairing's pool: eligible events of the last seven days, not aired on either player's
programme, not asked in the last seven days.

| Situation | What airs |
|---|---|
| The pool holds a full plan for an allowed pairing | The full shape |
| A round type cannot be filled (few figures; few usable places) | That type is not chosen; the others rotate |
| Fewer than three types can be filled for any allowed pairing | The quiz does not air |
| Fewer than five questions from the last 24 hours | The quiz does not air |
| A grave news day (§3.3) | The quiz does not air |
| The archive unreadable, or under three days | The quiz does not air (never from the raw feeds) |

Measured on the development archive, with a model of the planner that counts stories (not each option's source):

- **13 Oct, 14:00 London** (one earlier day of archive): every one of the 25 pairings holds 26–37 stories. 16 of them
  hold the three usable places WHERE needs.
- **The archive's first day.** Two editions, at 18:00 and 22:00, fitted three types each, but never WHERE. This is the
  reason for the three-day minimum.

## 8. Schedule

- A rotation slot after COSMOS, every day; a daypart allows it 14:00–23:00 London only. `minGapHours: 4` gives two
  editions an afternoon and evening, three at most.
- A draft (`"drafts"` in `config/channel.json`) until step 7 passes and the owner approves the host.

## 9. Build plan and gates

1. **The question desk**: eligibility by event, the exclusions, the headline check, the give-away checks, the five round
   kinds and their options, the grave-day rule and the planner. *Gate:*
   - run the channel to record three real days of archive (as the 12 Oct soak did);
   - check by hand every question and option the planner makes over those days: 100 % real and correct, 0 % from an
     excluded kind, no give-aways;
   - the grave-day rule airs the quiz on those days, and does not air it on a grave day built from the archive's own
     grave stories;
   - report the editions that fit each day and the seats per presenter.
2. **The writer**: the episode (shape, banks, the players' model, scores, the table). *Gate: twenty editions written and
   read in full; simulated weeks for the scores' variance (§4.2).*
3. **Graphics**: the question board, the lock-ins, the reveal, PICTURE THIS, LETTER BY LETTER, the map round, HOW MANY?,
   the scores and the table. *Gate: the lab page at 1x and 4x, a hostile critique above 9.7.*
   - **Built, passed at 9.75 in round 5** (`docs/roadmap/critique/pay-attention-graphics.md`). After round 4's pass,
     the reviewer found the question column's credit line cut by the board's edge. A test now checks every text's glyphs
     inside its board, on every lab board, every 0.2 s. The boards are in `scenes/cards-quiz.js` and the lab in
     `public/lab/quiz.html`.
   - The boards' text fit is in `scenes/quiz-fit.js`. The desk refuses by it whatever would not fit its box: a tile holds
     three 1x lines of 150 px, and all 41 headlines of the week's pool fit.
   - Two choices beyond the bible's words:
     - each board shows the stake beside its countdown ("3 POINTS"; on DOUBLE OR NOTHING "6 FOR PENNY");
     - a lamp beside a wrong answer goes out at the reveal, so gold only ever means right.
4. **Director and pace**: the shots, the countdowns timed to the reading rule, the lock-in and buzz beats, the half-note
   ticks.
5. **Set, open, theme, bed and stings.** *Gate: renders and recordings critiqued above 9.7.*
   *Built. The sound passed at 9.8 in round 3; the set and the open, reopened by the reviewer (round 4: bare beside
   the network's sets, the plainest open), were rebuilt and passed at 9.8 in round 6
   (`docs/roadmap/critique/pay-attention-set.md`, `pay-attention-open.md`, `pay-attention-sound.md`):*
   - *The set: `public/js/v2/canvas25d/studio/quiz.js` (style `'pay-attention'`, theme `quiz`; `THEMES.quiz` in
     `public/js/set.js`), lab `public/lab/pay-attention-set.html`. A game-show studio in a dark room: a white soffit and
     cove, two truss towers carrying the moving heads, each player's shape in bulbs on the wall (gold while their lamp is
     lit), the board on an ink backing panel between two white light strips, a marquee of bulbs in its purple frame, its
     idle the emblem and the name with a lamp test every 8 s (still during a question); lit podium cabinets over slatted
     plinths; the stage's lit edge curving round the host. Seats (`QUIZ_SEATS`, neck at the network's depth
     Z 1000): the host at X 0 (the solo seat), A at X −118 facing right, B at X 118 facing left. Framings
     (`quizCamera`): `wide` (the solo wide pulled back 5 % and lowered 11 px, clear of the top row), `host`, `player-a`,
     `player-b`. The director's hook: `setQuizState({ question, lamps: { A, B }, scores: { A, B } }, t)` from
     `studio/set.js`; the moving heads ease to a stop over 0.8 s when `question` turns on and pick up again when it
     turns off; the board's lamp test stops with them.*
   - *The open: `public/js/scenes/opens/payattentiontitles.js` (shot in the studio itself, with the set's renderer: a
     crane down through the rig into the dark studio, the lamps striking under follow spots, the lights up on the
     downbeat as the camera lands on the wide, the heads firing and stopping on the next beat, the board's letters
     flipping in, a cut to the board) and `payattention.js` (the emblem: the two lamps), cue sheet `'pay-attention'`
     (8.3 s, the hit at 7.5 s).*
   - *The sound: the theme `payAttentionTitles` and the sign-off tail (`audio/themes.js`); the bed `'pay-attention'`
     (moments welcome, question, scores, chat, double, result, signoff); the cue sheet's `QUIZ` moments: `question`
     (`{ double: true }` for DOUBLE OR NOTHING), `right`, `wrong`, `double` (the drumroll, 4.3 s, the bed stopped);
     the stings by name in `QUIZ_STINGS`; the countdown `LiveMusic.countdown(halves)`: ticks on the bed's half notes
     (1.0714 s), the first on the next half note (up to one half note's wait), returning `{ start, ticks, end, half }`
     in seconds from now, so the countdown bar runs from `start` and the reveal lands on `end`. Lab
     `public/lab/pay-attention-sound.html`.*
6. **Cast**: the host's face and voice (A/B for the owner); the contestants' seats. *Gate: the character rubric above 9.7.*
7. **On air**: two recorded editions with sound (an afternoon and an evening); the whole programme critiqued above 9.7
   (`docs/roadmap/critique/pay-attention.md`).
