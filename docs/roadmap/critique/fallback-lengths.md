# Fallback lengths: every programme at its length on real news, with real content only

No AI writer is connected, so the station writes every programme with its fallback writer (`server/providers/mock.js`).
The station's playout log of 12–16 Oct measured the programmes far short of their targets:
- WORLD NOW: 319 s against 540–600;
- COSMOS: 284 s against 360–480;
- WORLD WEATHER: 242 s against 270–480;
- MONEY MINUTE: 246 s, at the bottom of 240–360.

The brief was:
- **Bring each programme to its target length with real content only.** Every added second must come from:
  - the story's own source text and dossier;
  - the existing segment and board types;
  - more stories when the rotation allows.
- **Never** padding, filler banter, repeated lines, invented facts or opinions stated as fact.
- **Keep the hourly clock**: NEWS IN 60 stays pinned at :00 and :30.

The panel:
- a senior news editor;
- a standards and legal editor;
- a senior broadcast director;
- a first-time viewer.

They score six categories from 0 to 10: truth, writing, length, rhythm and variety, robustness, and tests. **The round's score is its lowest category.** The target was above 9.7. It was not reached; the last round says why.

Round 6 was narrowed to truth and standards, with standards scored apart for the first time. Its goal was truth of 9.7 or more: nothing false, misattributed or left out on air. It was not reached either (round 6, "Scores").

## How the editions were made, measured and read

- **The real archive, replayed** (`tools/lengths/replay.mjs`, new).
  - The recorder's archive of 12–16 Oct holds every story each edition aired, and when. It was copied into the worktree's `data/archive/`, which is gitignored.
  - Before each edition, the replay rebuilds the station's real news desk (`server/news.js`) at that moment. A story enters the desk 30 minutes before it first aired and stays for 36 hours.
  - It reads the article pages from a local cache. `tools/lengths/pages.mjs` fetched them once through the proxy. 35 Sky News pages answered 403 and have no dossier, as on air.
  - It then makes the edition with the station's own producer and fallback writer, with the whole process's clock set to that moment.
  - Each edition is saved as JSON, as a readable script (`NNN-<programme>.txt`), with its sources (`.src.txt`) and with the candidates the writer saw (`.cands.json`).
  - **The replay's desk is thinner than the live one.** It holds only stories that aired, so when one programme takes more stories, the next has fewer. The live desk holds every story the feeds carry. Lengths are therefore given for all editions, then split into editions whose desk offered a full pool (one and a half times the stories the programme can use) and editions with a thin one.
- **The ruler** (`server/airtime.js`, new).
  - The station's own estimate counts the words at 2.75 a second. That is not what a viewer sits through.
  - `voicedAir` times an edition as it plays:
    - the programme's open;
    - every line at its voice's measured Kokoro rate (`server/voice/rates.json`, measured by `tools/lengths/rates.mjs` from the 5,500 clips the station has voiced);
    - the pace profile's pause after each segment;
    - the sign-off hold, the stinger and the end card.
  - `tools/lengths/voiced.mjs` plays editions through the real director on a fake clock with the same rates. The two agree to within a second (`test/fallback-lengths.test.js`).
  - Every length below is this voiced length unless it says otherwise.
- **Measured** (`tools/lengths/measure.mjs`), per programme:
  - length;
  - segment mix and share of spoken time per segment kind;
  - repeats within an edition and across consecutive editions;
  - boards per edition.
- **Linted** (`tools/lengths/lint.mjs`): the fault classes the reading found, counted over every edition. The classes are:
  - sentences over the bible's length;
  - fragments;
  - a first sentence that leans on something not said;
  - a view in the outlet's voice;
  - a headline read word for word;
  - a quote that needs context;
  - the same event twice;
  - boilerplate.

  The lint is a pointer, not a verdict. Its "opinion" class mostly flags the word "should" in a presenter's question ("Clara, what should people know?"), and many headlines read word for word are clean sentences.
- **The clock** (`tools/lengths/clock.mjs`, new).
  - The real station, with the clock on, runs 24 hours on a fake clock with each programme's replayed editions in turn.
  - It plans with its own estimate while the clock moves on by each edition's voiced length.
  - It reports where NEWS IN 60 lands against :00 and :30.
- **WORLD WEATHER** (`tools/lengths/weather.mjs`, new).
  - The live Open-Meteo forecast and GDACS warnings are fetched through the proxy and written by the station's weather writer for 24 seeds, timed the same way.
  - `--save-report` keeps the data, so the old writer can be run on the same forecast (`--writer`).
  - Open-Meteo answered HTTP 429 (rate limit) to three of five attempts. The forecast of 16 Oct 21:20 UTC came through, but without the moving sky.
- **Truth and standards, counted** (`tools/lengths/standards.mjs`, round 6).
  - It counts the six faults of round 6 by airing over every edition of a replay: a view nobody holds, a person or a body nobody introduced, no news on air, one event twice, a question its answer misses, a kicker that does not fit.
  - Like the lint, it flags and never rewrites.
- **Read by hand.** In each round, whole editions were read against their `.src.txt`, fact by fact. The final round's readings are listed with their paths.

## Round 1: the fallback writer as it stood (baseline replay)

The baseline is the code at the start of this work (`6b56d02`), with the archive replayed: 276 editions.

| Programme | Editions | Voiced length (avg / median / min–max) | Within target |
|---|---|---|---|
| WORLD NOW | 116 | 377 / 370 / 255–502 | 0 of 116 |
| COSMOS | 38 | 394 / 406 / 252–450 | 33 of 38 |
| TECH BYTES | 41 | 439 / 455 / 230–503 | 25 of 41 (11 over) |
| MONEY MINUTE | 25 | 263 / 260 / 200–323 | 18 of 25 |
| NEWS IN 60 | 55 | 74 / 74 / 61–85 | 13 of 55 (42 over) |
| WORLD WEATHER (fixture) | 24 | 244 / 244 / 239–250 | 0 of 24 |

Lint over every baseline edition:

| Programme | Long | Fragments | Views | Leaning first sentence | Other |
|---|---|---|---|---|---|
| WORLD NOW | 401 | 71 | 55 | 20 | same event twice 8, boilerplate 8 |
| COSMOS | 90 | 33 | 16 | — | — |
| TECH BYTES | 84 | 85 | 37 | — | quote context 13 |
| MONEY MINUTE | 46 | 10 | 10 | — | boilerplate 4 |
| NEWS IN 60 | 71 | — | — | — | one-sentence lead 19 |

Faults (who found them):

1. **WORLD NOW never reaches its length.** Zero of 116 editions are within 540–600 s; the median is 370 s, six minutes against nine to ten. The writer tells every story at one fixed depth, whatever the programme needs (senior news editor, director).
2. **The station's ruler is not the viewer's.**
   - `episodeAir` reads 345 s for editions that play 377 s with the real voices, the open, the pauses and the end card.
   - NEWS IN 60's fit counts words at 170 a minute, and the bulletin airs 74 s against 55–70 (director).
3. **Page furniture read as news** (standards editor):
   - "THIS IS A BREAKING NEWS UPDATE";
   - picture captions;
   - "The Associated Press doesn't name victims of alleged sexual violence";
   - "…contributed to this report".
4. **Views stated as the channel's** (standards editor):
   - "Backing the genocide case against Myanmar must be followed by concrete action";
   - "It would be surprising if both were wrong";
   - "The reckless missile attack on King Khalid international airport…".
5. **Pronouns and back-references with nothing to point at** (first-time viewer):
   - "They were released on police bail a day later…", without the arrests;
   - "The EU considers those officials…", without the officials.
6. **One event told twice** (senior news editor):
   - "Pope Leo undergoes surgery…" and "Pope's surgery… concluded successfully" in one WORLD NOW;
   - two RAF Fairford reports in one round-up.
7. **Kickers from a stray word** (director, standards editor):
   - CULTURE on an immigration agent's shooting;
   - SOFTWARE on a Vietnam detention;
   - ECONOMY on the Pope's "growth on lung";
   - TRADE on a slavery fund.
8. **"And finally" on hard news**: "Both Russia, Ukraine are using AI-powered drones", "IMF raises forecast…" (senior news editor, first-time viewer).
9. **A cut that drops who said it**: `trimClause` could cut ", the ministry said" (standards editor).
10. **A cut that leaves a fragment**: "Duane Davis, the former … leader who boasted…" (no verb); "…as officials." (writing).
11. **IN THEIR WORDS out of context**: "I agree, that was by design." re-staged with nothing it answers (director, first-time viewer).
12. **One-sentence leads**: a video caption led WORLD NOW on its own (senior news editor).
13. **Sentences over the bible's 20 words** in every WORLD NOW, and in COSMOS, TECH BYTES and MONEY MINUTE (writing).
14. **Over the slot**: TECH BYTES ran past 480 s in 11 of 41 editions, NEWS IN 60 past 70 s in 42 of 55 (director).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Truth | 5.5 | views and page furniture read as fact (3, 4); attributions cut (9) |
| Writing | 5.0 | fragments, long sentences, leaning pronouns, headlinese (5, 10, 13) |
| Length | 2.0 | WORLD NOW 0 of 116 in range; NEWS IN 60 and TECH BYTES over; WORLD WEATHER under (1, 2, 14) |
| Rhythm and variety | 5.5 | duplicates, the wrong "And finally", one-sentence leads (6, 8, 12) |
| Robustness | 5.0 | thin dossiers lead; no notion of a short news day |
| Tests | 6.0 | nothing measures length on real news; no test of the ruler |

**Round score: 2.0** (length).

## Round 2: depth on demand, the cutting rules, the first filters (replay r2)

What changed after round 1:
- **The ruler** (`server/airtime.js`). It is used by the producer's depth loop and by NEWS IN 60's fit.
- **The producer's depth loop** (`server/producer.js` `deepen`):
  - while an edition is short, the writer tells it again one depth deeper (1 to 3), and the closest telling is kept;
  - while it is long, it is told with one to four stories fewer.
- **What each depth means in the writer:**
  - more of each read article (up to 14 sentences studied);
  - more details per main story;
  - WORLD NOW's own story length (720 characters, 960 at depth 3);
  - up to five more stories when the desk offers enough;
  - a running order that prefers stories whose article was read.
- **WORLD NOW's bible numbers raised**: three crosses, two analyses, two re-staged quotes.
- **A long sentence shortened as a broadcast writer shortens it** (`compressSentence`):
  - it splits at a joint;
  - it drops an aside, a frame or a trailing time;
  - it never drops who said it, the other side of a "but", a condition or a list item.
- **Filters:**
  - page furniture and captions;
  - views in the outlet's voice (`outletView`);
  - fragments;
  - lines that answer words nobody heard;
  - one event told twice (same name and lede, same figure, same outlet);
  - kickers taken from what a story is about;
  - "And finally" kept to soft stories.

Lengths (voiced):

| Programme | Editions | Avg | Within target | Round 1 |
|---|---|---|---|---|
| WORLD NOW | 113 | 434 s | 13 of 113 | 377 s, 0 of 116 |
| COSMOS | 37 | 374 s | 28 of 37 | 394 s, 33 of 38 |
| TECH BYTES | 40 | 394 s | 36 of 40 | 439 s, 25 of 41 |
| MONEY MINUTE | 25 | 248 s | 17 of 25 | 263 s, 18 of 25 |
| NEWS IN 60 | 55 | 64 s | 50 of 55 | 74 s, 13 of 55 |

Lint compared with round 1 (WORLD NOW):

| Fault class | Round 1 | Round 2 |
|---|---|---|
| Long sentences | 401 | 89 |
| Fragments | 71 | 30 |
| Views | 55 | 33 |
| Same event | 8 | 1 |
| Boilerplate | 8 | 0 |
| Headline read word for word | 14 | 70 |

Lint for the other programmes:
- COSMOS: long sentences 90 → 27, fragments 33 → 25.
- TECH BYTES: fragments 85 → 38, long sentences 84 → 13, views 37 → 11.
- MONEY MINUTE: long sentences 46 → 7.
- NEWS IN 60: long sentences 71 → 7.

The rise in headlines read word for word is a side effect of the new filters: they turn away a leaning or fragmentary first sentence, so the headline is said instead. About half of these headlines are clean sentences ("Trump faces growing backlash over plans to import diesel from Russia"). The rest are headlinese (see fault 5).

Read in full (fact-checked against `.src.txt`): WORLD NOW 019, 028; COSMOS 004; TECH BYTES 017; MONEY MINUTE 025; NEWS IN 60 001; plus the stories quoted below wherever they aired.

Faults (who found them):

1. **WORLD NOW still short: 434 s on average, 13 of 113 within range.** The desk rule for extra stories was the cause: it asked for twice the stories wanted (38 candidates), so only full-desk editions grew. Those made 548–601 s with 17–18 stories. An edition of 14 stories at depth 3 makes 390–470 s (director, senior news editor).
2. **COSMOS and MONEY MINUTE slipped** (374 s and 248 s). In the replay, WORLD NOW's extra stories and the NEWS IN 60 before it drew on the same thin desk. COSMOS 004 lost the orangutans and the flood warning to the NEWS IN 60 at 003. MONEY MINUTE 030 saw four candidates, one of them a column. The replay's desk holds only stories that aired, so it is thinner than the live one (director).
3. **A promotion aired as news**: "TechCrunch Disrupt 2026 starts tomorrow: Your final chance to secure up to $100 ticket savings", TECH BYTES' eleventh story (standards editor).
4. **Reviews and verdicts read as news**: "best and worst", "hands-on", "review:" headlines. The phrase "in a good way" was read as the answer to "So what is the catch?" (standards editor: opinion as fact).
5. **Headlinese:**
   - a headline without its verb read as a sentence ("Security for high-profile public figures to be reviewed after…", "Cyprus closer than ever to joining Schengen but…");
   - two bad conversions: "A US has detained man…" (from "a US court") and "A bBC asks judge is to force Trump…" (writing).
6. **Openers that lean on what was never said:**
   - "Inside those buildings, which total half a million square feet…" opened GM's factory story;
   - "Mohsen Rezaei added that Iran is no longer responding…";
   - "Laura Mendoza comes downstairs, checks their names…";
   - "Omar’s late father filled out that paperwork when…" opened the story on the raid on Ilhan Omar's home. The raid itself was never told (first-time viewer, senior news editor).
