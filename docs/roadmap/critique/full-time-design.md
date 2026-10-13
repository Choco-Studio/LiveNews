# FULL TIME — design critique log

The design is judged before a line of code, by the hostile panel of `QUALITY_LOOP.md`, widened for a programme:

- a **senior sports editor** from a top broadcaster's results show (judges the running order, the news sense, the rhythm of
  a results sequence, what a fan expects and what bores them);
- a **standards and legal editor** (judges accuracy, attribution, courts, deaths, gambling, rumours, opinions on real
  people, children);
- a **senior broadcast director** (judges the shots, the graphics, the pace, the transitions, how the set plays);
- a **lead pixel artist** (judges what can be drawn well at 384 × 216 and what will read as noise);
- a **first-time viewer** who does not follow sport (judges whether it is fun, clear and never repetitive across a day).

Rubric, each 0–10; **the round's score is the lowest category**.

| Category | What a 10 looks like |
|---|---|
| Editorial accuracy and safety | Every score, name, date and claim grounded; no gossip, odds, stale live status, opinion on real people; courts and deaths handled with care |
| News sense and balance | The biggest story leads; a mix of sports and of men's and women's sport; not a Premier League show |
| Entertainment and repertoire | Rituals a viewer looks forward to; energy; banter that needs no opinion on real people; nothing repeats across a day of airings |
| Format clarity and rhythm | A viewer always knows where they are; segments have shapes; a results sequence with a cadence of its own; fits its minutes |
| Visual identity and graphics | Unmistakably the sport show; graphics that read at 1x; a set and an open of its own; no real logos or crests |
| Data robustness | Works on a matchday, a quiet Tuesday and with no data source; never shows a result it cannot read with certainty |
| Feasibility and fit | Buildable on the channel's engines (writer, fallback writer, director, voices, sets) without breaking the others; cast and schedule thought through |

---

## Round 1 — the first design

**What was proposed:**

- **FULL TIME**, the day in sport, 8 minutes. Presenter **Kai Sprite** and a pundit, **Rosa Rally**, a former international
  midfielder. Theme `sport`, accent orange.
