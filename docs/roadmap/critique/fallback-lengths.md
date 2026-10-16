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

## Round 4 (final): after the fixes from reading r5, r6 and the first final replay

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

## Before and after

Lengths are voiced: the open, every line at its voice's measured rate, the pauses and the end card. Before is the baseline replay at `6b56d02`; after is the final replay (`final14`), with the same archive, desk and article pages.

| Programme | Target | Before: voiced avg / median / min–max | In range | After | In range |
|---|---|---|---|---|---|
| WORLD NOW | 540–600 s | 377 / 370 / 255–502 | 0 of 116 | 512 / 544 / 130–626 | 52 of 113 |
| COSMOS | 360–480 s | 394 / 406 / 252–450 | 33 of 38 | 397 / 406 / 224–479 | 31 of 38 |
| TECH BYTES | 360–480 s | 439 / 455 / 230–503 | 25 of 41 | 395 / 410 / 127–470 | 35 of 41 |
| MONEY MINUTE | 240–360 s | 263 / 260 / 200–323 | 18 of 25 | 266 / 277 / 196–310 | 18 of 24 |
| NEWS IN 60 | 55–70 s | 74 / 74 / 61–85 | 13 of 55 | 64 / 63 / 55–77 | 51 of 56 |
| WORLD WEATHER (live forecast of 16 Oct 21:20, same data) | 270–480 s | 239 / 239 / 234–246 | 0 of 24 | 286 / 286 / 280–293 | 24 of 24 |
| WORLD WEATHER (offline demo data) | 270–480 s | 244 / 244 / 239–250 | 0 of 24 | 271 / 271 / 265–277 | 14 of 24 |

Where the length comes from, in WORLD NOW:
- each depth tells more of each read article (up to 14 sentences studied, 720 characters a story, 960 at depth 3);
- up to five more stories when the desk offers one and a half times what the programme can use;
- three correspondent crosses and two expert analyses (the bible's numbers raised from 2 and 1);
- two re-staged quotations;
- three map items instead of five at the deepest telling;
- the producer's depth loop, which tells an edition again deeper while it is short, and with fewer stories while it is long, aimed a little inside the range.

Every added line is a sentence of the story's own source, or one of the programme's existing formats (a cross's hand-over, an expert's question, a board).

## What was not done

- **The target of 9.7 was not reached.** The final round scores 5.5. What keeps it there is the final round's list:
  - misleading cards;
  - furniture and features recognised only by their headlines;
  - answers that miss their questions;
  - broken sentences, headlinese and kickers;
  - editions shorter than before.
- **The quotation fault went unseen for three rounds.**
  - Sentences from inside a source's quotation aired as the outlet's own words, in the baseline and in every round.
  - It was found only in round 4, by checking spoken sentences against the sources' quotation marks.
  - The earlier rounds' truth scores were too high. The lengths of rounds 2 and 3 include those sentences.
- **WORLD NOW on a thin desk stays near 442 s** (seven minutes), and one edition aired 130 s. On a full desk it lands in range in 46 of 62 editions.
  - The replay's desk holds only the stories that aired, so it is thinner than the live desk. The full-desk figures are the better guide to the live station.
  - That is a claim about the live desk, not a measurement of it.
- **Some editions are shorter than before.** In COSMOS (3 of 38), TECH BYTES (3 of 40) and MONEY MINUTE (5 of 24), editions that were in range in the baseline are under it now.
  - The replay cannot separate the three reasons: its rotation, columns held back, and stricter sentences.
  - COSMOS is in range a little less often than in the baseline.
- **The brief's playout figures disagree with the replay's baseline.** The brief measured WORLD NOW at 319 s on the live playout log; the replay's baseline is 377 s.
  - The replay reads the article pages that were fetched afterwards (35 Sky News pages answered 403); the live desk had six seconds to read them.
  - Timing from the voices' measured rates is not the playout log either.
  - The difference is not explained here.
- **WORLD WEATHER was measured on one live forecast.** Open-Meteo answered HTTP 429 to three of five requests through the proxy, and the moving sky (the heat-map batches) never came through. The world segment, which the sky makes, is measured only on the offline demo data.
- **One recording, not two.** It was made from the code of round 4's middle (see "Recording").
- **Not touched:** `docs/programmes/play.md`, `tools/play/`, port 8711, and the main checkout's processes and data.

## Files

The editions, the recording and the scripts are in the session's scratchpad, under `lengths/`:
- `before/` — the baseline replay;
- `r2/`, `r3/`, `r4/`, `r5/`, `r6/` — the rounds' replays;
- `final14/` — the final replay;
- `read/NOTES.md` — the final readings, with copies of the editions read;
- `recordings/` — the recording;
- `rec/` — the voiced edition;
- `weather-before-live/` and `weather-after-final/` — WORLD WEATHER on the same forecast.

The tools are in the repository, under `tools/lengths/`. The checks used only for reading are scripts in the scratchpad: `prov.py`, `facts.py`, `innerquote.py`, `pairs.py`.