7. **One event as two stories**: "£35bn spending pressures" (Guardian) and "Healey faces £35bn Budget challenge" (BBC) in one MONEY MINUTE (senior news editor).
8. **A speaker nobody introduced**: "As Kamlager-Dove put it: “This is an unadulterated abuse of power.”" The story never names the congresswoman (first-time viewer).
9. **Number of the day with no number in the story:**
   - "Our number of the day: £20m.", then a broken headline: "Campaigners have claimed minister attempting to undermine…";
   - "£9bn" over "Motor finance scandal pushes auction towards Startline";
   - "around €11.7 billion" over two ASML sentences that never give it (first-time viewer, standards editor).
10. **THE CATCH with no answer**: "So what is the catch?" led straight into the next story; its reply had been dropped because it aired lately (director).
11. **Wrong strap or button:**
    - "Not a gadget in sight" after CMF's wireless speakers;
    - EDUCATION on a school shooting;
    - DISASTER on a capsized boat, dropped silently because the outlet never says "disaster";
    - "Starwatch:" read aloud in COSMOS' intro (director, writing).
12. **A correspondent's piece that repeats its attribution**: "…Tusk said on Sunday" twice in three sentences. "Bessone said" twice in one Renoir story (4 segments in 5,783) (writing).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Truth | 6.5 | numbers never stated (9); reviews as fact (4); promotion as news (3) |
| Writing | 6.0 | headlinese and broken conversions (5); leaning openers (6); unheard names (8) |
| Length | 3.5 | WORLD NOW 13 of 113 (1); COSMOS and MONEY MINUTE down (2) |
| Rhythm and variety | 6.5 | THE CATCH unanswered (10); one event twice (7); wrong buttons (11) |
| Robustness | 5.5 | the extra-story rule blocks most editions; a thin desk starves later programmes |
| Tests | 7.0 | the ruler and the depth loop are tested; none of faults 3–11 had a test |

**Round score: 3.5** (length).

## Round 3: round 2's faults fixed, the extra-story rule relaxed (replays r3 and r4)

What changed after round 2:
- **Extra stories.** They now come when the desk offers one and a half times what WORLD NOW can use, not twice.
- **The deepest telling of a long programme**:
  - keeps three map items instead of five;
  - sends stories whose article was read to be told in full;
  - the map takes the thinner stories first.
- **Deeper telling for COSMOS and MONEY MINUTE** at depth 3: `storyCharsDeep` of 720 and 640.
- **Filters and rules from round 2's faults:**
  - promotions never air;
  - reviews and verdicts go after the news;
  - "As … put it" only for a speaker the viewer has heard of, or with their whole name;
  - a sentence that names with "that" what the one before introduced never opens;
  - the number of the day must be a figure one of the story's sentences says, and that sentence is said;
  - a question never airs without its answer;
  - the intro drops a column's label;
  - ACCIDENTS replaces DISASTER (an alarm word the validator drops unless the outlet uses it); "teachers shot" is CRIME.
- **Then, after reading r3:**
  - kickers from what a story is about: armed forces, detentions, the EU, the summary's first words;
  - an article's two-sentence lede is kept up to 44 words for the writer to shorten;
  - a later sentence that says three more words of the headline opens instead of a side detail;
  - openers never lean on "added that", "denied the accusations", or a "their" after one named person;
  - a place keeps its capital with its possessive;
  - **the depth loop**:
    - a deeper telling that overshoots is told with fewer stories before a shorter depth is kept;
    - it aims a quarter of the range inside the target (at most 30 s), never on its floor.

| Programme | r3 voiced avg, in target | r4 voiced avg, in target |
|---|---|---|
| WORLD NOW | 494 s, 37 of 112 | 509 s, 48 of 112 (full desk 574 s, 41 of 56; thin desk 444 s, 7 of 56) |
| COSMOS | 387 s, 32 of 38 | 384 s, 34 of 38 |
| TECH BYTES | 387 s, 37 of 41 | 386 s, 36 of 41 |
| MONEY MINUTE | 256 s, 22 of 25 | 246 s, 18 of 25 |
| NEWS IN 60 | 64 s, 49 of 55 | 65 s, 48 of 55 |
| WORLD WEATHER (live, 16 Oct 21:20) | — | 268 s, 11 of 24 (old writer on the same data: 239 s, 0 of 24) |

The clock with r4's lengths:
- NEWS IN 60 hit 48 of 48 marks, 0 doubled;
- median 44 s off its mark, worst 224 s;
- the baseline was a median of 46 s and a worst of 192 s.

Read in full against the sources:
- WORLD NOW r3 `028`, r4 `028`;
- COSMOS r3 `145`;
- MONEY MINUTE r3 `210`;
- TECH BYTES r4 `203`;
- NEWS IN 60 r5 `001`.

Faults (who found them):

1. **WORLD NOW on a thin desk stays short**: 444 s, 7 of 56 within range. With about 20 candidates for 14 to 19 stories, there are no extra stories to add. Many of the stories have no article page, so they cannot be told longer (director).
2. **The depth loop kept a short telling** (r3 `019`: 434 s at depth 2). Depth 3 had overshot (604 s and more in a writer-only rerun), so it was never tried with fewer stories (director).
3. **Openers that lean** (first-time viewer, senior news editor):
   - "Mohsen Rezaei added that Iran is no longer responding…";
   - "Laura Mendoza comes downstairs, checks their names…";
   - "That legal fight escalated…";
   - "Egyptian authorities denied the accusations…";
   - "The first covers annual taxable income of up to 8,666 euros";
   - "Using a hybrid quantum computer, they demonstrated…";
   - "All three are former Apple employees."
4. **A story's news never told** (senior news editor):
   - "Ethiopian forces enter strategic Tigray town of Adwa" opened on "Ethiopian Airlines resumed flights to Tigray's capital"; the article's lede was never said;
   - the press union story lost its 43-word lede and opened on the authorities' denial;
   - the judge's order to stop the tree-clearing was never said.
5. **Kickers still from a stray word** (director, standards editor):
   - SOFTWARE on the Vietnam detention (again);
   - TRANSPORT on a strike on Riyadh's airport and on Ethiopian forces;
   - CONFLICT and SOFTWARE on Australia's online safety regulator;
   - ASTRONOMY on Lando Norris, "the latest sports star";
   - CULTURE on a cave rescue;
   - HISTORY on octopus intelligence;
   - TRADE on OpenAI's hiring records ("trade secrets");
   - JOBS on Portugal's budget;
   - HEALTH on Burnham and the EU.
6. **"Still to come: india's 'Cockroach' protest leaders freed"**: a place lowercased with its possessive (writing).
7. **A cut that keeps the lead phrase alone**: "What stands out is this: by combining machine learning with advanced computer simulations." The finding was cut away (writing, first-time viewer).
8. **Questions the answer does not answer** (first-time viewer, director):
   - "Tomas, how rare is this?" and "June, who does this affect?", each answered with what the satellite measures or what the study found;
   - "What happens next, Dr Reyes?", answered with "Locals… have long opposed Trump's plan to redevelop…" ("plan to" read as a next step);
   - "So what is the catch?", answered with "“…,” she said." when no woman had been named.
9. **A picture caption aired as a story**: "Transporter-18 SmallSats Encapsulation, according to NASA." (senior news editor).
10. **A wire round-up's tail read as news**: "Iran has called latest US response to proposal insufficient, and other Mideast developments" (writing).
11. **A pronoun speaker heard before the name**: "…,” he told reporters Sunday." aired before "Das, a spokesperson for the movement…". That sentence had been kept back for the exchange (first-time viewer).
12. **The same attribution again**: "Tusk said on Sunday" twice in Rhea's piece; "Bessone said" three times in the Renoir story. This is rare: 4 of 5,783 segments in r2 (writing).
13. **A quote overtaken by events**: "“We are closely monitoring the situation and are hoping for good news soon,” the council said." aired after the man had been brought out of the cave (standards editor).
14. **Headlines made into sentences without their articles** (writing):
    - "US has detained man accused in multi-billion Venezuelan money laundering scheme";
    - "A Saudi minister has vowed 'serious response'…";
    - "Thousands of Indians have marched to Supreme Court…".
15. **MONEY MINUTE kept tellings of 241–247 s**, on the floor of its 240–360 s (director).
16. **WORLD WEATHER at 268 s on the live forecast** (director):
    - a third GDACS warning was never said;
    - without the moving sky, the day's strongest gusts were not said at all.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Truth | 6.5 | news never told (4); a stale quote (13); answers that do not answer (8) |
| Writing | 6.0 | leaning openers (3); a cut fragment (7); headlinese (14); a lowercased place (6) |
| Length | 5.0 | WORLD NOW 48 of 112 (1, 2); MONEY MINUTE on its floor (15); WORLD WEATHER under on live data (16) |
| Rhythm and variety | 6.5 | wrong straps (5); a caption as a story (9); repeated attributions (12) |
| Robustness | 6.0 | a thin desk; the extra-story rule; the depth loop's blind spot (2) |
| Tests | 7.5 | the third reading's faults have tests (`what the third reading showed`); the depth loop's trim had none |

**Round score: 5.0** (length).