- Running order: headline montage → title sequence → greeting → THE BIG ONE (lead, with a scoreline card) → THE VIEW
  (Rosa's verdict on the lead) → SCORE CENTRE (3–6 results, each a scoreboard graphic, read by Kai) → AROUND THE SPORTS
  (3–5 stories from other sports) → THE TABLE (league standings) → MOMENT OF THE DAY (a light story) → COMING UP (fixtures)
  → THE NUMBER (a stat) → sign-off.
- Sources: the five sport feeds; results and tables from ESPN's scoreboard API.
- Set: a studio with a stadium on the video wall, a crowd that twinkles and floodlights; a standing desk.
- Repertoire: banks of openers and transitions; Rosa's catchphrases.

**Defects (the panel, before any score):**

1. **Rosa's "verdict" breaks the channel's first rule.** A pundit's job is opinion ("he was brilliant", "the referee got it
   wrong"); the channel never judges real people (ACCURACY RULES: "No political opinions and no judgements about real
   people"). As designed, THE VIEW either invents opinions or says nothing. *Standards: blocking.*
2. **Results from ESPN's API by default.** Undocumented, not offered for third-party use. The owner must decide; the design
   must work without it. THE TABLE has no source at all without it. *Standards: blocking.*
3. **SCORE CENTRE goes empty on a quiet day.** A Tuesday morning snapshot has 2–3 scorelines in the stories. A segment
   promised every edition that airs with one result is worse than no segment.
4. **Stale times.** Sport copy is full of "tonight", "last night", "on Sunday". FULL TIME airs many times a day; a story
   written last night and read this afternoon says "tonight" for a game already played. The fallback writer reads the
   source's sentences as written.
5. **Stale live pages.** "South Africa attempt to deny Australia on final day — Test scorecard" is a live page: by the
   time it airs the Test may be over. The design does not exclude live pages, scorecards or minute-by-minute blogs.
6. **Gossip and promos.** "Man Utd eye Simeone — Tuesday's gossip", "Papers: Haaland and father buy properties…", "Who am
   I? Plus today's other quizzes" are in the feeds. Rumours from other papers, and promos, must never air; the design names
   no filter.
7. **A Premier League show.** Measured: half the items are football, mostly English. Women's sport is 7 % of items. With
   "the biggest story leads" and no rule, every edition is three Premier League games and a transfer.
8. **Who scored what.** "Coventry thrash Newcastle to claim first home win of season" + "an emphatic 4-1 victory": the
   scoreline is readable; "Allen leads Bills to 37-34 victory over Rams" too. "Lens put an end to a four-match winless run
   by beating Lyon 2-1" too. But cricket ("342-7"), rugby league ("24-18" can be a half-time score), tennis sets ("6-4
   3-6 7-5") and "13-15 November" (a date) all look like scores. The design has no reader with certainty and no rule for
   what a scoreboard may show.
9. **Crests and kits.** A scoreboard with club colours or crests needs data the channel does not have, and crests are
   trademarks. The design is silent.
10. **The same lead all day.** FULL TIME airs 6–8 times a day; the design has no rule for a lead that has already led, nor
    for what changes between a 10:00 and a 14:00 edition.
11. **THE VIEW duplicates the experts.** The channel has a whole expert system (grounded answers, a studio each). A pundit
    built separately would be a second, ungrounded system.
12. **A standing desk and a pundit who walks.** New poses and walk cycles for two new characters is the most expensive and
    riskiest thing in the design (the weather presenter's walk took four rounds), with no fallback.
13. **The twinkling crowd.** A crowd of single-pixel heads that twinkle reads as noise at 384 × 216 and breaks the art
    direction (no particles, nothing that flickers).
14. **Orange is not checked.** No one checked that orange is distinct from the RECREATION yellow, the breaking-news red,
    NEWS IN 60's yellow and COSMOS's magenta on a strap, nor that the palette has an orange with a dark text colour on it.
15. **Too many segments for 8 minutes.** Eleven segments at the measured pace (~14.5 characters a second, 1 s gaps) is
    11–13 minutes. No time budget, no rule for which optional segment drops.
16. **Moment of the day vs grave news.** "Ex-Port Vale captain Loft dies at 39" and "Carroll thanks public for support over
    sexual assault" sit in the same feed as "Jordan jersey sells for record". The design has no rule for grave sport
    stories: no banter, no music, never in the light slot.
17. **No sense of a matchday.** A Saturday at 18:00 and a Wednesday at 07:00 get the same show. Real results shows change
    shape with the calendar.
18. **Rosa's catchphrases.** A catchphrase repeated eight times a day is the fastest way to irritate a viewer.

**Scores:**

| Category | Score | Why |
|---|---|---|
| Editorial accuracy and safety | 4.0 | Defects 1, 2, 4, 5, 6, 8, 16 |
| News sense and balance | 5.5 | Defect 7, 10 |
| Entertainment and repertoire | 6.5 | Good rituals (results, moment, number) but 18 and the empty SCORE CENTRE (3) |
| Format clarity and rhythm | 5.5 | Defect 15, 3, 17 |
| Visual identity and graphics | 6.0 | Defects 9, 13, 14 |
| Data robustness | 4.5 | Defects 2, 3, 8 |
| Feasibility and fit | 5.0 | Defects 11, 12 |

**Round 1: 4.0.** Redesign.

---

## Round 2 — the redesign (`docs/programmes/full-time.md`, round 2)

**What changed:** Rosa explains and never judges (context the source states, attributed quotes); no third-party data by
default (no TABLE; the owner's switch); never-air filters (gossip, promos, live pages, columns, odds); time words
re-anchored; a scoreline reader with four conditions; balance rules; three shapes (MATCHDAY, MIDWEEK, PREVIEW); a time
budget and a drop order; line banks with a six-hour memory; no catchphrases; a calm stadium wall; orange checked against
the palette and the dark-ink set; seated cast; Rosa as the second presenter (TECH BYTES's THE CATCH machinery, no second
expert system).

**Defects (the panel):**

1. **Where is the spectacle?** A results show without pictures in motion lives on its graphics, and the design's only
   spectacle is a board. The moment of the day is a still picture and three sentences. *Senior editor: "I would switch
   over by the second story."*
2. **SCORE CENTRE has no delivery.** "Coventry beat Newcastle 4-1. Lens beat Lyon 2-1. Bills beat Rams 37-34." is a list of
   sentences in one tone. The design does not say how a result line is built, how it is voiced, how results are grouped,
   nor how "4-1" is spoken.
3. **The time-word table misses the dangerous case.** "Wales host Albania on Tuesday" read on Wednesday is a game that has
   been played, and the channel does not know the result. A future sentence whose date has passed must go, not be
   re-anchored.
4. **THE BREAKDOWN over-promises.** In the fallback writer Rosa reads "the story's remaining facts": often the next sentence
   of the same story, whatever it is. That is splitting a story between two voices, not a breakdown, and the question
   ("What does that win mean?") may not fit the answer.
5. **The women's sport rule can promote a weak item** (a one-line brief with no picture) just to fill the quota.
6. **"At most two items from one competition" cannot be applied**: the stories rarely name the competition ("Coventry thrash
   Newcastle"). The design does not say how a story's sport or competition is known.
7. **Winner-first scoreboards mislead.** Every results service puts the home team first; a board reading "NEWCASTLE 2 – 1
   COVENTRY" tells a fan Newcastle were at home. Winner-first in the home-first layout is a quiet lie.
8. **COMING UP will rarely fill.** The WHAT HAPPENS NEXT reader needs "will / is due to / is set to" + a date. Sport copy says
   "Wales take a 1-0 lead into their second leg against Albania on Tuesday", "Fury and Joshua meet on…", "the Test starts
   on…". Measured forward-looking items are 28 %, but few would pass the reader as specified.
9. **The wall's 2 px a second drift steps.** A pixel image moved in whole pixels at 2 px/s visibly jerks every half second;
   moved by sub-pixels it shimmers. Either breaks the art direction.
10. **Sport icons are a promise, not a spec.** An F1 car or a cricket bat at 9 px is noise unless designed at a size that
    reads, with a silhouette test.
11. **Once an hour is too often.** About 16–20 airings a day of a seven-minute show on ~60 stories a day means the same
    stories all day. Overnight (UK 01:00–06:00) there are few new sport stories at all.
12. **Two new faces with no approval step.** The owner approved the experts' faces separately; new presenters need the
    same, with A/B voices, before they are the programme's.
13. **IN THEIR WORDS is missing.** 38 % of sport items carry a manager's or player's quote; the channel already re-stages
    public figures' exact words. A press conference is the most natural home it has, and the design leaves it out.
14. **THE NUMBER may pick a score** ("4") as its figure. A number needs a unit and must never be a scoreline.
15. **Rosa's anecdotes** are a good idea with no bank size and no limit: told twice in a day they become a catchphrase.

**Scores:**

| Category | Score | Why |
|---|---|---|
| Editorial accuracy and safety | 8.5 | Defects 3, 7 |
| News sense and balance | 8.0 | Defects 5, 6, 11 |
| Entertainment and repertoire | 7.5 | Defects 1, 2, 13, 15 |
| Format clarity and rhythm | 8.5 | Defects 2, 4 |
| Visual identity and graphics | 8.0 | Defects 7, 9, 10 |
| Data robustness | 8.0 | Defects 6, 8 |
| Feasibility and fit | 8.5 | Defect 12; the scale of the build |

**Round 2: 7.5.** Redesign.

---

## Round 3 — the redesign (`docs/programmes/full-time.md`, round 3)

**What changed:** spectacle (the stadium's scoreboard for SCORE CENTRE, PIXEL REPLAY in the moment, sound cues, IN THEIR
WORDS at a press conference); a results line with a delivery (source verb in the past, the score in words, a beat before
it, grouped by sport); passed steps ahead dropped; BREAKDOWN by kind with a fitted question, or none; a women's rule that
never promotes a brief; the sport from the link; club and football caps; a vertical scoreboard unless the source says
who was at home; a fixture reader (with the forms measured on 13 Oct); a still wall; icons specified at 11 × 11 with a
silhouette test; `minGapHours: 1.5` and a novelty rule; the owner's approval of faces and voices; THE NUMBER never a
score; Rosa's anecdotes banked and rationed. The scoreline reader was prototyped on the 55 real sentences with "x-y".

**Defects (the panel):**

1. **PIXEL REPLAY shows what no source says.** Any animation of a penalty has a direction, a keeper's dive, a run-up: details
   the source never gave. Labelled ILLUSTRATION or not, a viewer will take it as how the goal went in. *Standards:
   blocking as specified.* What the source does give is the kind and often the distance ("from 30 yards", "from the
   spot").
2. **The sources' adjectives are judgements.** The channel reads the outlets' sentences: "A brilliant goal from Bruno
   Guimaraes", "a stunning 3-1 win", "Caicedo's pivotal performance". Read by Kai or Rosa without attribution, a
   journalist's praise or scorn of a player becomes the channel's judgement of a real person. The design bans Rosa's
   opinions and lets the copy carry them.
3. **SCORE CENTRE's titles can be wrong.** "LAST NIGHT'S RESULTS" from the stories' publication times: a reaction piece
   published at 08:00 about yesterday's game, or a report filed at 23:50 for an afternoon game, breaks the rule as
   written. The design does not say what is "last night".
4. **A second glass room.** A studio with a video wall of a stadium is WORLD NOW's glass room with a different picture on
   it. The set should be a place of its own: real sport studios sit pitchside.
5. **The crowd swell is a hope.** The channel's music engine synthesises its sounds; a synthesised crowd risks sounding
   like static or rain. No test, no fallback.
6. **COMING UP's event names.** "Norway's champions, who host Bayern Munich on Tuesday" has no club name for the first
   team; the design says the event is written "A v B" from the sentence, but not what happens when one side is a
   description.
7. **The past tense of the source's verb needs a list.** "stun" → "stunned", "see off" → "saw off", "come from behind to
   beat" → "came from behind to beat", "edge past" → "edged past": not specified, and a wrong form on air ("Coventry
   stunned Newcastle with an emphatic…" read as the results line) is a broken sentence.
8. **Rosa's answer in the AI path is unchecked.** The validator grounds facts, but nothing stops an AI writer giving Rosa
   "a superb display" or "they deserved it". The fallback writer is safe by construction; the AI path needs a check.
9. **The open's whistle and the bed** are specified; the sign-off music, the SCORE CENTRE sting and the grave fallback are
   not (what plays under the sign-off after a grave lead?).
10. **The press-conference room re-dress** is one line; the room's grave variant (darker, colder) and its light must be
    stated as for the existing press room.
11. **Kai and Rosa's looks** are described in a sentence each, and not checked against the cast: Vic Vector and the guests'
    looks are not listed.
12. **The rotation slot** is "one slot" with no position: next to TECH BYTES it makes two magazine shows back to back.

**Scores:**

| Category | Score | Why |
|---|---|---|
| Editorial accuracy and safety | 9.0 | Defects 1, 2, 8 |
| News sense and balance | 9.3 | Defect 6 |
| Entertainment and repertoire | 8.8 | Defects 1 (the replay must change), 5 |
| Format clarity and rhythm | 9.3 | Defects 3, 7 |
| Visual identity and graphics | 8.8 | Defects 4, 10, 11 |
| Data robustness | 9.3 | Defects 3, 6 |
| Feasibility and fit | 9.0 | Defects 5, 9, 12 |

**Round 3: 8.8.** Redesign.

---

## Round 4 — the redesign (`docs/programmes/full-time.md`, round 4)

**What changed:** the replay became THE MOMENT ON THE BOARD (a chalk diagram of the stated distance only); a judgement
filter for every FULL TIME text from either writer (§3.4); SCORE CENTRE's titles defined from the copy and the filing
times; the set became a pitchside platform under a canopy (no glass, no room); the crowd swell has an A/B test and a
fallback; COMING UP names an event only from the sentence; the past tense of every result form in a table, with how
scores are spoken; the validator checks Rosa's answers; the sign-off's music after grave news; the press-conference
room's grave variant; Kai's look changed (Vic already has a close wave crop) and both looks checked against the whole
cast; the rotation slot placed; build gates with measurable bars.

**Defects (the panel):**

1. **Kai dresses like Max.** A blazer over a knit is exactly Max's `knitBlazer`; the owner has already had to separate Omar
   from Paco for the same reason. Same garment, different colours, is the same silhouette at 1x.
2. **A floodlit night at nine in the morning.** WORLD NOW's city follows the hour; a sport show that is always at night
   looks pre-recorded at breakfast time. The platform needs the channel's sky phases: daylight with the floodlights off,
   dusk with them coming on, night.
3. **An empty stand behind a results show** reads as a closed ground. A crowd must be there without moving (the art
   direction forbids twinkling): a still, dithered crowd in the lower tier at low contrast.
4. **"One club in at most two stories" across sports.** "England" is a cricket side, a rugby league side and a football side
   in the same feed; a club must be a team within one sport.
5. **Women's sport is not defined.** The rule needs a test: ESPN's `/wnba/` and `/womens-college-basketball/` links,
   "women's" in the headline or summary, the women's competitions by name (WSL, NWSL, WNBA, Women's World Cup, Women's Super
   League, Lionesses, Matildas…).
6. **Captions would show "four one".** If the result line is written in words for the voice, the captions read "Coventry
   thrashed Newcastle, four one". The text must keep "4-1" (as the board does) and the voice must read it as words.
7. **"THE WBA HEAVYWEIGHT TITLE FIGHT"** is the channel's composition, not the source's words. When both fighters or both
   sides are named, the event is "FURY v JOSHUA"; an event's own name only when the sentence uses it as a name ("the Ashes",
   "the Champions League final").
8. **THE WEEKEND'S RESULTS on Monday** needs Saturday's games, which are more than 24 hours old; the window must say so.
9. **THE MOMENT ON THE BOARD will be rare** (a distance is stated in a few stories a day). Not a defect of honesty, but the
   design should say it is an occasional treat and the moment of the day stands on its picture otherwise.
10. **The open's whistle**: a referee's full-time whistle is usually given as three blasts; "two short, one long" is
    common but the brass phrase should be checked against a real one before it is composed.
11. **Rosa's chats "aim at the presenters themselves"**: right, but the bank must also have reactions for a light story that
    is about a person (a record jersey sale, a milestone) that celebrate the fact, not the person's character.

**Scores:**

| Category | Score | Why |
|---|---|---|
| Editorial accuracy and safety | 9.5 | Defects 6, 7 |
| News sense and balance | 9.5 | Defects 4, 5 |
| Entertainment and repertoire | 9.5 | Defects 9, 11 |
| Format clarity and rhythm | 9.6 | Defect 8 |
| Visual identity and graphics | 9.2 | Defects 1, 2, 3 |
| Data robustness | 9.6 | Defect 8 |
| Feasibility and fit | 9.6 | Defect 10 (a check, cheap) |

**Round 4: 9.2.** Redesign.

---

## Round 5 — the redesign (`docs/programmes/full-time.md`, round 5)

**What changed:** Kai wears a navy bomber with an orange ribbed collar over a white tee (no blazer, no knit: nobody on air
wears a bomber); the ground follows the channel's sky phases (floodlights off by day, on at dusk, halos at night); a still,
dithered crowd in the lower tier; a club is a team within one sport; women's sport defined by link, words and named
competitions; the result line is written in figures and spoken in words (captions read "4-1"); events named only from
the sentence ("FURY v JOSHUA"); THE WEEKEND'S RESULTS reach back to Saturday 06:00; THE MOMENT ON THE BOARD stated as an
occasional treat; the whistle checked (three blasts, the last long, which is the same as "two short and one long");
reactions to a light story about a person celebrate the fact, never the character.

**Defects (the panel; only nitpicks remain, and they are folded into the bible):**

1. After a grave story, SCORE CENTRE would lose its ticking bed under the music rule; the ticks should stay as quiet
   effects. *Folded in.*
2. The greeting must follow the clock (morning, afternoon, evening). *Folded in.*
3. Rosa's hello needs a bank of its own, not one line. *Folded in.*
4. The stand's scoreboard clock must show the channel's time, not an invented match clock. *Folded in.*
5. The roof's flag must be a plain orange pennant, never a national or club flag. *Folded in.*
6. The press-conference microphones need blank foam covers (no broadcaster's mark). *Folded in.*
7. The strap's tag "NBA" for the London Lions against the Trail Blazers would be wrong: the league tags only when the link
   says the league, otherwise the sport (BASKETBALL). *Folded in.*
8. THE WEEKEND AHEAD on a Friday with a Wednesday event must be titled COMING UP. *Folded in.*
9. The athletics icon (a runner) is the one most likely to read as a generic person at 11 × 11: the silhouette gate must
   test it first. *A build gate already covers it.*
10. Twelve anecdotes rationed to once a day each mean some editions have none: correct, and the bible says so implicitly;
    no change.
11. The execution risk is concentrated in two places the design cannot settle on paper: Kai and Rosa's faces (characters
    have taken four rounds before) and the voice reading results. Both have gates with the character rubric and A/B for
    the owner. *Not a design defect; watched on air.*

**Scores:**

| Category | Score | Why |
|---|---|---|
| Editorial accuracy and safety | 9.8 | Every number, name, date and claim has a grounded reader with a stated failure mode; no judgement of a person from either writer; courts, deaths, rumours, odds and stale pages excluded |
| News sense and balance | 9.8 | Lead by coverage and freshness, with a three-hour rule; caps per sport and per club within a sport; three sports; a women's rule that never promotes a brief |
| Entertainment and repertoire | 9.75 | Rituals (the scoreboard, the breakdown, the number, the moment, the week ahead, the press conference), sound used sparingly, banks with a six-hour memory, no catchphrase, rationed anecdotes; the spectacle is honest |
| Format clarity and rhythm | 9.8 | Three shapes from the calendar and the material, budgets and a drop order, segments skipped never padded, a results delivery with a cadence |
| Visual identity and graphics | 9.75 | A set that reads as nothing else (an open-air platform that follows the hour), a still crowd, its own accent and graphics, no logos, icons with a silhouette gate |
| Data robustness | 9.8 | Behaviour stated for a matchday, a quiet morning, no scorelines, too few stories and the owner's data switch |
| Feasibility and fit | 9.75 | Built on existing engines (THE CATCH, the expert grounding, the press room, the sky phases, the boards); characters from proven parts; gates with measurable bars |

**Round 5: 9.75. The design passes.** Execution starts with the desk (build plan step 1); the on-air critique goes in
`docs/roadmap/critique/full-time.md`.
