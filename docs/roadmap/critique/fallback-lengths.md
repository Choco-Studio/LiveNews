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