Fixes made after round 3 (the fourth reading's tests in `test/fallback-lengths.test.js`):
- **Fault 2**: the depth loop trims the telling that overshot and aims inside the range (`server/producer.js`).
- **Fault 3**: openers never lean (`ADDED_LEAN`, `ANSWERS_BACK`, `ONE_OF_LIST`, `orphanPlural`, a six-word lead phrase before a pronoun, "That" and a noun).
- **Fault 4**: a lede up to 44 words; a later sentence with three more headline words opens.
- **Fault 5**: kickers for:
  - forces and named armed groups;
  - "struck again";
  - detentions;
  - the EU;
  - rescues;
  - regulators;
  - a sports star;
  - trade secrets;
  - and, in the summary, the first topic named.
- **Fault 6**: a place keeps its capital with its possessive.
- **Fault 7**: a cut never keeps a lead phrase; a method phrase ("By combining…,", "Using…,") is what a shorter sentence drops.
- **Fault 8**: the expert's first question is open ("what should we make of it?", "what is the bigger picture?"). A plan as a noun is no next step. A kept-back answer never has a pronoun speaker.
- **Fault 9**: a story with no sentence and a title without a verb airs only when nothing else can.
- **Fault 10**: a wire round-up's tail is cut from the headline.
- **Fault 11**: a sentence kept back for the exchange does not count as said.
- **Fault 15**: the depth loop's aim.
- **Fault 16**: up to three warnings; the strongest gusts in their own zone when there is no sky.
- **Not fixed: faults 12, 13 and 14.**

## Round 4: after the fixes from reading r5, r6 and the first final replay

More was found in the r5 and r6 replays and the first two attempts at a final replay, and fixed before the last one. The tests are in `test/fallback-lengths.test.js`, "what the fourth reading showed", "what the last reading showed" and "a quotation is said by whoever the source says said it".

- **A quotation given to the wrong person (truth).**
  - The source read: "…the Times quoted a government source as saying: “Andrew Bailey needs to focus on doing his job.” Miller said the Treasury…".
  - The words were credited to the IFS director, Helen Miller, on the quote card, and re-staged as hers in IN THEIR WORDS. The fault was already there in the baseline.
  - A quotation that ends its sentence with a full stop now never takes the next sentence's speaker (`server/facts.js`).
- **Columns, reviews and features no longer air as news when the desk has enough plain stories** ("So far, success feels a lot further away than failure"). The programme is a story shorter instead.
- **The number of the day.**
  - It is a figure that one of the story's sentences can say: at the programme's length, or shortened around the figure. It is never the unit of a ratio ("for every $1").
  - That sentence is said.
  - A number story's broken headline gives way to a sentence of the article.
  - "Our number of the day: £9bn." had once aired with nothing after it.
- **IN THEIR WORDS names the speaker cleanly.** These once aired:
  - "Stella Li, the According to vice-president";
  - "Mark Rutte, the to secretary general";
  - "the Dr Hausfather";
  - "the Force General";
  - "the Cruz professor".

  A toss to the co-presenter no longer comes before the hand-over.
- **Writing:**
  - a lead phrase is never kept alone ("By combining machine learning…");
  - a headline that has its verb is never given another ("Father was have been asked…");
  - a title-case headline is never made a future ("NASA develops batteries are to power…");
  - a place is never given a first name ("Resources Wales has seen…");
  - a sentence's first words are no one's name ("As Friends Malcolm put it");
  - "All three are…" and "Though it remained offshore, the storm…" never open;
  - a subordinate clause with a dashed list in it is no sentence;
  - page entities are characters ("A&beta;").
- **WHAT WE KNOW**: a point has its own subject ("Have started preparing / Had started preparing" filled a board).
- **Kickers**:
  - SOFTWARE, TRANSPORT and CONFLICT from stray words;
  - HISTORY on Roman Abramovich;
  - GADGETS on "TV networks";
  - ACCIDENTS on an ancient shipwreck;
  - EDUCATION on research at a university;
  - RESCUE on released orangutans.
- **WORLD WEATHER.**
  - Up to three GDACS warnings are read.
  - Without the moving sky, the day's strongest gusts are said in their own zone.
  - On the live forecast of 16 Oct 21:20 UTC: 239 s and 0 of 24 with the old writer; 286 s and 24 of 24 now.

More faults turned up while reading the replays meant to be final (`final9` to `final13`), and were fixed before the last one (`final14`):
- **A speaker's words in the presenter's voice (truth).** This was the worst fault of the four rounds, and every earlier reading missed it.
  - In a quotation of several sentences, only the first sentence carries the opening mark. The writer took each later sentence for the outlet's own. Read against the script alone, such a sentence sounds like plain reporting.
  - What aired:
    - Trump's boast became ABC News's report: "It’s one of the biggest commitments in history for anything, ABC News reports."
    - A victim's words aired in the presenter's voice: "My other child was screaming as he rained punches on any area of my body he could get at."
    - So did a politician's accusation: "They have actually aided and abetted criminality in absolutely every way."
    - And a football manager's account: "We started the second half well and fought our way back."
  - Counted with `innerquote.py`: 66 such sentences in the baseline's editions, 67 in `final9`, 5 in `final14`.
  - The fix: a sentence that starts inside an open quotation is never studied. A paragraph starts outside any quotation, so a lost closing mark costs one paragraph at most (`server/providers/mock.js`).
  - The lint now has a class for it (`speaker-words`, `tools/lengths/lint.mjs`).
  - The same fault came back by another route. When IN THEIR WORDS re-stages a quotation of two sentences, the producer took only the first out of the presenter's text. Zelensky's "Russia is targeting yet another power plant and the lives of our people.”" was left in the presenter's voice. The whole quotation now goes, to its closing mark (`server/producer.js`).
- **An outlet's promotion opened a story.** "Get our breaking news email, free app or daily news podcast." opened a story on violence against Australian children in three editions, with SOFTWARE as its kicker.
  - The writer's repair of a leaning opener took the summary's sentences unfiltered.
  - Such a line is now page furniture at the desk (`server/transcript.js`), and the repair never takes a line in the outlet's own voice (`server/writer.js`).
  - The replay's summaries are the archive's, cleaned by the desk as it was on 12–16 Oct. The desk fix does not show in the replay; the writer's does.
- **A podcast's title and a headline's verdict read as news.**
  - MONEY MINUTE teased "Trump rewards Putin and betrays Ukraine". It was the title of a Guardian podcast, "… - The Latest".
  - TECH BYTES teased "Hegseth’s dubious low-T screening…", the outlet's own verdict.
  - Both are now features, which air only when the desk has too few plain stories.
- **News held back as columns.** A headline that addresses its reader was taken for a column.
  - The words "you" and "your" were enough: "Google wants to host your personal vibe-coded apps in the Play Store", "Former Plaud exec raises $26M for AI app that listens to you in the background".
  - A "we" after "says" counted too ("Cerebras CEO says we’re nearing a future…").
  - Since round 4 a column no longer airs while the desk has enough plain stories. TECH BYTES of 14 Oct 00:00 therefore held back seven news stories and aired five, at 171 s.
  - A column is now a headline in the outlet's own voice: "I", "my", "we", "our", outside a quotation and before any "says". Promotions are caught by their own rule.
- **Cards that misled.**
  - "One in 10 scams…" put "10 SCAMS" on a card.
  - "Maia 300 not only…" and "Porsche 911 not…" gave "300 NOT" and "911 NOT".
  - "42-year-old Hassan Jihad Ibn Kariem" gave "42-YEAR-OLD HASSAN JIHAD".
  - The count of a ratio is no figure now, a label stops at "not" and at a name after its first word (`server/facts.js`).
- **Kickers from stray words** (`server/topics.js`):
  - "hospitality" made HEALTH;
  - "operations" made CULTURE, through "opera";
  - a takeover's "rescue bid" made RESCUE;
  - a "US military" archbishop's protest at an execution made CONFLICT;
  - a diesel deal made MOTORING;
  - sexual violence against children made WORLD.

  Whole words now, and an execution is JUSTICE, fuel ENERGY, sexual violence CRIME.
- **What the column fix let through** (found reading `final13`):
  - two deals posts aired as news: "$15 gets you Psychonauts 2…" and TechCrunch's "Save 50% on your TechCrunch Disrupt 2026 ticket";
  - a teaser read in the outlet's voice: "They war-gamed dimming the Sun. It went even worse than you think."

  Deals and offers are promotions now, and "than you think" makes a feature. "I Am Artemis: Allison Mjoen", NASA's profile, is a column too.
- **"What ice cream has are to do with this year's Nobel Prize"**: a headline with its own verb made a future. A question word or an auxiliary before "to" now keeps it as written.
- **An ask with no answer**: "Walk me through how it works." led into the next story, its answer never written. An ask that is not a question now goes with its answer, as a question did already.
- **A clause's words taken for a speaker** ("…described it as a threat but said: “…”" aired as "As a threat but put it").
- **A headline with its verb before "to" made a future** ("UK asks Interpol is to reject…").
- **A live page read in the presenter's voice.**
  - On a thin desk, a Guardian live page aired: "Zia Yusuf… is speaking now… This is a moral outrage, and it is a direct result of decisions made by Tory and Labour governments."
  - A live page now airs only to keep a programme at its fewest stories. "Follow the day's news live" is page furniture.
- **A sentence about orangutans read as if about people.**
  - WORLD NOW's lead on an Indonesian wildfire opened on "How many have been killed is unclear, but experts have warned the toll is likely to be huge." In the article, that is the orangutans' toll.
  - A sentence that asks about what the sentence before it told ("How many… is unclear") never opens a story and is never told without that sentence.
  - The same edition closed on war drones as "And finally", followed by Paco's "Quietly encouraging." Drones on a battlefield are now CONFLICT, which can never be "And finally".

### Lengths (`final14`, the code as committed)

| Programme | Target | Before: voiced avg / median / min–max | In range | After | In range |
|---|---|---|---|---|---|
| WORLD NOW | 540–600 s | 377 / 370 / 255–502 | 0 of 116 | 512 / 544 / 130–626 | 52 of 113 |
| COSMOS | 360–480 s | 394 / 406 / 252–450 | 33 of 38 | 397 / 406 / 224–479 | 31 of 38 |
| TECH BYTES | 360–480 s | 439 / 455 / 230–503 | 25 of 41 | 395 / 410 / 127–470 | 35 of 41 |
| MONEY MINUTE | 240–360 s | 263 / 260 / 200–323 | 18 of 25 | 266 / 277 / 196–310 | 18 of 24 |
| NEWS IN 60 | 55–70 s | 74 / 74 / 61–85 | 13 of 55 | 64 / 63 / 55–77 | 51 of 56 |
| WORLD WEATHER (live forecast of 16 Oct 21:20, same data) | 270–480 s | 239 / 239 / 234–246 | 0 of 24 | 286 / 286 / 280–293 | 24 of 24 |
| WORLD WEATHER (offline demo data) | 270–480 s | 244 / 244 / 239–250 | 0 of 24 | 271 / 271 / 265–277 | 14 of 24 |

| Programme | Full desk: editions, voiced avg, in range | Thin desk: editions, voiced avg, in range |
|---|---|---|
| WORLD NOW | 62, 570 s, 46 in range | 51, 442 s, 6 in range |
| COSMOS | 14, 417 s, 14 in range | 24, 385 s, 17 in range |
| TECH BYTES | 22, 422 s, 22 in range | 19, 364 s, 13 in range |
| MONEY MINUTE | 21, 269 s, 17 in range | 3, 244 s, 1 in range |
| NEWS IN 60 | 55, 64 s, 50 in range | 1, 59 s, 1 in range |

**Edition by edition** (`pairs.py`: each edition against the same edition in the baseline):
- WORLD NOW: longer by 30 s or more in 97 of 112 paired editions, shorter in 7 (all of them under the range in the baseline too).
- COSMOS: longer in 11 of 38, shorter in 9. Three editions that were in range are under it now.
- TECH BYTES: longer in 3 of 40, shorter in 24, most of them from over or near the top of the range (11 of 41 baseline editions ran past 480 s). Three editions that were in range are under it now.
- MONEY MINUTE: longer in 6 of 24, shorter in 9. Five editions that were in range are under it now.
- NEWS IN 60: within 30 s of the baseline in all 55, as its fit times it to the minute.

The averages hide the shortest editions:
- WORLD NOW `059`: 130 s. Its desk held 7 stories, against 21 in the baseline (330 s): the programmes before it had taken the rest.
- TECH BYTES `022`: 127 s, from a desk of 5 stories. The baseline replay made no edition there at all.
- MONEY MINUTE `233`: 196 s, from a desk of 14 (287 s in the baseline, from a different 14).
- COSMOS `291`: 224 s, from a desk of 5 (252 s from 6 in the baseline).

There are three reasons, and the replay cannot separate them:
- **The replay's rotation.** A programme that tells five more stories takes them from the programmes after it. The replay's desk holds only the stories that aired, so this costs it far more than the live desk, which holds every story the feeds carry.
- **Columns, reviews and features no longer air** while the desk has plain stories. In the baseline, TECH BYTES ran past its 480 s in 11 of 41 editions, with reviews and features among its stories.
- **Stricter sentence rules.** Each article gives fewer sentences that stand on their own.

**The clock with these lengths** (`tools/lengths/clock.mjs`, 24 h): NEWS IN 60 aired at every one of the day's 48 marks (49 airings, the last at the window's end), none doubled. It landed a median 30 s off its mark, 90% within 123 s; the worst was 271 s late, and the earliest 154 s early. The baseline: a median of 46 s and a worst of 192 s. The longer programmes push the worst bulletin later.

**Lint** (counts over all editions, compared with round 1): WORLD NOW long sentences 401 → 100, fragments 71 → 35, views 55 → 43, leaning first sentences 20 → 12, a speaker's words told as ours 50 → 4 (all four the Euronews paragraph whose page lost its closing mark), headlines read word for word 14 → 81. COSMOS long 90 → 28, speaker's words 8 → 0. TECH BYTES fragments 85 → 31, long 84 → 11, views 37 → 22. MONEY MINUTE long 46 → 11, speaker's words 6 → 1. NEWS IN 60 long 71 → 10, headlines read word for word 6 → 20. The headlines are what replaces a leaning or broken first sentence (see round 2); about half are clean sentences, the rest headlinese (fault 10).

**Spoken sentences against their sources** (`prov.py`: every sentence of a story, a piece or an exchange, framing set aside):
- 10624 checked;
- 1618 share less than 80% of their words with any single source sentence.

Read by hand, those are almost all of these kinds:
- headlines said as sentences ("Iran has called…");
- compressions that drop an aside;
- an attribution moved to the end;
- the writer's framing ("In BBC News's report, here is how…", explainers).

No spoken figure or name was found that the sources lack (`facts.py` on every edition read). That check sees figures and names only. It could not see the quotation fault above, and neither could the prov check: those sentences were the sources' own words.

### Recording

- **File:** `lengths/recordings/world-now-028.mp4`.
  - 600 s, 1920 × 1080, 30 fps, AAC; recorded with `tools/record.mjs --progressive`.
  - The edition: WORLD NOW of 12 Oct 18:42, voiced with the station's Kokoro voices (34 of 34 clips, 541 s of speech) through `tools/lengths/replay.mjs --voice-at`.
  - Played by a separate server on port 8801.
  - Report: `world-now-028-report.json`. Contact sheet: `recordings/frames/contact.png`.
- **What a viewer sees:**
  - the open at 0.9 s;
  - the programme to its end card at 574.0 s (573 s on air, inside 540–600; `voicedAir` said 579 s);
  - three correspondent two-ways (Poland, Havana, Ho Chi Minh City), each on its map and its two-box;
  - pictures on 13 stories, the quote card, the round-up on the map, the globe;
  - all 100 sentences of the programme in its recorded voices.
- **Measurements:**
  - captions within −10 ms (median) and 62 ms (worst) of their voices;
  - −15.4 LUFS integrated, true peak −5 dBTP.
- **Not the programme's:**
  - the 4 browser-voice lines at 588–599 s belong to the next programme the recording server queued after the end card;
  - the LATEST ticker shows the fixture desk of the recording server ("Pixelburg United beat Bitport Athletic 3-1"), a recording artefact. On air it shows the live desk.
