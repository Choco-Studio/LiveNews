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

## What is still needed to pass

- **Real data from other days**: snapshots on a Saturday evening and a Sunday (matchday) and two more weekdays, the twenty
  editions read again on them. Planned: a snapshot each time the session is active on those days.
- **The AI writer's editions**: written and read once the owner's key is set (the prompt, the validator and the shape
  are in place; the shape repairs its tosses, pick-ups and order like the fallback writer's).
- **Length**: measured with the voices in step 4; if short, one story more in AROUND THE GROUNDS.
