# FULL TIME — writing critique log (build step 2)

Step 2 of `docs/programmes/full-time.md` §9: the programme written by both writers, with the shapes, the segments, the
banks, the balance and the grave rules, and the validator's checks. **Gate: twenty editions written from cached feeds,
each read in full; no fault left; the hostile panel above 9.7.**

The panel is the design critique's (`full-time-design.md`): a senior sports editor, a standards and legal editor, a senior
broadcast director, a lead pixel artist (silent until step 3) and a first-time viewer. Each category 0–10; **the round's
score is the lowest category.**

The editions are produced by `tools/sport/gate.mjs` (snapshots taken with `tools/sport/take.mjs` into
`data/sport-snapshots/`, never committed: the outlets' text stays on the machine; each edition by
`tools/sport/edition.mjs`, one process per edition, the clock set to the air time, written to `data/sport-gate/`). The
twenty editions of rounds 2 and 3:

| Editions | Desk | Air times |
|---|---|---|
| e01–e04, e19 | live snapshot 13 Oct 08:20 UTC | 08:20, 10:00, 12:40, 18:10, next morning 07:05 |
| e05–e08, e20 | live snapshot 13 Oct 09:03 | 09:03, 11:11, 15:20, 21:45, next morning 09:30 |
| e09–e13 | live snapshot 13 Oct 09:47 | 09:47, 13:50, 19:25, next morning 06:40, two days later 08:15 |
| e14–e18 | offline desk (`config/fixtures/sport.xml`, fictional) | Tuesday 08:20, Saturday 18:30, Monday 08:10, Friday 20:05, Sunday 13:15 |

Each edition is checked by the script (judgement words outside quotations, a writer's toss left, a story opening on a
pronoun, a sentence said twice, a score not in its source, football over half, fewer than three sports, a grave moment, a
stray "And finally", sentences over 45 words, a question with no answer, more than ten chats) and then **read in full**.

---

## Round 1 — the first editions (before the stages were finished)

Read: two editions of 13 Oct 08:20.

Faults:

1. **A factual error aired**: "lifting the Buffalo Bills to a thrilling 37-34 victory over the Los Angeles Chargers" under
   "Bills beat Rams" (Sky Sports' copy was wrong; the Guardian says Rams).
2. The lead was team news (Lewis left out) while the match two stories told (Coventry 4-1 Newcastle) was third, and its
   reaction (Jaissle sorry) came four stories later.
3. An analysis column aired ("The star is Luis Enrique - inside the plans…", "Guillem Balague looks at how…").
4. An interview feature aired with a story that opened "On Tuesday they will oversee…" (who?).
5. The lead had one sentence and no BREAKDOWN: a defender's knee injury in the next story made the desk call it grave.
6. "He was named the Finals' Most Valuable Player in all six": all six of what (the sentence that said it was dropped).
7. Verdicts aired: "another impressive season", "Mfuni superbly added a fourth", "A wasteful Newcastle lost".
8. ESPN's "Transfer rumors" aired (American spelling slipped the rumour rule).
9. **A writer bug dropped good sentences on every programme**: "Jack Rudoni" after "Goals from" was read as a stranger
   named "Jac".
10. "Bitport Athletic host Copperfold Town on Saturday." was cut as a web menu (many capitals): COMING UP never had dates.
11. A women's and a men's match of the same clubs were folded into one story by the desk.
12. THE NUMBER never aired on real feeds (a sport standfirst rarely carries its figure).

Scores: accuracy 5.0 (fault 1), news sense 6.5, entertainment 6.5, format 7.0, robustness 6.0, feasibility 8.0.
**Round score: 5.0.**

## Round 2 — gate run 1 (twenty editions)

Fixed before it: everything in round 1 (`server/sport/prepare.js`, `shape.js`, `scores.js`, `desk.js`, `words.js`,
`facts.js`, `transcript.js`, `news.js`, the fallback writer). The script's checks found one fault kind; reading found
the rest:

1. "And finally: Matt Renshaw continued to hog centre stage…" closed eleven editions (the writer took a cricket report
   for the lighter when no moment was left in the afternoon).
2. "'I let the team down'." as a spoken headline: Kai said it in the first person.
3. A strap cut after an auxiliary: "World heavyweight title will be".
4. One coach with two first names in one story ("Brian McDermott", then "Brad McDermott"), from the outlet.
5. A crosshead run into a sentence: "Suljovic apologises over incident On Monday afternoon, Suljovic…".
6. "Over to you, Rosa." left at the end of the lead when the shape had given the next story to Kai.
7. On the later days the reaction led and the match report followed ("More from that one." before the result).
8. Rosa read four stories in a row; Kai read three in a row.
9. COMING UP said "Today" at 18:30 for matches that may already be over, and said "Today" twice in two lines.
10. COMING UP read again the two dates the boxing story had just read.
11. "Super League Grand Finalist…" story ended on a sentence that lost its end (an outlet's run-on).

Scores: accuracy 8.6, news sense 8.8, entertainment 7.5, format 7.8, robustness 8.5, feasibility 9.2.
**Round score: 7.5.**

## Round 3 — gate run 2

Fixed before it: round 2's faults (the moment only from a story the desk marks; Kai and Rosa in turn, THE NUMBER and the
moment Rosa's; tosses by name removed; result before reaction and no stale lead; name variants and crossheads; straps
from the title; COMING UP's morning-only "today", one line a day, no echo of the last minute; signposts checked before
the hand-overs; the AI writer's prompt given FULL TIME's rules). Reading found:

1. **A regression of round 2's own fix**: with names like "Al-Nassr" now checked, the writer introduced them from the
   article: "Ronaldo scores as **Once** Al-Nassr win…", "Uzbekistan champions **Uzbekistan's** Neftchi". Fixed: never a
   possessive or a sentence's first word as a first name.
2. A sentence from another sport inside a story: "F1 is pressing ahead with plans to run the races in Qatar and Abu Dhabi"
   in a football report. Fixed: a body sentence about another sport is the article's tangent and goes.
3. THE NUMBER opened on "The Brighton chairman completed a near £10m investment…" before the story named Tony Bloom.
   Fixed: a figure sentence that names its person by a role never opens.
4. No BREAKDOWN after the lead block on any real edition: the context sentence was in a 33-word run-on. Fixed: long
   sentences that join two clauses are told as two; an answer never opens on "But"; a quotation needs its speaker.
5. Kai asked "How big a moment is that?" about a second loss in three games. Fixed: a run gone wrong is asked about as
   form ("How has their form been, Rosa?").
6. An edition with no moment had no humour at all. Fixed: Kai asks for one of Rosa's memories before the sign-off
   ("One from your career before we finish, Rosa?"), never after a grave or serious story; and a second light ritual that
   needs no facts, from the bible's chemistry: Rosa needling Kai about his own fictional sporting past ("Kai played in goal
   once. The ball still has not forgiven him." / "It was a very fast ball."), twelve of them beside her twelve memories.
   The banks were widened at the same time (greetings 6 an hour of the day, Rosa's hello 12, results intros 8, sign-offs
   6 an hour, hand-overs 8, the follow line 9, Kai's asks for a memory 8); six editions in one process share no line.
7. Promotional furniture in an article ("Get Sky Sports or stream contract-free on NOW…") reached the desk's text.

Scores after the fixes (all twenty re-run clean, every edition re-read):

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy and safety | 9.5 | the outlets' own punctuation ("one goal; to win the tournament") and spellings ("careerlong") pass through; the tangent rule can take a sentence of context away |
| News sense and balance | 9.4 | no cap on a sport other than football: three rugby league stories in a row on 13 Oct (a real World Cup squad day) |
| Entertainment and repertoire | 9.4 | Rosa's BREAKDOWN answers are the source's sentences, read straight (by design: she adds no fact); her light touches are two banks of twelve, so a regular viewer meets each again within a few days |
| Format clarity and rhythm | 9.3 | 590–760 spoken words (about 4–5 minutes of speech) against the 6–8 minute target: the open, the boards and SCORE CENTRE add time, measured only in step 4 |
| Data robustness | 9.0 | **no real matchday has been read**: SCORE CENTRE and MATCHDAY are proven only on the offline desk; three snapshots of one Tuesday, not three days |
| Feasibility and fit | 9.6 | FULL TIME is a draft (not on air) until steps 3–7; the AI writer's editions are unread (no key yet) |

**Round score: 9.0. Not passed.**

## Step 4's changes to the writing (13 Oct, `full-time-director.md`)

- **Length measured**: the editions played through the director ran 308–326 s against 360–480; the edition is now
  thirteen stories (AROUND THE GROUNDS 4–7) and the real editions run 364–413 s.
- **News sense**: any sport other than football is at most a quarter of the edition (three rugby stories of thirteen,
  not four in a row); that was this round's 9.4.
- **A new fault the longer edition brought in, fixed**: an opinion column whose headline ends on its writer's verdict
  ("… – and that's OK") aired as news with its mangled "The magnificence: …"; such headlines never air now, and
  "magnificence", "majesty" and "mastery" are verdict nouns.
- All fifteen gate editions re-run clean on the automatic checks; the thirteen-story editions re-read.

## Round 4 — the first real matchday (Saturday 17 Oct, real day 2)

Real day 1 was Tuesday 13 Oct (rounds 2 and 3). Real day 2 is the live snapshot `2026-10-17T1840`. It was taken on a
Saturday evening (the sport feeds and the articles' pages) and read at 18:40, 22:40, 04:40 and 07:05 the next morning. These are
**the first editions on a real matchday**: MATCHDAY's shape and SCORE CENTRE had never run on real feeds before.

A hand reading of the 18:40 edition, as it first came out, found eight fault classes the script had passed. Each
is fixed at its root, with a test from the real case:

- `test/sport-desk.test.js`, "a Saturday of match reports";
- `test/full-time.test.js`, "the first real matchday";
- `test/full-time-checks.test.js`.

| # | Fault (real case) | Root cause | Fix |
|---|---|---|---|
| 1 | **No scores on a Saturday**: MATCHDAY with no SCORE CENTRE (results 0), although the desk held six readable results | the scoreline reader's forms were measured on a Tuesday's sentences ("A beat B 2-1"). A Saturday's match reports put the winner as an object ("scored twice to lift Kilmarnock off the bottom … with a 3-2 victory over Motherwell", "earned Dundee United a 1-1 draw at St Johnstone"). Or they put a label first ("WXV: Canada 24-21 England."), or gave the result in the headline's words and the score only with a noun in the copy ("Struggling Norwich beaten by Portsmouth" + "a 1-0 triumph at Carrow Road"). And an undated item read again on Sunday was dated Sunday | new forms. **The headline and the copy are read together** (`pairedScorelines`): the headline's result in words, plus one final score with a result noun in the copy; they must agree, name no other team and hold nothing of another match. A ground (Carrow Road, Anfield, Ascot) and a person ("Lyall Cameron's strike earned…") are never a team. An undated item is dated when first seen (`news.js`, the snapshot tool). Failing all of that, the article page's own headline is read, but only when the feed's headline names the same winner ("Champions Cup: Connacht 45-36 Saracens - …") |
| 2 | **Result stories without the result**: Isak/Liverpool, Connacht, Cameron/Dundee United told the moments around a match, never who won, or left out the score the source gave | the fallback writer had no notion of a match report. Its opener took the standfirst's colour ("If Liverpool's spluttering forwards end up remembering this…"), its detail order ranked colour above the score sentence, and nothing checked that the result reached the copy | a **result story** (a result headline, or a scoreline of its own) opens on the source's sentence with the score, else on the result in words, else on the headline as a sentence. The shape puts the score sentence (or the result line) back into any story that lacks it, from either writer |
| 3 | **References before their antecedent**: "Both players…" (Martínez), "The Spaniard…" (golf, before Eugenio Chacarra), "Brentford, who later lost…" (the first red card never told) | the lean detector knew pronouns and "this/that", but not sport's descriptions (a demonym, "the Argentina international", "the 24-year-old"), "both players", "who later…" or "X, however,". The writer kept a follower after dropping the sentence it leaned on | `server/sport/leans.js`, shared by three users: the writer (sentence choice, the opener, THE BREAKDOWN), the shape (a lede that leans gives way, a leaning sentence goes) and the gate. A description counts against the people already named |
| 4 | **First mention without a first name**: Loughnane, McDermott, Maresca | the writer introduced only names it met outside the title, and only with a role or "said" in the source; sport headlines use surnames | the desk reads **the people map** from the raw article (surname to first name). A team, a role, a month, a demonym or a sentence's first common word is never a first name, and a surname two people share is left out. The writer, the intro's headlines, the signposts and the shape say a person whole the first time |
| 5 | **A headline cut mid-thought**: "McDermott seeks fix as England fight" | the strap and the spoken headline were cut to a word budget at the last space | `cutMidThought` / `wholeThought`: a cut ends at the last whole clause ("McDermott seeks fix"), never on a subordinate's subject |
| 6 | **Rugby league tagged {RUGBY}** | one sport, "rugby", stood for two codes | `rugbyCode` (the link, then the words) gives the tags RUGBY LEAGUE / RUGBY UNION and their own transitions; "In rugby league, …" is added when the copy never says it |
| 7 | **The Martínez story opened with no context**: "Chelsea coach Xabi Alonso told reporters that the Argentina international…" | the standfirst's first sentence was taken as said by the headline and skipped, so a sentence that leans on it opened | the opener never leans (fault 3's detector); the shape repairs a lede that does |
| 8 | **Thin or clunky copy**: the Ombudsman story never said he won, nor named the jockey; "Something else now.", "Some basketball."; "[chat:B] Hello. Let's get started." | the sentence that said Ombudsman won carried a price ("who obliged as the 5-4 market leader") and went whole under the betting rule. The rider's sentence ranked last. The transition and hello banks had empty fillers | the price clause is cut and the sentence stays. A racing story's rider sentence comes first among the details. The transitions are rewritten to name their sport, with new banks for rugby league, rugby union, racing, darts, snooker and ice hockey. Rosa's hello goes by the hour and the shape, and greets Kai by name or the viewer |

Found while reading the fixed editions, and fixed the same way:

- an undated Saturday report called "Today's results" on Sunday (fault 1's dating);
- THE BREAKDOWN restating the lede;
- the Red Roses lede taking another match's draw ("…with a 26-26 draw in Exeter last month");
- a double credit ("…, BBC Sport reports, according to BBC Sport");
- "Bitport manager Bitport Athletic manager Amara Okafor" (offline desk);
- "Separate Saracens" and "Once Al-Nassr" read as people (now caught by the people map's stop list);
- "Still to come: Henderson, the Premier League's oldest player…" and "GK Martínez taken to hospital" in the spoken
  headlines. Jordan and Erling now count as first names inside a sentence, and a page's "GK" is said "Goalkeeper";
- a story left with one sentence (Suljovic, the offline Okafor story): it now goes when the edition has more than five;
- "Greg Kiltie double helps Kilmarnock…" in the spoken headlines, once the first name was added: now "A Greg Kiltie
  double helps…";
- the Red Roses story told as "England have lost a rugby game after four years and 41 games unbeaten", never saying it
  was England's women: now "In women's rugby union, England have lost…" when nothing spoken says so.

**The checks now know each fault class.** They live in `tools/sport/checks.mjs`, used by `edition.mjs`, and each one is
tested on the faulty text as it aired (`test/full-time-checks.test.js`):

- a result without the score its source gives;
- a result story that never says who won. Only a sentence about this match counts; a player "lost to a second yellow
  card" does not;
- a description, a "both", a "who later" or a "however" before what it points back to;
- a first mention without the whole name the source gives, in a story and in the headlines and signposts before it;
- a name the source never gives ("Goalkeeper Alex Lowry");
- a headline cut mid-thought;
- rugby league tagged or told as rugby;
- a women's story that never says it is the women's game;
- a story of one sentence;
- a story opening on a quotation;
- a MATCHDAY without SCORE CENTRE while the desk has three or more results.

All nineteen gate editions re-run clean on these checks: twelve of 13 Oct, four of 17 Oct and three offline. Each was
then read in full.

**The real editions of 17 Oct, read in full:**

- **18:40 (MATCHDAY, Saturday evening)**:
  - SCORE CENTRE, "Today's results", has six rows, each checked against its source: Dundee United 1-1 St Johnstone,
    Falkirk 2-1 Hibs, Aberdeen 3-1 St Mirren, Sheffield United 1-0 Bristol City, Southampton 0-0 Bolton, Ulster 40-21
    Zebre.
  - Every result story says who won, and gives its score where the source does: Manchester City 3-2 Ipswich, Kilmarnock
    3-2 Motherwell, Portsmouth 1-0 Norwich, Tonga 30-12 England, and Connacht 45-36 Saracens. That last score comes from
    the BBC page's own headline, because the feed and the article give none; it is read only when the feed's headline
    names the same winner.
  - Martínez opens on what happened.
  - "Billy Loughnane", "Brian McDermott", "Enzo Maresca", "Erling Haaland" and "Jordan Henderson" are whole the first time.
  - The tags read RUGBY LEAGUE and RUGBY UNION.
  - Ombudsman "came out on top at Ascot", with William Buick named.
  - Still left:
    - the outlets' nicknames, read as they wrote them ("the Steelmen", "Killie", "Pompey");
    - "struggling Norwich" (the outlet's word for form);
    - Sky Sports' copy names the Portsmouth scorer "striker Marezi", while its own page headline says Marko Milovanovic.
      The channel airs the copy's name and has no way to tell which is right;
    - the strap "Ombudsman simply supreme in Champion Stakes", a verdict on a horse;
    - the Isak lede in headline present tense ("Alexander Isak completes Liverpool's comeback win as Brentford finish
      with nine"), because the Guardian gives no score.
- **22:40**: six results. Connacht 45-36 Saracens joins SCORE CENTRE, and Dundee United 1-1 St Johnstone is told as its
  own story ("Lyall Cameron's 79th-minute strike earned Dundee United a 1-1 draw at St Johnstone"). The golf story names
  Eugenio Chacarra before "the Spaniard". Left: as at 18:40, plus two things among the spoken headlines (here and in the
  morning). "A Greg Kiltie double helps…" is correct, if a little formal. "Ombudsman simply supreme in Champion Stakes"
  is now spoken, not only shown: a verdict on a horse. Judging the headline would drop the whole story at the desk, and
  the channel does not compose a headline of its own.
- **04:40 and 07:05 (Sunday morning)**:
  - YESTERDAY'S RESULTS, never "Today's" or "last night's" for 3pm kick-offs.
  - The Red Roses story now reads "In women's rugby union, England have lost a rugby game after four years and 41 games
    unbeaten… Canada beat England 24-21", and keeps last month's draw as context.
  - At 07:05 the BBC's Martinez report airs with Chelsea 2-0 Everton. Its "next three matches - they face Tottenham and
    Manchester United[, with a Carabao Cup tie at Liverpool in between]" had been cut to two of the three named; now
    `trimClause` never cuts the rest of a counted list.
  - Left: the fourth sentence of the 07:05 Kilmarnock lead goes back in time to the first half. The Martinez report's
    third sentence tells its first one's "first clean sheet in nine months" again, with only "since a 2-0 win against
    Brentford in January" new.
- The 13 Oct editions and the offline desk's three read as in round 3, with the fixes above.

**Verbatim share.** Every edition measures each story against the compliance desk's rule (`server/compliance/verbatim.js`:
no run over twelve words, at most 20 % of a story outside attributed quotes); see `VERBATIM` in each gate file. The
fallback writer is extractive by design. Every story of the real editions is **73–100 % the outlets' words**, with
longest runs of 19–81 words, and **all are over the rule**, so the compliance desk holds them back until an AI writer
composes them. This is recorded, not changed: the fallback writer stays a selector of the outlets' sentences, not a
paraphraser.

The 18:40 edition, story by story (share of the outlet's words / longest verbatim run, in words):

| Story | Share | Longest |
|---|---|---|
| GK Martínez taken to hospital | 96 % | 39 |
| Maresca plays down Haaland injury fears | 93 % | 26 |
| Kiltie double helps Kilmarnock beat Motherwell | 96 % | 46 |
| Struggling Norwich beaten by Portsmouth | 100 % | 81 |
| Isak completes Liverpool's comeback win | 89 % | 19 |
| Kartal reaches Wuhan final | 90 % | 28 |
| Ombudsman simply supreme in Champion Stakes | 95 % | 24 |
| Loughnane, 20, becomes youngest champion jockey | 100 % | 23 |
| McDermott seeks fix | 96 % | 28 |
| Seven-try Connacht beat Saracens | 87 % | 38 |
| Dream's Gray expected to play | 95 % | 45 |
| Henderson is becoming undroppable for Chelsea | 100 % | 21 |

The other real editions: 22:40, 89–100 % (12 stories); 04:40, 73–100 %, and 07:05, 74–100 % (10 stories each). The
Red Roses story is the lowest at 73 %, as its "In women's rugby union" and its result line are the channel's own words.

Scores (the panel, after the fixes):

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial accuracy and safety | 9.3 | every board and score checked by hand is right; but the outlets' nicknames and "struggling Norwich" pass through, one headline ("Ombudsman simply supreme", spoken among the headlines at 22:40, 04:40 and 07:05) is a verdict on a horse, and an outlet that names two different scorers is aired as its copy says |
| News sense and balance | 9.3 | six sports at 18:40, results first on a matchday; but the lead is a precautionary hospital visit over a full card of results |
| Entertainment and repertoire | 9.1 | the transitions now name their sport and the hello greets Kai or the viewer; the copy is the outlets' print sentences, read straight |
| Format clarity and rhythm | 9.2 | headline present tense in a lede; a lead whose fourth sentence goes back in time; one fact told twice in other words |
| Data robustness | 8.9 | **two real days** (a Tuesday and a Saturday evening); no Sunday or Monday morning read yet; the Saturday forms measured on one evening's reports |
| Feasibility and fit | 8.8 | every story the fallback writer wrote is over the compliance desk's verbatim rule and would be held back; the AI writer's editions are still unread (no key) |

**Round score: 8.8. Not passed**: the gate needs above 9.7 on real data from three different days, and this is the second.

## What is still needed to pass

- **Real data from a third day**: the Saturday evening is read (round 4). Next are the snapshots planned for Sunday 18 Oct
  17:50 UTC and Monday 19 Oct 07:50 UTC (a Sunday's results and THE WEEKEND'S RESULTS), with the editions read again on
  them.
- **The verbatim share**: the fallback writer's stories are over the compliance desk's rule. FULL TIME airs only when an
  AI writer composes them, or once the compliance desk decides on the fallback.
- **The AI writer's editions**: written and read once the owner's key is set (the prompt, the validator and the shape
  are in place; the shape repairs its tosses, pick-ups and order like the fallback writer's).
- **Length**: measured with the voices in step 4; if short, one story more in AROUND THE GROUNDS.