- The recording was made from the code of round 4's middle. Its text differs from `final14/028-world-now.txt` where round 4's last fixes touched that edition (one kicker: the Inman Grant story's REGULATION is JUSTICE now).
- A second recording (COSMOS) was not made: voicing and recording one edition took about 70 minutes on the shared machine.

### Faults found reading the final editions (who found them)

Read in full, with every figure checked against the source:
- WORLD NOW `028`, `050`, `133`, `135`, `178`, `219` (and `028` recorded);
- COSMOS `004`, `027`, `145`, `170`, `243`, `291`;
- TECH BYTES `017`, `088`, `118`, `122`, `188`, `248`, `288`;
- MONEY MINUTE `025`, `070`, `167`, `173`, `215`, `252`, `287`;
- NEWS IN 60 `001`, `044`, `081`, `158`, `218`, `271`;
- WORLD WEATHER seeds `001`, `003`, `007`, `012`, `018`, `024`.

Notes per edition: `lengths/read/NOTES.md`. The editions were read in `final9` to `final13` as each was made. Every fault below was checked again in `final14`.

1. **A thin desk still leaves WORLD NOW short.** About 20 stories for 14 to 19 places, many with no article page: 442 s on average, and as little as 130 s. The extra-story rule keeps the desk's last stories for the programmes after it (director).
2. **Editions shorter than before** (director). Some editions were in range in the baseline and are under it now: COSMOS 3 of 38, TECH BYTES 3 of 40, MONEY MINUTE 5 of 24 (see "Edition by edition"). COSMOS is in range in 31 of 38 editions, against 33 of 38 in the baseline.
3. **Cards that mislead** (standards editor, director):
   - "30 PEOPLE" on an Ethiopia item, a figure from a South Africa item glued to it;
   - "ABOUT 2.3-BILLION YEAR-OLD MYSTERY": the "about" of another sentence glued to a headline's figure;
   - "20 OTHERS", a card that says nothing;
   - a WHO card that names one man twice, once with his name cut: "Prince Abdulaziz bin Salman (SAUDI ENERGY MINISTER) / Abdulaziz bin Salman Al (SAUDI ENERGY MINISTER PRINCE)";
   - a quote card signed "NASA Administrator Jared";
   - Joseph Kabila's coalition (Congo) on a map of Rwanda, taken from another item of the same France 24 blurb.
4. **Page furniture read as news** (standards editor):
   - a France 24 programme blurb ("In tonight's edition…", twice);
   - a video hand-over ("Claire Paccalin has the latest");
   - "Coverage begins at 9:15 a.m. EDT";
   - picture descriptions: "This nighttime image… shows atmospheric gravity waves" led a hurricane story, and "Opaque white areas indicate…";
   - a NASA job listing ("Job opportunities: NASA office of the general counsel");
   - TechCrunch's own event: Startup Battlefield pitches, "Disrupt 2026 officially kicks off today";
   - a podcast's list as "And finally" ("this week in science: sea monsters, long COVID patients' microbiome, elephant carcasses").
5. **Views in the outlet's voice** (standards editor):
   - reviews and features the column rule does not recognise: "this commercial is chaos", "Nintendo might have nailed the best thing…", "The hardware itself certainly isn’t a limitation", "The visitable world is shrinking";
   - a headline's characterisation: "Ken Paxton stirs vaccines skpeticism to ingratiate himself with Maha movement", the outlet's own typo included;
   - unattributed claims and quotations: "is proving especially effective", "'Frankly shocking' risk-taking by motorists…";
   - a headline's quotation teased without its speaker: "British and Irish governments ‘should negotiate paramilitary disbandment’". The quotation marks cannot be heard, and "according to a report" comes only in the story.
6. **News never told** (senior news editor):
   - the lead says the background or a side detail before, or instead of, the news: "Gun violence… is rare in France", "Three large stone anchors were found", "Locals and preservationists have long opposed…";
   - a story told with another's facts: "Report: FTC probes Anthropic" told with OpenAI's lawsuits; Starlink's disruption told with Zelensky's words on a missile launch;
   - the Nobel economics story never names the winners;
   - a strap and its only line disagree ("The surprising psychology of morbid curiosity" over a sentence on an execution stream).
7. **Questions and answers that do not meet** (first-time viewer):
   - THE CATCH answered by a price;
   - "Who is this for, exactly?" answered by revenue;
   - "Max, what will all this cost?" answered by what open models offer;
   - "And the significance, Dr Reyes?" answered by the story again;
   - "Clara, what comes next?" answered with a quotation;
   - "when will we know more?" answered with no date.
8. **Leaning sentences inside a story** (first-time viewer):
   - "Mohsen Rezaei added that…", "Bruno Rodrigues added that…";
   - "the girl's body", "the witness added", "Ibn Kariem" never introduced;
   - "Two years later, another woman…";
   - "The Kenyan American engineer…", "Like the Muse partnership…", "Since the switchover all their steps…";
   - "In that time the 1,500-acre farm…", "In 2024 that same measure…", "Most were female…";
   - "Honeyjar is her answer to that question." as a story's first sentence;
   - a WHAT WE KNOW board of two leaning points: "The last stint was in 2018 / The two were unharmed in the incident".
9. **Broken sentences** (writing):
   - "The home secretary said former MPs, party leaders who are not MPs, peers, former members of devolved parliaments.";
   - "When the Covid-19 pandemic devastated his business, as it did with so many restaurants.";
   - "From taxes and wages to pensions, housing and tuition fees, Euronews Business reports.";
   - "…but much of England.";
   - "NASA's space X CRS-35 have launched jellyfish" (a title-case headline's noun made a verb);
   - "In the United Kingdom, the UK economy's stronger than expected performance…";
   - shortenings that drop the point: "Its goal is to restore the site museum, and more than 1,000 gentoo penguins." (it dropped "which has the world's southernmost Post Office", so the penguins are restored); "The upset also guaranteed French Open and US Open champion Zverev." (…the year-end number one ranking); "Last month, Donald Trump hosted tech leaders of companies." (…at the White House to discuss AI safety); "…select the “Interested”."
10. **Headlinese**: "UK is to strengthen…", "IEA has warned…", "Thousands of Indians have marched to Supreme Court…", "NATO commander issues warning as…", "Defence announcement comes after…" (writing).
11. **One event twice**:
    - two Netflix lay-off stories, two US inflation stories, two Facebook feed stories, two stories on one cyber announcement;
    - the India protest story and its own round-up item;
    - one fact said twice or three times in a story: Bumble's sale, Deezer's end-of-year date, Amazon's Bee devices, the protein that fuels cancer (senior news editor).
12. **Kickers still from a stray word** (director):
    - CONFLICT on the IFS budget, a cancer study, a billionaire tax and a cyber-attack on supermarket fridges;
    - CULTURE on Iran's Hormuz threats;
    - TECHNOLOGY on a WHO disease report;
    - TRADE on game ports;
    - RESCUE on the Black Sea strikes;
    - WILDLIFE on Amazon's Bee;
    - ELECTIONS on US inflation, POLITICS on restaurants after Covid;
    - HISTORY on octopus intelligence.
13. **Lower case where a name is** (on screen; the voice is unaffected): "a saudi employee", "britons", "cerebras CEO", "faisal Islam", "blueprints AI" (writing).
14. **Formulae again** (director, first-time viewer):
    - the correspondents' hand-overs and thanks still repeat lines from the previous edition (0.5 presenter lines an edition on average);
    - two explainers in one edition, each "For anyone wondering…";
    - "Over to you, UNIT-8." left before the hand-over to a re-staged quotation;
    - COSMOS's UNIT-8 exchanges ("Logged, Dr Reyes." / "Well put, UNIT-8.") are in the programme's format, but to a first-time viewer they sound like filler.
15. **A quote overtaken by events; the same attribution again** ("Tusk said on Sunday" twice). These were left from round 3 (standards editor, writing).
16. **NEWS IN 60 over its minute** in 5 of 56 editions (by up to 7 s). Its fit cannot drop below five items (director).

### Scores

| Category | Score | What keeps it from 10 |
|---|---|---|
| Truth | 5.5 | misleading cards (3); furniture read as news (4); views in the outlet's voice (5); a story's news never said (6); shortenings that change the meaning (9). The quotation fault is fixed, but it ran unseen through every earlier round |
| Writing | 5.5 | broken sentences (9); leaning sentences (8); headlinese (10); lower-cased names (13) |
| Length | 5.5 | WORLD NOW 52 of 113 in range (46 of 62 on a full desk, 6 of 51 on a thin one); editions as short as 127 s; some editions shorter than before (2); NEWS IN 60 over in 5 |
| Rhythm and variety | 5.5 | one event twice (11), more often now that news addressed to its reader airs; answers that miss their questions (7); formulae (14) |
| Robustness | 5.5 | a thin desk (1); feature pages and live pages recognised only by their headlines; title-case headlines; the faults' own detectors were written after the faults were found |
| Tests | 8.0 | 55 tests in `test/fallback-lengths.test.js` cover the ruler, the depth loop and every fixed fault; faults 3–14 above have none |

**Round score: 5.5** (truth, writing, length, rhythm and variety, robustness). The target was above 9.7. It was not reached: see "What was not done".

## Round 5: the coherence gate, name cards, the clock's worst bulletin and the open faults

Round 4 scored 5.5. A reviewer read WORLD NOW `178` and found five faults the panel's readings had let through:
- [13] "the department did not directly answer those questions": no question had been told;
- [8] "In a second attack on Sunday, the militia killed another civilian…": no first attack had been told;
- [10] "The temporary shutdown disrupted oil exports…": no shutdown had been told;
- [4] "Many residents here…" and "…al-Jahalin said": a reporter's "here", and a surname nobody had introduced;
- [7] a WHO card that read "Abdulaziz bin Salman Al (SAUDI ENERGY MINISTER PRINCE)".

Each one is a sentence lifted from an article that leans on something the programme never said. Read in the article, it follows what it leans on. Read on air, it points at nothing. The tests are in `test/fallback-lengths.test.js`, the describe blocks that begin "round 5".

### The coherence gate

`server/coherence.js` (new) asks one question of every sentence the fallback writer lifts: does it lean on something the programme has not said? `untold(sentence, told, { prevSaid })` returns the first rule the sentence breaks, or null. `told` is what the programme has said of the story so far, its headline included. `prevSaid` means the sentence before it in the source was said, so it reads in its own order. That exempts every rule except "here".

| Rule | Catches | Never catches | Real case |
|---|---|---|---|
| demonstrative | "those questions", "these measures", "such attacks", "that decision", when the noun was never said | "this week", "those killed", "those who", "this is" | "the department did not directly answer those questions" (AP, 14 Oct) |
| definite | "the shutdown", "the move", "the ruling", "the problem", when the event was never told | "the shutdown of the pipeline", "the decision to…" (the event is said on the spot) | "The temporary shutdown disrupted oil exports…" (14 Oct) |
| person | "the witness added", "the girl's body", "the men were released", when no such person was met | "the man who…", "the woman accused of…" | "…the witness added" (Six Flags, 14 Oct) |
| sequel | "a second attack", "another civilian", "the last stint", "The two were…", "Two others…", "Most were…", "something similar", "since then", "Two days later", "subsequently" | "for a second consecutive day", "for the third time" | "In a second attack on Sunday, the militia killed another civilian…" |
| also | "also" or "again" whose subject was never said; a sentence that opens on a connective ("As for…", "Nor…", "Or maybe…", "However, …") | "also" after a subject the story has told | "In early September, drones also severely damaged the Saudi East-West oil pipeline" |
| here | a reporter's "here" (the presenter is in a studio), always | "here is", "here are", "getting here", a question | "Many residents here raise sheep and goats…" (Al Jazeera, 14 Oct) |

Where it applies:
- `server/providers/mock.js`:
  - every sentence of a story (`tellLine`);
  - the first sentence and the tease (`selfStanding`);
  - the line kept back for an exchange;
  - every WHAT WE KNOW point.
- `tools/lengths/lint.mjs`: it counts what still airs, rule by rule (`untold-<rule>`). The lint checks each story line against what the edition has said of that story before it.

Surnames are a separate rule. A surname with its particle ("al-Jahalin", "bin Salman", "el-Sisi") is now introduced by the whole name the article gives ("Atallah al-Jahalin said"), or the sentence does not air (`strangers` in `server/providers/mock.js`).

**What the gate removes.** Counted by the lint over every edition of each replay. Each count is the lines that lean by that rule and still air:

| Rule | Round 4 (`final14`, 272 editions) | This round, gate off (`final20-nogate`, 277) | This round, gate on (`final20`, 275) | Removed by the gate |
|---|---|---|---|---|
| demonstrative | 79 | 54 | 3 | 51 |
| definite | 94 | 90 | 8 | 82 |
| person | 25 | 23 | 3 | 20 |
| sequel | 55 | 41 | 0 | 41 |
| also | 229 | 236 | 65 | 171 |
| here | 13 | 13 | 0 | 13 |
| **all** | **495** | **457** | **79** | **378** |

`final20-nogate` is the same code and archive with the gate switched off (`LENGTHS_NO_GATE=1`, which only `untold` reads). The round-4 column is counted with this round's rules.

What still airs is mostly a line that follows the source sentence it answers. The writer saw that sentence said; the lint, matching shortened lines back to their source, could not:
- 56 of the 65 "also" lines open on "But" ("But history suggests it will lead to a very public fight.");
- the rest open on "Yet", "However" or "Also";
- "the move" after the impeachment vote it follows;
- "The girl's body…" after the sentence that names the girl.

**What it costs in length.** The same code with the gate off and on (voiced lengths; the editions differ a little, because the rotation changes which stories each programme gets):

| Programme | Gate off: avg / median, in range | Gate on: avg / median, in range |
|---|---|---|
| WORLD NOW | 506 / 552 s, 56 of 114 | 496 / 516 s, 46 of 113 |
| COSMOS | 394 / 412 s, 29 of 39 | 400 / 411 s, 31 of 38 |
| TECH BYTES | 376 / 405 s, 29 of 42 | 370 / 409 s, 31 of 43 |
| MONEY MINUTE | 257 / 282 s, 20 of 26 | 259 / 280 s, 19 of 25 |
| NEWS IN 60 | 62 / 62 s, 51 of 56 | 62 / 63 s, 52 of 56 |

WORLD NOW pays for it: 10 s on average, 36 s at the median, and ten editions fewer in range. The depth loop tells the next sentences instead of the leaning ones, but a nine-minute edition on a thinning desk runs out of them. In the other programmes the difference is within what the rotation alone moves.

### Name cards

- **A name is never cut.** `nameAt` (`server/boards.js`) no longer stops at four tokens, keeps a particle written with its capital inside a name ("Abdulaziz bin Salman Al Saud"), and skips a title before the name that is not the story's role ("Prince").
- **A role is the source's role.** When a word before the name is itself a role ("Energy Minister Prince…"), the two were glued together and the card takes neither.
- **A quote card is signed by a whole name.** A speaker too long for the card loses words from the front, never the back: "NASA Administrator Jared" is now "Administrator Jared Isaacman". A speaker that runs across a sentence boundary is no speaker ("Monday. He").

The DW sentence of 14 Oct now gives one card: "Abdulaziz bin Salman Al Saud (SAUDI ENERGY MINISTER)".

### The clock's worst bulletin

In round 4, NEWS IN 60 landed up to 271 s late, against 192 s in the baseline.

**Why.** The station plans the programmes before a mark with each programme's expected length. That was the average of its recent editions. An edition as long as the news allows is short one day and long the next: TECH BYTES ran 127 s on a thin desk and 470 s on a full one. After a run of short editions, the planner expected a short TECH BYTES, put it three minutes before the half hour, and a 400 s edition came out. The bulletin waited for it.

**The fix** (`Station.airBefore`, `server/station.js`): a run before a mark is planned halfway between the programme's estimate and the longest of its last four editions. Planned on the longest alone, the bulletin went 210 s early instead (`final11`).

**With this round's lengths** (`tools/lengths/clock.mjs` on `final20`, 24 h): NEWS IN 60 aired at 48 of 48 marks, none doubled. It landed a median 37 s off its mark, 90% within 157 s. The worst was 191 s early, and the latest 160 s late. The baseline's worst was 192 s, so the worst case is back to what it was. Round 4's was 271 s late.

The same planner on the earlier replays' lengths: worst 154 s on `final14` (round 4's own lengths, 271 s with the old planner), 158 s on `final11`, 187 s on `final9`. A test plays a day of round 4's lengths through the real station and holds the worst within 192 s (`test/fallback-lengths.test.js`, "round 5: the clock…").

### WORLD NOW on a thin desk

When the desk cannot fill nine minutes truthfully, the edition is as long as the news allows.
- The producer's depth loop already tells an edition again, deeper, while it is short.
- When the deepest telling is still short, the edition airs short. Nothing is added that is not the stories' own reporting.
- The extra-story rule still leaves the desk's last stories to the programmes after WORLD NOW.

**How the clock absorbs a short programme.** The station's day is a sequence, not a grid of slots, so a short programme only means the next one starts earlier. At every choice the station plans again:
- When the mark is more than one programme away, the rotation simply moves on.
- When the next programmes would run over the mark, it plans up to three of the next five candidates before it, so that the bulletin lands within its hold. The programmes it skips are owed, and made next.
- When the mark is within 90 s, the countdown clock holds until :00 or :30.
- When none of those fits, NEWS IN 60 goes early, which is closer to the mark than running over it.

On `final20`, WORLD NOW's 53 editions on a thin desk (fewer than 1.5 times the stories it can use) average 420 s, 2 in range. Its 60 editions on a full desk average 563 s, 44 in range. The shortest is `059`: 204 s from a desk of 8 stories, seven of them told. It was 130 s in round 4, from a desk of 7, and 330 s in the baseline, from a desk of 21.

The clock run above includes these short editions, and the bulletin still lands within its worst case.

### The open faults of round 4

Each of round 4's sixteen faults, as it stands after this round. The tests are named after them in `test/fallback-lengths.test.js` ("round 5: the open faults of round 4", "round 5: the last of the open faults", "round 5: what reading the final16 replay showed").

1. **A thin desk leaves WORLD NOW short.** Answered by policy, not by padding: see "WORLD NOW on a thin desk" above. On `final20` a thin desk gives 420 s on average (53 editions, 2 in range), against 442 s in round 4; a full desk gives 563 s (60 editions, 44 in range).
2. **Editions shorter than before.** Not fixed. This round made editions shorter again (see "Lengths" below): the gate costs WORLD NOW about ten editions in range, and a feature or a column now airs only on a desk that cannot fill the programme's fewest stories.
3. **Cards that mislead.** Fixed, each with a test:
   - "30 PEOPLE" and Kabila on a map of Rwanda: a France 24 programme blurb now keeps only its first item;
   - "ABOUT 2.3-BILLION YEAR-OLD MYSTERY": a qualifier is taken only from the occurrence of the figure that the label names;
   - "20 OTHERS": "others" ends a label;
   - the WHO card that cut a name and glued two roles (see "Name cards");
   - "NASA Administrator Jared": the quote card's speaker loses words from the front;
   - found on the way, "24 'S" from "France 24's": a name's number with its possessive is no figure.
4. **Page furniture read as news.** Fixed:
   - the France 24 blurb;
   - a video hand-over and "Coverage begins at…";
   - picture descriptions ("This nighttime image… shows", "Opaque white areas indicate…");
   - NASA's job listing and its technical bulletins ("TB 25-03…");
   - an email address and "Download the PDF version";
   - TechCrunch's own event (Disrupt, Startup Battlefield, "Battlefield 200");
   - a podcast's "this week in science";
   - a live page's "is speaking now". NEWS IN 60 now never airs a live page. In `final18` one filled its fifth item with a politician's words in the presenter's voice ("That’s 300 people a week, 300 lives destroyed…, The Guardian reports."), with a card for "300 PEOPLE A WEEK". The minute runs four items instead.
5. **Views in the outlet's voice.** Mostly fixed:
   - more words of a verdict: "certainly", "frankly", "admittedly", "might have nailed", "is chaos", "it looks like";
   - a headline's motive ("to ingratiate himself"), and a headline that quotes words without saying whose, are never said as the presenter's: the tease and the opener take the article's sentence, which says who;
   - a page labelled "Analysis:", "Comment:" or "Opinion:" is a feature, which airs only on a desk too thin for the programme's fewest stories. The label is read from the outlet's own title: the writer had been seeing it without the label, so the first version of this rule never fired, and its test passed by chance (found reading `final19`, test corrected);
   - an advice column's imperative ("Pick a day when…", "Imagine a universe where…") is the outlet talking to its reader.

   Still open: a claim with no word of a view in it ("is proving especially effective", "Meta is making up for lost time") cannot be told from reporting by a rule.
6. **News never told.** Partly fixed:
   - a story whose news is only in a sentence too long for the programme opens on its headline. "Founded in 1615, the Enfants Rouges market is the oldest covered food market in Paris." once told a fire;
   - a sentence that opens on an earlier time ("Last week, a BA flight bound for Chicago…", "Founded in…", "In August…") never opens a story;
   - a first sentence that shares no word with its headline never stands for the headline.

   Still open:
   - a lead that tells a reaction or a side detail before the news ("Khan's spokesperson… condemned the suspension…", "No protests were reported against the suspension…");
   - on NEWS IN 60, a side detail that shares a word with the headline, when the news sentence is too long for the minute ("Coconut crabs… emerge at night…" for "Crew searching for Amelia Earhart arrives at crab-infested island").

   Telling which sentence is the news needs a reading of what happened, which a rule over words does not have.
7. **Questions and answers that do not meet.** Partly fixed:
   - THE CATCH needs a real limit;
   - the price question needs a price;
   - "Who is this for?" is never answered by money;
   - "what comes next" and "when will we know more" need a date or a next step;
   - an appeal already decided is no next step: "And from here?" was answered by the news again ("…rejected after an appeal by the developer was dismissed", TECH BYTES `055`).

   Still open: an expert's or a correspondent's "what comes next?" answered by what has already happened (MONEY MINUTE `084`, WORLD NOW `160`), and "How do they know?" or "Walk me through how it works" answered by something else (COSMOS `237`, TECH BYTES `156`). The expert's questions are asked of the sentences they get, and that pairing has no check of tense or of kind.
8. **Leaning sentences inside a story.** The coherence gate (above).
9. **Broken sentences.** Three more cut rules:
   - a cut never leaves a reported clause without its verb (Tusk's "…a man accused of plotting an assassination attack against him.");
   - a cut never ends on a word that cannot end a clause ("…, a move that will.");
   - a cut never ends on a verbless clause after a dash ("…is not unusual - less than two weeks ago.").

   And a headline whose predicate is a "not" is never made a passive. "Mourners killed by Kenya police at ex-PM's national farewell not part of violence" aired as "Mourners have been killed by Kenya police… not part of violence, BBC finds.", which says the opposite of the finding.
10. **Headlinese.** Partly fixed: a headline made a sentence gives an acronym the article its outlet gives it ("The IEA has warned…", "The UK is to strengthen…"; never "The NASA"), and a people's name keeps its capital ("A Saudi national has been charged…"). Still open: a dropped article inside the headline ("…has detained man suspected of…", "…marched to Supreme Court").
11. **One event twice.**
    - Fixed: one company's news from two outlets, its name the headlines' first word and a word of what happened in common (Netflix's lay-offs). Of two reports of one event, the one with more to tell now airs, not merely the desk's first: The Verge's empty page once kept TechCrunch's report of Google's vibe-coded apps, and its expert, off TECH BYTES.
    - Still open: the two Facebook feed stories, whose headlines share only "algorithm"; two IMF stories whose headlines share no name.
12. **Kickers from a stray word.** Fixed:
    - CONFLICT on a cyber-attack, on cancer research and on a tax fight;
    - WILDLIFE on Amazon's Bee;
    - ELECTIONS on "ahead of" an election;
    - TRADE on game ports;
    - RESCUE on strikes at sea;
    - MIGRATION for deportations;
    - found again in `final19`: a war closing WORLD NOW as "And finally". "Both Russia and Ukraine are using AI-powered drones on the battlefield" closed five editions, with "That is the most cheerful thing I have read all day." after it. Round 4 had made war drones CONFLICT, but a curiosity's flag let the story through as the closer. A CONFLICT story is now never "And finally", on any programme.
13. **Lower case where a name is.** Fixed:
    - a word before an acronym or a colon keeps its case ("Cerebras CEO", "Faisal Islam:");
    - a headline subject that is an acronym or a name keeps it ("The UK economy", "A BA flight");
    - Britons, Brits and Saudis are peoples;
    - a name keeps its capital with its possessive after "And finally:" ("rivian’s startup", "flox's edge devices" aired in `final19`).
14. **Formulae.** Partly fixed:
    - a toss of two words goes before a hand-over;
    - after any COSMOS story but the lead, UNIT-8 speaks only when there is a figure or a place to restate.

    Still open: the correspondents' hand-overs and thanks repeat lines from the previous edition (0.4 presenter lines an edition). The UNIT-8 exchange after the lead is the COSMOS bible's own format ("Neither line adds a fact"), so whether it stays is the owner's decision.
15. **A quote overtaken by events; the same attribution twice.** Partly fixed: a sentence that already says what figures or a study show takes no outlet's credit too ("…, figures show, Guardian Business reports."). Still open:
    - "Tusk said on Sunday" said twice in one piece. Saying "he said" the second time needs to know who "he" is;
    - a quote overtaken by later news. The writer sees one story at a time and cannot know what happened after its article.
16. **NEWS IN 60 over its minute.** Fixed. The bible's floor of five stories stays, because the offline rotation test holds every slot to its floor. An edition still past its window at five stories now says one sentence less: the last sentence of its longest item, never an item's first sentence, its credit or its card's figure, and never if that would take the edition under 55 s. On `final20`, NEWS IN 60 is in range in 52 of 56 editions, against 51 in round 4. One runs 73 s: each of its items' last sentences carries the outlet's credit or a figure. Three run short, at 50 to 54 s; one of them has four items, where a live page once filled the fifth.

### Lengths (`final20`, the code as committed)

The one change after `final20` is a kicker word: GADGETS no longer comes from "monitor". It changes a label, not what is said.

| Programme | Target | Before: voiced avg / median / min–max | In range | Round 4 (`final14`) | In range | Round 5 (`final20`) | In range |
|---|---|---|---|---|---|---|---|
| WORLD NOW | 540–600 s | 377 / 370 / 255–502 | 0 of 116 | 512 / 544 / 130–626 | 52 of 113 | 496 / 516 / 204–613 | 46 of 113 |
| COSMOS | 360–480 s | 394 / 406 / 252–450 | 33 of 38 | 397 / 406 / 224–479 | 31 of 38 | 400 / 411 / 156–475 | 31 of 38 |
| TECH BYTES | 360–480 s | 439 / 455 / 230–503 | 25 of 41 | 395 / 410 / 127–470 | 35 of 41 | 370 / 409 / 79–450 | 31 of 43 |
| MONEY MINUTE | 240–360 s | 263 / 260 / 200–323 | 18 of 25 | 266 / 277 / 196–310 | 18 of 24 | 259 / 280 / 143–306 | 19 of 25 |
| NEWS IN 60 | 55–70 s | 74 / 74 / 61–85 | 13 of 55 | 64 / 63 / 55–77 | 51 of 56 | 62 / 63 / 50–73 | 52 of 56 |
| WORLD WEATHER (live forecast of 16 Oct 21:20) | 270–480 s | 239 / 239 / 234–246 | 0 of 24 | 286 / 286 / 280–293 | 24 of 24 | 286 / 286 / 280–293 | 24 of 24 |

| Programme | Full desk: editions, voiced avg, in range | Thin desk: editions, voiced avg, in range |
|---|---|---|
| WORLD NOW | 60, 563 s, 44 in range | 53, 420 s, 2 in range |
| COSMOS | 19, 422 s, 18 in range | 19, 378 s, 13 in range |
| TECH BYTES | 25, 414 s, 23 in range | 18, 308 s, 8 in range |
| MONEY MINUTE | 20, 270 s, 17 in range | 5, 213 s, 2 in range |
| NEWS IN 60 | 55, 63 s, 52 in range | 1, 50 s, 0 in range |

TECH BYTES now tells a read article to 640 characters at its deepest telling (`storyCharsDeep`, `config/channel.json`), as COSMOS and MONEY MINUTE already did. On a full desk it is in range in 23 of 25 editions.

**Edition by edition.** Against the baseline (`pairs.py`):
- WORLD NOW: longer by 30 s or more in 87 of 112 editions, shorter in 11.
- COSMOS: longer in 13 of 38, shorter in 6. Three editions that were in range are under it now.
- TECH BYTES: longer in 3 of 41, shorter in 26. Seven that were in range are under it now.
- MONEY MINUTE: longer in 9 of 25, shorter in 8. Four that were in range are under it now.

Against round 4:
- WORLD NOW is shorter by 30 s or more in 34 of 113 editions and longer in 19. 14 editions that were in range in round 4 are under it now.
- COSMOS, TECH BYTES and MONEY MINUTE each lose one to four editions from their range.

The shortest editions:
- TECH BYTES `207`: 79 s. Its desk held five stories: three TechCrunch and Verge promotions, one column ("I don’t miss the camera on the Ray-Ban Meta Audio glasses") and one science story. It airs the column and the science story, and the column's first-person headline goes out with "according to The Verge". It is an honest length, but the column should not air at all.
- COSMOS `291`: 156 s, from a desk of 4.
- MONEY MINUTE `030`: 143 s, from a desk of 6.
- WORLD NOW `059`: 204 s, from a desk of 8.

**Lint** (counts over all editions):
- headlines read word for word: 141 in round 4, 179 now. The gate and the stricter openers fall back on the headline;
- long sentences: 160, now 159;
- fragments: 103, now 91;
- views: 84, now 67;
- a speaker's words told as ours: 5, now 3 (`innerquote.py`: 5, now 3);
- the same event twice: 8, now 3.

**Facts.** `facts.py` on the thirty editions read finds no spoken figure or name that the sources lack. Its 25 flags are the cast's own hand-overs ("our Economics Editor, Omar Ledger") and the explainers' "in plain English".

### Faults found reading the editions of this round (who found them)

New editions this time, none read in an earlier round. Each was read in full against its `.src.txt`, and its figures and names were checked with `facts.py`:
- WORLD NOW `041`, `059`, `089`, `112`, `160`, `213`;
- COSMOS `038`, `076`, `114`, `196`, `237`, `263`;
- TECH BYTES `037`, `055`, `107`, `156`, `229`, `273`;
- MONEY MINUTE `084`, `186`, `210`, `233`, `257`, `270`;
- NEWS IN 60 `003`, `023`, `048`, `052`, `116`, `146`;
- WORLD WEATHER seeds `002`, `005`, `009`, `014`, `020`, `023`, on the saved live forecast of 16 Oct 21:20 UTC.

Notes per edition: `lengths/read5/NOTES.md`. Most were first read in `final16` or `final17`, as each was made, and fixed where a fix was found. Every fault below was checked again in `final20`.

Fixed during these readings, and gone from `final20`:
- the Paris market fire told only as "Founded in 1615…";
- BA's story opening on last week's Chicago flight and closing on Ryanair's window;
- "Imagine a universe where…";
- "Raphael Wimmer, the Computer scientist";
- "And from here?" answered by the news;
- the Sorkin story's "As for…" and "Or maybe…";
- "Two days later, Trump was back…";
- the bedbug cut "…not unusual - less than two weeks ago.";
- "Goldberg was…" for Ori Goldberg;
- a politician's words from a live page as a NEWS IN 60 item;
- the Kenya headline made a passive that says the opposite;
- war drones closing WORLD NOW as "And finally", five times, with "That is the most cheerful thing I have read all day.";
- "rivian’s" and "flox's";
- the BBC's analysis aired as news.

Still there:
1. **News told after a reaction, a detail or background, or not at all** (senior news editor).
   - "Khan’s spokesperson… condemned the suspension…" (NEWS IN 60 `023`, `116`).
   - NEWS IN 60 `048`: "the lab worker" for the WHO report; the crabs for the Amelia Earhart search; "Gun violence… is rare in France" for the school shooting.
   - MONEY MINUTE `084` and `270` lead on MI5's warning and on Netflix's share price.
   - COSMOS `076`, `196` and `263` open on a study's detail, on a fight's background and on a forecast's "very low confidence".
   - TECH BYTES `156` and `273` tell Google's May launch for its new feature.
2. **People and bodies nobody introduced** (first-time viewer).
   - Names: Khan, Ali Zardari, WGEA, Christine Castley, Phoebe Meagher, Silvana Tenreyro, Healey, McCallum, "Alfozan’s", Ross Benes.
   - Definite descriptions: "the organisation", "the university's laboratory", "the charity", "the advisory", "the three news organizations", "the lab worker", "The Kenyan American engineer".
   - Two unnamed women: "The 46-year-old" and "The 39-year-old".
   - Pronouns and counts: "He pours vinegar…", "Their findings…", "the increase", "Of those".
3. **Views with no word of a view** (standards editor).
   - "Meta is making up for lost time in the AI race".
   - "However, in reality, that might not be the case".
   - "As important as some of the messages… are".
   - "Ironically, claims…", which a "claims" lets through.
   - "the world's econ nerds".
   - The Blade Runner 2099 plot told as a report ("the humans have lost…, according to Ars Technica").
   - A columnist's analysis under his own name ("Faisal Islam: What… tells us").
   - A column's first-person headline on a desk of five (TECH BYTES `207`).
4. **Features and furniture on the news** (standards editor).
   - A consumer advice column leading MONEY MINUTE (`186`; also `210`, `233`).
   - An analysts' stock call as WORLD NOW's number of the day ("90% UPSIDE", `112`).
   - A football preview, "Predictions, teams", in WORLD NOW (`089`).
   - A related headline read as the expert's line ("VW boss backs EU plan…", `041`).
   - "…as Ben Rich explains" (`114`) and "The images include only areas where…" (`107`).
   - "this morning" in an edition at 20:29 UTC (`041`).
5. **Headlinese, fragments and cuts** (writing).
   - Headlinese: "Greece has announced 30% increase…", "Poland has detained man…", "Israeli strike on tent… has killed three", "EU has warned online platforms…", "DNA recording system has revealed…".
   - No verb: "Epic Games reportedly pivoting…", "Freshwater turtles rescued from a dried-up water hole…".
   - A standfirst read as a sentence: "Why Indian voters are on the streets."
   - The place said twice: "In the United States, a 'Jellyfish' effect lit up the sky in US".
   - Cuts that end on "…in part." (`156`) and "…show that minutes passed." (`160`).
   - The lint counts 179 headlines read word for word, against 141 in round 4. The gate and the stricter openers fall back on the headline.
6. **One event or one fact twice** (senior news editor, director).
   - Two stories on one event: the Facebook feed stories (`229`, `273`), the IMF forecasts (`084`), the archbishop (`089`), the French pupils' protests (`112`).
   - One fact twice in a story: Greece's 30%, Bumble's sale, the social supermarket's standfirst, Sibiya's denial.
7. **Questions and answers that do not meet** (first-time viewer).
   - "what comes next?" answered by what has happened (`084`, `160`).
   - "How do they know?" (`237`) and "Walk me through how it works" (`156`) answered by something else.
   - THE CATCH answered by "Despite the president’s pushback, however, …" (`055`, `107`).
   - "I would like to see the figures from someone who is not selling it." after a story with no figures (`107`).
8. **Formulae** (director, first-time viewer).
   - UNIT-8's exchange after a lead with nothing to restate ("Logged, Dr Reyes.", "Entered in the record. With a small flag." / "Clear as always, UNIT-8.").
   - A place restated ("Mexico." / "Thanks, UNIT-8. That helps.").
   - TECH BYTES' closing sneer ("Software with ambition. What could possibly go wrong.").
   - The hand-overs and thanks repeating lines from the previous edition (0.4 an edition).
9. **Kickers, capitals and a card** (director, writing).
   - Kickers: EDUCATION on the Portugal budget, SOFTWARE on women leaders, WILDLIFE on urban beekeepers, HEALTH on an obituary, CONFLICT on a youth prison.
   - Capitals: "air France-KLM" and "TAP air Portugal"; "the Archbishop" and "the Founder".
   - A "35-YEAR-OLD" fact card on the OpenAI arrest.
   - GADGETS on Sudan's famine warning, from "a food crisis monitor", was fixed after `final20`. It changes the label only.
10. **Taste in a short bulletin** (standards editor):
    - "Gibney is a douche" quoted in NEWS IN 60 (`052`);
    - the Rwandan genocide's 800,000 dead, with no genocide named (`116`).
11. **WORLD WEATHER** (writing, director):
    - "near Cook Islands";
    - HOT and COLD ranks two cities, both at 40 degrees, third and second;
    - "Have a good day" at 21:20 UTC.
12. **Lengths** (director).
    - WORLD NOW is in range in 46 of 113 editions, six fewer than in round 4; on a full desk 44 of 60, as before.
    - TECH BYTES is in range in 31 of 43.
    - Editions of 79 s and 156 s on desks of four or five stories.

### Scores

The same hard panel, on `final20` and the readings above.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Truth | 6.0 | news told after a detail, or not at all (1); views with no word of a view, a plot told as a report (3); features and furniture read as news (4). The gate removes 378 leaning lines; the quotation fault is at 3 lines; no figure or name was found that the sources lack |
| Writing | 5.5 | people and bodies nobody introduced (2); headlinese and fragments (5), with more headlines read word for word than in round 4 |
| Length | 5.5 | WORLD NOW 46 of 113 in range, 6 fewer than in round 4 (on a full desk 44 of 60, as before); TECH BYTES 31 of 43; editions of 79 s and 156 s. NEWS IN 60 is in range in 52 of 56, and the clock's worst bulletin is back within 192 s |
| Rhythm and variety | 5.5 | one event or one fact twice (6); answers that miss their questions (7); formulae (8) |
| Robustness | 6.0 | the gate is one module that both the writer and the lint ask, with a switch to measure it; but each rule was written after its fault aired; the label rule never fired until a reading caught it; GADGETS from "monitor" on a famine |
| Tests | 8.5 | 79 tests in `test/fallback-lengths.test.js`, each from a real case; one passed by chance until it was corrected; most faults above have none |

**Round score: 5.5** (writing, length, rhythm and variety). Round 4 scored 5.5 too. The target of 9.7 was not reached: see "What round 5 did not do".

### What round 5 did not do

- **The target of 9.7 was not reached.** What keeps the score down is in the readings above:
  - news told after a reaction or a side detail;
  - people and bodies named without saying who they are;
  - headlinese;
  - one fact said twice;
  - UNIT-8's exchange after a lead with no figure.

  Each of these needs to know what a sentence is about: which sentence is the news, who a name is, whether two sentences say the same thing. A rule over words gets part of the way, and every rule this round was written after a fault had aired.
- **Faults found while reading the final replays were fixed, and the replay run again.** `final16`, `final17` (twice), `final18` and `final19` were each stopped or superseded when a reading found a fault worth fixing. The last such faults are the war closing WORLD NOW as "And finally", the live page on NEWS IN 60, the "Analysis:" label read from the wrong title, and "rivian’s". The code was then frozen, and `final20` is the replay of that code. Faults found reading `final20` are listed above and left open.
- **"Thank you. Exactly right," cut after its comma.** In the replays, two of Nova's thanks to UNIT-8 aired cut short. The cut was traced through the writer, the normaliser, the glossary, the fit and the review stages without being found. The two lines were rewritten instead ("Exactly right, UNIT-8. Thank you.").
- **No new recording.** Round 4's recording of WORLD NOW `028` stands. Round 5 changed what airs, not how it plays.
- **Not touched:** `docs/programmes/play.md`, `tools/play/`, port 8711, and the main checkout's processes and data.

## Round 6: truth and standards only

Round 5 scored 5.5 and was merged into the main branch (`e08011c`). The reviewer judged that the fallback writer had reached its ceiling on writing and rhythm: it is an extractive writer, and broadcast prose is the AI writer's job. The last round was therefore narrowed to **truth and standards**, six faults the readings had found:
1. views with no word of a view;
2. people nobody introduced;
3. an advice column leading MONEY MINUTE, and anything else the news desk calls no news reaching air;
4. one event told twice in an edition;
5. questions and answers that miss;
6. a kicker from a stray phrase, playful on a grave story.

Length, writing, rhythm and variety, robustness and tests were not worked on. **Their scores stay as round 5 left them.**

The main branch was merged first. It had not moved since `e08011c`, so the merge was a fast-forward.

The tests are in `test/fallback-standards.test.js` (new): 48 tests in nine blocks, one for each fault and three for what the readings found, each case as it aired. One more is in `test/correspondents.test.js`.

### What was changed, fault by fault

1. **Views with no word of a view** (standards editor).
   - **The outlet's framing is a view, whoever the sentence quotes.** Round 5 aired "Ironically, claims that the drone strikes hindered Russian disinformation campaigns appears to be a form of disinformation itself, no matter what Zelenskyy says" five times. Its "claims" and "says" made it someone's. A sentence with the outlet's framing now goes whoever it quotes (`server/facts.js`, `outletView`). The framing words include:
     - "ironically", "in reality", "might not be the case";
     - "making up for lost time", "As important as…";
     - "nerds", "a little unusual", "Not that…", "it's probably".
   - **The outlet's praise is a view as much as its blame.** A sentence goes unless someone is said to hold the view. The words include:
     - "stunning", "remarkable", "spectacular", "iconic", "impressive", "illustrious", "much-needed";
     - "encouraging", "wayward", "doubtful", "supposedly".

     A term stays: "striking workers", "an extraordinary general meeting", "Revolutionary Guards".
   - **In a headline, on the strap and in a tease, the praise word goes** and its article is fitted (`calmTitle`). "Striking new images show…" is said "New images show…"; "a hefty US Air Force contract" becomes "a US Air Force contract".
   - **A headline that holds the outlet's own guess is no news** (`notNews`): "The Yandex outage probably didn't blitz Russian bots", "It looks like Apple Music is getting new icon".
   - **A film's or a series' plot is never told as news.** Only what is made, released or earned is told. Round 5 aired "2099 is taking place at a junction point when one species is ending…" six times.
   - **TECH BYTES' sneers are gone**: "I would like to see the figures from someone who is not selling it.", "Software with ambition. What could possibly go wrong.", "Impressive. Also slightly worrying.". Its characters keep their curiosity and their taste.
   - **A column, a review or a feature that the desk lets through never airs**, not even to fill a short programme. The programme is shorter instead.
   - **Never a question in the outlet's voice, nor "At the time of writing".** A cut once said "– can she flip a key swing seat?" as a claim.
2. **People nobody introduced** (first-time viewer, standards editor).
   - **A speaker is said with the role the source gives** (`introducePeople`). The role comes before the name ("Pakistani President Asif Ali Zardari", "physicist Kostya Trachenko") or beside it ("Ross Benes, a senior analyst at eMarketer", "Christine Castley, WGEA's chief executive", "Jason Honeyman, who has led Bellway since 2017").
     - A subject the line tells of gets a role too, when the story has said none ("Kanishka Narayan, the AI minister, will call on…"); after "…as minister calls for AI firms to increase safety efforts" the name is enough.
     - A speaker the source never introduces does not air. An opener with one gives way to the headline.
   - **A surname the headline gives alone is said whole the first time**, in a story and in a tease (`wholeSurnames`): "Chancellor John Healey faces £35bn Budget challenge…".
   - **Part of a name is said whole**: "Ali Zardari acted…" becomes "Asif Ali Zardari acted…".
   - **Hyphenated surnames are found**: "Amiry-Moghaddam", "Lamarre-Condon".
   - **A surname the source never gives whole does not air** when it belongs to someone who argues or speaks: "Canestrini and his colleagues argued…", "said Mannon, 63".
   - **An organisation's letters are said whole the first time**, as the source writes them. "WGEA warned…" becomes "The Workplace Gender Equality Agency warned…".
   - **A quotation's "he said" airs only after the sentence that says who he is.**
   - **These checks now run on every line that names someone**: the opener, the line kept back for after a story ("And this matters too: if convicted, Duterte could…"), THE CATCH, UNIT-8's answers and the tease. In round 5 they ran only on a story's later lines.
   - **The coherence gate knows more bodies and people that the story must have met first**:
     - bodies: "the organisation", "the charity", "the university", "the advisory";
     - people: "the lab worker", "the Kenyan American engineer", "the artisan", "The 46-year-old";
     - counts: "the three news organizations", "Both served as…";
     - things pointed back at: "that paperwork", "that hearing", "In that state";
     - leaning openings: "That was…", "That could…", "Gibney replied…";
     - "the increase".

     A body the story named is "the organisation" afterwards, but only a body of that kind: a charity must be a trust, a society or a fund. A trade after a named person refers to that person ("the actor"). The gate still lets a sentence through when the one before it in the source was told: "the artisan" airs that way (still open).
3. **What the news desk calls no news** (standards editor).
   - **`notNews` now also catches**:
     - advice: "Five signs your house is leaking heat", or a summary that gives an instruction;
     - a page's label: "Analysis:", "Comment:";
     - a columnist's question under their name: "Faisal Islam: What… tells us";
     - a column in the first person: "I don't miss the camera…", "BT charged me…";
     - an outlet's own event or offer: TechCrunch Disrupt;
     - a match's predictions;
     - a headline's guess;
     - a headline that is only a quoted question, or a yes-or-no question;
     - a podcast's page;
     - a picture's page (NASA's image articles and photojournal).

     It never catches a report's "What we know about…", a study's "we still don't think…", everyone's "our cells", "World War I", or a question its own headline answers ("Was Neanderthal life violent? This wound suggests…"). Over the archive it newly drops 39 of 1,130 stories, and each of them was read: columns, promotions, podcast and video pages, picture pages, explainers, headlines' guesses. None is a report of news.
   - **The writer drops whatever `notNews` drops**, whoever passed it on. It never airs a column or a feature at all, and no column leads while a report is there.
   - **An analysts' stock call is never the number of the day** ("90% UPSIDE").
4. **One event told twice** (senior news editor).
   - **`sameReport` (`server/news.js`) joins two reports of one event.** It needs one of three signs:
     - they share a quoted name;
     - they share two words of their headlines and a name in their ledes;
     - they name the same person and share a rare word.
   - **The desk and the writer ask the same rule.** The desk's `sameStory` and the writer's `sameNews` both use it, so the desk groups the reports before the rundown is built and the writer agrees.
   - **It joins**: the Facebook feed stories, the IMF's UK forecast told twice, the archbishop told twice.
   - **It never joins**: two hurricanes, two school shootings, two start-ups' funding rounds, a match and a club.
   - **A name counts only when a lede writes it mid-sentence, or in capitals.** A headline's first word is not a name: "Storm hits Florida coast…" and "Storm hits Texas coast…" are two storms.
   - **Over the archive** it joins 373 pairs of stories within 36 hours. The list was read for false joins.
5. **Questions and answers that miss** (first-time viewer).
   - **One rule says what a question asks for and what an answer must say to give it** (`missesQuestion`, `server/correspondents.js`):
     - "what comes next?" needs a future or a date, outside quotation marks;
     - "How do they know?" needs a method;
     - "how does it work?" needs a mechanism;
     - "what does it cost?" needs a price;
     - "what is behind it?" needs a cause;
     - "what is the catch?" needs a limit or a cost, never good news.
   - **A future is now a future said as one.** Round 5 asked "what comes next?" of "stronger than expected" and "as the war continues".
   - **When the answer misses**:
     - a writer's prompt is asked again in words the answer fits;
     - a second exchange that still misses is dropped;
     - THE CATCH and UNIT-8's exchanges are dropped;
     - an expert's first question is chosen from those its answers give.
   - **THE CATCH never answers with a contrast to a sentence the viewer did not hear** ("Despite the president's pushback, however, …").
6. **Kickers** (senior broadcast director, standards editor).
   - **A grave story takes a topic fit for it, never a playful one.** A grave story is one where people are killed or dead, or where there is a famine. Round 5 put:
     - SOFTWARE on a hiker found dead;
     - WILDLIFE on a man killed by a tiger;
     - TRADE on officials killed near a port;
     - TRANSPORT on a deadly derailment;
     - GADGETS on a famine.
   - **New topics for grave stories**: a famine is HUMANITARIAN, a fire set on purpose is CRIME, a deadly collapse is ACCIDENTS. An animal's death, an ancient one and an actor's keep their own field.
   - **Kickers from stray words are gone**:
     - a technology's topic found only in the summary of a story from another section (GADGETS on a TV station raid, AI on the IMF's forecast);
     - a war or a fire that a business story's summary mentions in passing (the IFS's budget warning, a travel survey);
     - a list before a colon: the headline is about what follows it (the Portugal budget is ECONOMY, not EDUCATION);
     - a camera's footage (an ICE vehicle hitting a man is MIGRATION, not PRIVACY).
   - **Over the archive** the strap changes for 45 of 1,116 stories. Each change was read.

Found reading `final21`, the first replay of round 6, and each replay after it (`final22-partial`, `final22b` to `final22l`), and fixed before the final replay:
- a wire's dateline, read twice and with its agency: "WARSAW, Poland — Poland is blaming…";
- a cut that ends on a time needing what it is the time of: "He met Keir Starmer at Downing Street the day.";
- one correspondent handed over twice in the same words in one WORLD NOW;
- "this morning" said at 18:21 UTC. A time of day now airs only within four hours of the story's own time;
- "Gibney is a douche" quoted in NEWS IN 60. No vulgar word is quoted into a bulletin;
- "What ice cream has to do with this year's Nobel Prize…", an explainer's headline read as news;
- the role lost to a tease's breath: "Still to come: Jason Honeyman welcomed…";
- "according to Dima Romashin, Efferon’s co-founder and CEO,.";
- "NATO 's";
- "24 TRAVELLED" on a card, taken from the number in "France 24". A channel's or a craft's number is not a figure;
- "France 24 travelled to … to find out more", the outlet's own trip read as news;
- "Mannon's 300 cattle…", a surname the source never gives whole, its possessive before a number;
- "Hiep is the latest Australian human rights campaigner…" in a round-up. A round-up's items and headlines now get the same name checks;
- OCEANS on "Oil tanker reportedly attacked". An attack on a ship is CONFLICT;
- a place's possessive taken for a stranger's name ("Amsterdam’s main airport"), found by the full suite;
- two storms joined as one event by a headline's first word, also found by the full suite;
- "The The Foschini Group": an organisation's letters said whole kept the name's own article and added another;
- "NASA the Jet Propulsion Laboratory" and "The Foschini Group London": letters inside a longer name ("NASA JPL", "TFG London", the UK arm of The Foschini Group) are now left as they are;
- "Fattah al-Burhan": a surname is said with all the given names the source gives it ("Abdel Fattah al-Burhan"), never the last one alone, and a common word that opens a sentence is no given name ("Friends Malcolm");
- **quotation cards by a name the viewer never heard**: "— Griffiths", "— Kogan", "— Bekker", "— Jha", "— Donna". In round 5's final replay 192 of 840 cards named their speaker by one word the edition never said. A card now gives the whole name the source gives ("— Beverley Griffiths", "— David Kogan", "— Malcolm Butcher"), the name as the story said it ("— Apple"), or no card ("— Donna", whose surname the source never gives). The quote check (`groundQuote`, `server/facts.js`) accepts the whole name when the source writes it;
- "As Sunday. Friends Malcolm put it" and "As Manchester City Kogan put it", found writing the cards' test: a speaker's whole name ran across a sentence's end or a headline's end. It now stays within a line, and a list's plural ("Friends Malcolm Butcher, 82, Jim Tyler, 81…") is no one person's role;
- "this morning" at 18:21 UTC again, in the round-up (France 24's morning video, its feed dated 40 minutes before). A time of day now airs only when it is that time where the story is, as well as near the story's time;
- WORLD NOW's lead on the Yandex strike told only its background ("Both Russia and Ukraine have stepped up attacks…"). The coherence gate took "- the third attack on the Russian tech giant's sites this week" for a sequel nobody had told, though the headline counts it; and the opener, shortened, had to keep "Ukraine", which the intro had just said. A count the headline gives is now no leaning, and the names the intro said need not be kept. The lead now opens "Yandex has been forced to pause its operations at a data centre near Moscow." In a deeper telling, the same rule had let another event the article tells further down open the story ("On Saturday, at least 20 people… were killed in Russian attacks on Zaporizhzhia", for want of the headline's "Russian" in the shortened news sentence); it no longer can;
- "Republicans seem keenly aware of the discord and frustration among farmers." with no credit: the outlet's reading of a group's mind is a view;
- "Transporter-18 SmallSats Encapsulation" and "NASA’s Record-Setting Perseverance Rover Team" read as COSMOS stories: a picture's page (NASA's image articles and photojournal) is no news;
- found reading the replay after these fixes: the Yandex story, no longer the lead, opened on "Russia has previously also struck Ukrainian data centres…". The writer's check took the "also" for a lean and dropped the story, but three WORLD NOW intros still teased it. A story now never opens on "also", wherever the sentence stands in the article. And the intro never teases a story that does not air: a line that teases only a dropped story leaves the intro, its cues kept (`server/writer.js`). Round 5's final replay had one such intro (`101`, the arson victims);
- "Meanwhile, H&M is investigating a separate claim that it was attacked by a notorious hacking group. The retail group reportedly told customers in an email that it did not believe customers' payment information had been affected." In the source, "the retail group" is TFG, named in the sentence the cut left out; on air it was H&M. A business described by its kind and not named ("The retail group", "The tech company") now follows only the sentence that names it, unless the story has said it in those words. (Tried on every body first, the rule took "The organisation's latest report…" after "the IMF said" for a lean and dropped the forecast MONEY MINUTE `180`'s headline is about; a public body stays the coherence gate's, which knows the IMF is an organisation);
- "On Monday Narayan confirmed that AISI was conducting tests…" and "“It seems likely, if not inevitable, that our own cyber defences will be breached,” said Narayan.": a weekday before the surname was taken for part of a longer name, so the AI minister was never said whole nor introduced. A weekday or a month is no part of a name: the line now says "Kanishka Narayan, the UK's AI minister". (Tried on every sentence-opening word first, the rule took "Kosanica" in "In Kosanica, Montenegro", a place the gazetteer lacks, for a stranger, and the line went);
- "“We have repeatedly made clear to Iran…,” he wrote on X." after "The group is already under UK sanctions…". The check that a quotation's "he" follows a line naming someone matched any two capitalised words case-blind, so "The group" passed. It now needs a whole name with its capitals or a role, and an outlet's credit ("according to Pixelburg Post") names no speaker.

### How it was measured

- **`tools/lengths/standards.mjs`** (new) counts the six faults by airing over every edition of a replay. Like the lint, it flags and never rewrites, and a flag can be wrong. Its classes:
  - `view`: a judgement in the presenter's voice that nobody is said to hold ("Ironically, …", "in reality", "an impressive $27 million"), in a headline, a story, a correspondent's or an expert's line;
  - `banter`: a presenter's sneer at a story;
  - `bare`: a person by a surname, or part of a name, that the edition never said whole before;
  - `roleless`: a person's whole name, said for the first time with nothing to say who they are, when the source says it;
  - the same two in a headline (`bare-headline`, `roleless-headline`), counted apart, because outlets write headlines that way ("Russell Brand arrives for his trial");
  - `bare-card`: a quotation card whose speaker is one word the edition never says ("— Griffiths");
  - `not-news` and `lead-not-news`: a story the news desk calls no news, on air or as the lead;
  - `same`: two stories of one event in one edition, by the desk's `sameStory`;
  - `miss`: a question its answer does not answer;
  - `kicker`: a playful or stray topic on a grave story's strap, or a technology's topic from a stray word.
- **The lint's coherence classes** (`untold-*`), with this round's wider gate (`server/coherence.js`), on both replays.
- **The replays.** `final20` is round 5's final replay. `final21` was round 6's first. Reading it found faults that were fixed, and so did reading each replay after it: `final22-partial` and `final22b` to `final22l` were stopped when a reading found a fault worth fixing (the last were the Yandex lead, the intros that teased it, H&M's "retail group", the IMF forecast that the fix for it dropped, and "On Monday Narayan"). `final22` is the replay of the code as committed. All use the same archive, desk and article pages. Every count below runs today's rules over `final20` and `final22`, so the before and the after are measured alike.

### Airings removed

Counted by `tools/lengths/standards.mjs` over every edition of each replay (275 in `final20`, 268 in `final22`), with today's rules on both. A flag is a pointer, not a verdict: the `roleless` class mostly flags bodies and headlines. `final22` has seven fewer editions than `final20` (the producer did not make them, see the lengths below), so a few of the airings removed went with whole editions.

| Fault | Class | What it flags | Round 5 (`final20`) | Round 6 (`final22`) | Airings removed |
|---|---|---|---|---|---|
| 1. Views | `view` | a judgement in the presenter's voice nobody is said to hold | 114 | 3 | 111 |
|  | `banter` | a presenter's sneer at a story | 21 | 0 | 21 |
| 2. People | `bare` | a person by a surname or part of a name never said whole | 73 | 32 | 41 |
|  | `bare-headline` | the same, in a headline | 16 | 10 | 6 |
|  | `roleless` | a whole name said first with no role, the source giving one | 362 | 190 | 172 |
|  | `roleless-headline` | the same, in a headline | 8 | 5 | 3 |
|  | `bare-card` | a quotation card by one word the edition never says | 192 | 0 | 192 |
| 3. No news | `not-news` | a story the desk calls no news, on air | 56 | 0 | 56 |
|  | `lead-not-news` | the same, as the lead | 5 | 0 | 5 |
| 4. One event twice | `same` | two stories of one event in an edition | 12 | 0 | 12 |
| 5. Answers that miss | `miss` | a question its answer does not answer | 24 | 0 | 24 |
| 6. Kickers | `kicker` | a playful or stray topic on a grave story, a technology's topic from a stray word | 53 | 0 | 53 |
| (found reading) | — | an intro that teases a story the edition never tells (`teased.py`) | 1 | 0 | 1 |
| (found reading) | — | an outlet's "this morning", "tonight" said at another time of day (`daypart_count.py`) | 6 | 0 | 6 |

The lint's classes on the same two replays (`tools/lengths/lint.mjs`):

| Lint class | Round 5 (`final20`) | Round 6 (`final22`) |
|---|---|---|
| `headlinese` | 179 | 207 |
| `long` | 159 | 178 |
| `untold-also` | 95 | 90 |
| `fragment` | 91 | 100 |
| `opinion` | 67 | 78 |
| `untold-definite` | 59 | 14 |
| `thin-lead` | 31 | 36 |
| `quote-context` | 24 | 22 |
| `untold-sequel` | 23 | 0 |
| `leans` | 20 | 15 |
| `untold-demonstrative` | 18 | 13 |
| `untold-person` | 13 | 7 |
| `boilerplate` | 6 | 3 |
| `typography` | 5 | 7 |
| `double-attribution` | 4 | 1 |
| `same-event` | 3 | 0 |
| `speaker-words` | 3 | 6 |

The six `speaker-words` flags of `final22` are one sentence ("France is among the countries where a litre is most expensive…"), aired six times. It is the outlet's own sentence, not a quotation: the article leaves a quotation mark unclosed further up, and the lint reads the quotation as still open.

### Lengths, for the record

Round 6 did not work on length, and the length score stays as round 5 left it. Its fixes take lines off the air when they cannot be told truly (a speaker with no role, a column, a line that leans on one left out), so the lengths are given for the record: `final22` against round 5's `final20`, the same archive, desk and article pages.

| Programme | Target | Round 5 (`final20`): voiced avg / median / min–max | In range | Round 6 (`final22`) | In range |
|---|---|---|---|---|---|
| WORLD NOW | 540–600 s | 496 / 516 / 204–613 | 46 of 113 | 496 / 520 / 182–622 | 43 of 114 |
| COSMOS | 360–480 s | 400 / 411 / 156–475 | 31 of 38 | 380 / 394 / 259–452 | 24 of 37 |
| TECH BYTES | 360–480 s | 370 / 409 / 79–450 | 31 of 43 | 401 / 410 / 210–471 | 33 of 38 |
| MONEY MINUTE | 240–360 s | 259 / 280 / 143–306 | 19 of 25 | 248 / 253 / 87–295 | 16 of 23 |
| NEWS IN 60 | 55–70 s | 62 / 63 / 50–73 | 52 of 56 | 61 / 61 / 45–68 | 51 of 56 |
| WORLD WEATHER | 270–480 s | not changed by round 6 (`weather-r6final/`, the same forecast: as round 5) | | | |

Editions the producer did not make, for want of enough stories on the replay's thin desk (its floor): WORLD NOW 7 then 6, COSMOS 7 then 8, TECH BYTES 0 then 5, MONEY MINUTE 2 then 4, NEWS IN 60 5 then 5. The new ones are desks that held mostly what the news desk now calls no news: TECH BYTES `022` and `042` of round 5 aired product reviews ("Mechanism’s first Switch 2 case is as awesome…", "OnePlus 16 is firm’s most interesting phone"), `207` a column. The live desk holds every story the feeds carry, so this replay's desk is thinner than the live one; that is a claim about the live desk, not a measurement of it.

The shortest edition is MONEY MINUTE `072` at 87 s: its desk held five stories, three of them a headline with no article. COSMOS has seven fewer editions in range and MONEY MINUTE three: this round's checks take lines and stories off the air, and it added nothing in their place. TECH BYTES has more in range (33 of 38), because its shortest editions of round 5, reviews and a column, are no longer made.

### Readings (who found what)

New editions, none read in an earlier round. Each was read in full against its `.src.txt`, and every spoken line of a story, a chat and a cross was checked with `facts6.py`:
- WORLD NOW `024`, `026`, `045`, `063`;
- MONEY MINUTE `078`, `180`, `220`, `246`, and `084` again;
- COSMOS `056`, `082`;
- TECH BYTES `020`, `080`;
- NEWS IN 60 `014`, `029`;
- WORLD WEATHER seeds `010` and `016`, on the saved live forecast of 16 Oct 21:20 UTC.

Notes per edition: `lengths/read6/NOTES.md`, with copies of the editions. Most were first read in `final22d` to `final22l` as each was made, and fixed where a fix was found (see the list above). Every note was checked again in `final22`.

**Nothing false was found.** `facts6.py` finds no spoken figure or name that the sources lack; its only such flags are the cast's own hand-overs ("our Economics Editor, Omar Ledger") and once the station's own place before a story ("In the United Kingdom, …" for "the UK"). No time of day is said at the wrong hour, no quotation is said with nobody saying it, no card names its speaker by one word the edition never said.

Still there, by who found it:
1. **News told after background or a side detail, or only by its headline** (senior news editor).
   - NEWS IN 60 `029`: "one person… was killed" and the stakes, never that the terminal was struck again; the cut dropped "in the latest attack".
   - MONEY MINUTE `084`: last week's BA flight told for this week's, whose details go as the headline said again.
   - MONEY MINUTE `180` and `220`: the Heathrow boss's warning only on the card; the story is the runway's history.
   - MONEY MINUTE `220` and `246`: the skincare scheme told by one victim, then by NPR's investigation, never by what it found.
   - WORLD NOW `024`: the reaction to a Burnham statement that is never given.
   - TECH BYTES `080`: "Astronauts will install the arrays…", the cargo launch never told.
   - WORLD NOW `045` and `063`: the Yandex lead now says the news, but never that it was a Ukrainian drone strike nor that no one was hurt.
2. **A view, an analysis or a company's claim said as news** (standards editor).
   - WORLD NOW `026`: the Guardian's unlabelled analysis leads ("The fate of Yemen was not going to shift votes in Kansas or Alaska.").
   - NEWS IN 60 `014`: Al Jazeera's analysis of the Sudan strikes as an item ("…expose deepening border lawlessness and regional instability").
   - TECH BYTES `020`: two executives' view as "TechCrunch reports"; TECH BYTES `080`: Ars Technica's verdict as the catch ("it's not a real smartwatch"), Google's own example as the expert's fact.
   - COSMOS `056` and `082`: a press release's praise and hook ("vanillin has powerful properties", "Getting better sleep might be as simple as…", "“astonishing” property of light").
   - MONEY MINUTE `180` and `246`: a photo feature on a flooded amusement park as a story; MONEY MINUTE `246`: a feature on Copenhagen's urban beekeepers ("Is the modern economic system broken? These urban beekeepers think so…") as a story, put to the Economics Editor.
3. **People, things and counts nobody introduced** (first-time viewer).
   - "the blaze" (`026`, `045`, `063`), "Those storms" (`024`), "Of those, 135,000" (`045`), "the artisan" and its card (`026`, `045`), "the error" (`180`), "Human hands provide a familiar example" (`082`).
   - "AISI" never said whole (`220`): its letters are not the initials of "AI Security Institute" word by word.
   - Dawn Myers never said to be a founder (`020`); Halima never introduced, and "Asho Hassan" for "Asho Hassan Abdi" (`024`); the football regulator's chair and the marine veteran named only on their cards (`078`, `063`).
4. **The accused not called so** (standards and legal editor): "…which Zack Coughlan showed officers", and "the defendant" never said to be him (`026`).
5. **Questions and closing lines that miss** (first-time viewer, director): "So who notices the difference?" answered with a camera feature, and "The second version is usually the one to buy." after a start-up with no second version (`080`).
6. **Kickers from a stray word** (director): HISTORY on octopus genetics (`082`), CHIPS on the HomePod (`080`), CONFLICT on the IMF's forecast, from its headline's "war" (`220`).
7. **One event in two stories** (senior news editor): the Riyadh terminal strike and the CCTV of people taking cover may be one attack (`029`); their headlines share one word.
8. **WORLD WEATHER** (first-time viewer, writing): "near Cook Islands"; two cities ranked third and second at the same 40 degrees; "this afternoon" for Mumbai at 21:20 UTC.

### Scores

The same hard panel, on `final22` and the readings above. This round scored **truth** and **standards** only. Standards is scored apart for the first time: what a broadcaster may put on air (a view only with whoever holds it, people introduced, no column or furniture as news, one event once, answers that answer, a strap that fits the story's gravity). **The other categories stay as round 5 left them**: this round did not work on them, and they were not scored again.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Truth | 7.5 | Nothing false was found: no figure, name or time the sources lack, no quotation without its speaker, no card naming its speaker by one word the edition never said. What keeps it down is what is misattributed or left out. An unlabelled analysis leads WORLD NOW `026`, and another is a NEWS IN 60 item (`014`). An outlet's verdict, two executives' view and a company's own example are said as fact (TECH BYTES `020`, `080`). A press release's hook and praise air as ours (COSMOS `056`, `082`). And a story can still lose its news to background or a side detail (NEWS IN 60 `029`; MONEY MINUTE `084`, `180`, `220`, `246`; WORLD NOW `024`; TECH BYTES `080`). Round 5 scored 6.0 |
| Standards | 8.0 | By the detector, views in the presenter's voice, sneers, no news, kickers, answers that miss and one event twice are nearly gone, and so are cards by a name the viewer never heard (the table above). The readings still find: the accused not called so (`026`); things and people nobody introduced ("the blaze", "the artisan", "Of those", "the error"); features told as stories in MONEY MINUTE (`180`, `246`); three kickers from a stray word (`080`, `082`, `220`); a closing line that fits nothing (`080`) |
| Writing | 5.5 | as round 5 left it |
| Length | 5.5 | as round 5 left it (the lengths above are for the record) |
| Rhythm and variety | 5.5 | as round 5 left it |
| Robustness | 6.0 | as round 5 left it |
| Tests | 8.5 | as round 5 left it; this round adds `test/fallback-standards.test.js`, every case as it aired |

**Round score: 5.5** (writing, length, rhythm and variety, as round 5 left them). **The goal of truth ≥ 9.7 was not reached.** What stands between 7.5 and 9.7 is under "What is still open".

### What is still open

- **The goal of truth ≥ 9.7 was not reached.** Nothing false was found. What keeps truth and standards down is in the readings above, and each kind needs to know what a sentence claims and whose claim it is, or which sentence is the news:
  - **a view, an analysis or a company's claim with no word that gives it away**: an unlabelled analysis, an outlet's verdict, a press release's hook. The rules catch a view by its words ("ironically", "stunning", "seem keenly aware"); these have none;
  - **the news left to the headline** while the story tells background or a side detail, when the sentence that says it is long, is taken for the headline said again, or loses its clause to a cut;
  - **lines that lean on what the story never told** where the sentence before them in the source was told: "the artisan", "the blaze", "Of those". The coherence gate trusts the source's own order;
  - **the accused not called so**, and roles the source gives only elsewhere in the article.
- **One event in two stories whose headlines share one word** ("Saudi airport passenger terminal is struck again" and "CCTV shows people take cover as missile hits Riyadh airport"). The desk's rule needs two shared words, or a quoted name, or the same person.
- **A third of stories never name their outlet on air** (1,034 of 2,920 stories in round 5's replay, 1,023 of 2,898 now: `nocredit.py`). A newsroom may tell a story as its own, but these are outlets' reports.
- **The detector's three `view` flags in `final22`**: UNIT-8's "Filed under remarkable." twice, the character's own word, and "A rare study has revealed a striking divide inside an Alzheimer’s patient’s brain." (COSMOS `285`), a press release's "striking", which the writer's rule keeps for its other senses ("striking workers").
- **Famous people by surname** (`bare`, 32 flags, about half real): "Khan’s PTI party", "Alcaraz", "Duterte", "Takaichi said…".
- **The categories round 6 did not work on** stay as round 5 left them: headlinese, fragments, the headline said twice when the lead's article cannot open it, one fact twice, the lengths of thin desks. The lint counts more of some (headlines read word for word 179 → 207, long sentences 159 → 178, fragments 91 → 100): where a line cannot be told truly, the headline is often what is left.
- **No new recording.** Round 4's recording of WORLD NOW `028` stands; round 6 changed what airs, not how it plays.
- **Not touched:** `docs/programmes/play.md`, `tools/play/`, port 8711, and the main checkout's processes and data.

## Before and after

Lengths are voiced: the open, every line at its voice's measured rate, the pauses and the end card. Before is the baseline replay at `6b56d02`; after is round 5's final replay (`final20`), with the same archive, desk and article pages. Round 6 did not work on length; its lengths are given for the record in its section.

| Programme | Target | Before: voiced avg / median / min–max | In range | After | In range |
|---|---|---|---|---|---|
| WORLD NOW | 540–600 s | 377 / 370 / 255–502 | 0 of 116 | 496 / 516 / 204–613 | 46 of 113 |
| COSMOS | 360–480 s | 394 / 406 / 252–450 | 33 of 38 | 400 / 411 / 156–475 | 31 of 38 |
| TECH BYTES | 360–480 s | 439 / 455 / 230–503 | 25 of 41 | 370 / 409 / 79–450 | 31 of 43 |
| MONEY MINUTE | 240–360 s | 263 / 260 / 200–323 | 18 of 25 | 259 / 280 / 143–306 | 19 of 25 |
| NEWS IN 60 | 55–70 s | 74 / 74 / 61–85 | 13 of 55 | 62 / 63 / 50–73 | 52 of 56 |
| WORLD WEATHER (live forecast of 16 Oct 21:20, same data) | 270–480 s | 239 / 239 / 234–246 | 0 of 24 | 286 / 286 / 280–293 | 24 of 24 |
| WORLD WEATHER (offline demo data) | 270–480 s | 244 / 244 / 239–250 | 0 of 24 | 271 / 271 / 265–277 | 14 of 24 |

NEWS IN 60 lands at every mark of the day: 48 of 48, a median of 37 s off, the worst 191 s (the baseline's worst was 192 s).

Where the length comes from, in WORLD NOW:
- each depth tells more of each read article (up to 14 sentences studied, 720 characters a story, 960 at depth 3);
- up to five more stories when the desk offers one and a half times what the programme can use;
- three correspondent crosses and two expert analyses (the bible's numbers raised from 2 and 1);
- two re-staged quotations;
- three map items instead of five at the deepest telling;
- the producer's depth loop, which tells an edition again deeper while it is short, and with fewer stories while it is long, aimed a little inside the range.

Every added line is a sentence of the story's own source, or one of the programme's existing formats (a cross's hand-over, an expert's question, a board).

## What was not done

- **The target of 9.7 was not reached.** Rounds 4 and 5 both score 5.5. Round 6 worked on truth and standards only: it scores them 7.5 and 8.0, short of its goal of truth ≥ 9.7, and the round stays at 5.5 (round 6, "What is still open"). Round 5 removed most of the lines that leaned on what was never said (378 of 457, by the lint), restored the clock's worst case and brought NEWS IN 60 into its minute. Its readings still found what keeps the score down:
  - news told after a detail, or not at all;
  - people nobody introduced;
  - views with no word of a view;
  - features read as news;
  - headlinese;
  - one event twice.

  See round 5's list.
- **The quotation fault went unseen for three rounds.**
  - Sentences from inside a source's quotation aired as the outlet's own words, in the baseline and in every round until round 4.
  - It was found only in round 4, by checking spoken sentences against the sources' quotation marks.
  - The truth scores of the rounds before were too high.
- **WORLD NOW on a thin desk is as long as the news allows: 420 s on average, and as little as 204 s.** On a full desk it lands in range in 44 of 60 editions.
  - The replay's desk holds only the stories that aired, so it is thinner than the live desk. The full-desk figures are the better guide to the live station.
  - That is a claim about the live desk, not a measurement of it.
- **Some editions are shorter than before.** Against the baseline, editions that were in range are under it now:
  - COSMOS 3 of 38;
  - TECH BYTES 7 of 41;
  - MONEY MINUTE 4 of 25.

  Against round 4, WORLD NOW has 14 such editions. The gate costs WORLD NOW about ten editions in range (round 5, "What it costs in length").
- **The brief's playout figures disagree with the replay's baseline.** The brief measured WORLD NOW at 319 s on the live playout log; the replay's baseline is 377 s.
  - The replay reads the article pages that were fetched afterwards (35 Sky News pages answered 403); the live desk had six seconds to read them.
  - Timing from the voices' measured rates is not the playout log either.
  - The difference is not explained here.
- **WORLD WEATHER was measured on one live forecast.** Open-Meteo answered HTTP 429 to three of five requests through the proxy, and the moving sky (the heat-map batches) never came through. The world segment, which the sky makes, is measured only on the offline demo data.
- **One recording, from round 4's middle** (see round 4, "Recording").
- **Not touched:** `docs/programmes/play.md`, `tools/play/`, port 8711, and the main checkout's processes and data.

## Files

The editions, the recording and the scripts are in the session's scratchpad, under `lengths/`:
- `before/` — the baseline replay;
- `r2/` to `r6/` and `final2/` to `final19/` — the rounds' replays, and the replays meant to be final that a reading stopped;
- `final14/` — round 4's final replay;
- `final20/` — round 5's final replay, the code as committed apart from one kicker word fixed after it (GADGETS from "monitor");
- `final20-nogate/` — the same code with the coherence gate switched off;
- `final21/` — round 6's first replay; `final22-partial/` and `final22b/` to `final22l/` — the round 6 replays a reading stopped;
- `final22/` — round 6's final replay, the code as committed;
- `read/NOTES.md` — round 4's readings; `read5/NOTES.md` — round 5's; `read6/NOTES.md` — round 6's; each with copies of the editions read;
- `recordings/` — the recording;
- `rec/` — the voiced edition;
- `weather-before-live/`, `weather-after-final/`, `weather-r5final/` and `weather-r6final/` — WORLD WEATHER on the same forecast.

The tools are in the repository, under `tools/lengths/` (round 6 added `standards.mjs`). The checks used only for reading are scripts in the scratchpad: `prov.py`, `facts.py`, `facts_all.py`, `innerquote.py`, `pairs.py`, `stock.py`, `table.py`, `shortest.py`; round 6 added `facts6.py`, `r6_table.py`, `make_r6_table.py`, `cards_bare.py`, `teased.py`, `daypart_count.py`, `nocredit.py` and the audits of the news desk's rules (`t_notnews_audit.mjs`, `t_samereport_audit.mjs`, `t_kick_diff.mjs`).
