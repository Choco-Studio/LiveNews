# PRESS START — design critique log (programme #3; working title)

The owner's process (13 Oct, in his words: "Encuentra los nichos… diseña el funcionamiento del programa por dentro…
Comienza la autocritica y detecta fallos. Despues corrijelos… Para dar como bien cualquier cosa tu autocritica tiene que
dar una nota superior a 9.7"):

1. find the niche and design the programme, with a repertoire that never feels repetitive;
2. a hostile self-critique, fixing every fault;
3. build (after the reviewer accepts the design);
4. then the next programme.

**Nothing passes below 9.7.** The niche study ranked video games third (`docs/roadmap/NEW_PROGRAMMES.md` §3, 78 of 100,
working title PLAY). This log is step 2 for the design: `docs/programmes/press-start.md`. PAY ATTENTION's design log is
the warning this one heeds: its score fell to 5.0 in round 5, when the design was first measured on real data with its
own exclusions applied. **Here the design was measured on the live feeds, with its exclusions, from round 3.**

## The panel

- a senior producer of games television;
- a standards and legal editor;
- a senior broadcast director;
- a lead pixel artist;
- a games journalist;
- a first-time viewer who doesn't play games.

## The categories

Each is scored 0–10; **the round's score is the lowest category.**

- **Editorial truth**: nothing false on screen or in a voice; no opinion stated as fact.
- **Standards**: what is never told, what is told with care, and whether the rules catch it on real copy.
- **Entertainment and repertoire**: is it fun, does a regular viewer ever feel a repeat.
- **Data viability (measured)**: do the live sources feed it, on the days measured, after the exclusions.
- **Craft**: look, sound, timing.
- **Consistency**: the bible agrees with itself, with the code it names and with the measurements.

## How it was measured

- **Readings.** `tools/play/snapshot.mjs` read every candidate outlet (30 games outlets, `tools/play/outlets.json`) and
  four of TECH BYTES's feeds through the environment's proxy, and saved each reading raw under
  `data/play-measure/snapshots/<UTC stamp>/` (gitignored: the outlets' text stays on this machine), with the structured
  sources (Steam) under `data/play-measure/data/`. The readings and their times are listed in the final round.
- **The measurement.** `tools/play/measure.mjs` parses every reading with the channel's own feed parser
  (`server/news.js` `parseFeed`), unions the items by link, and computes for each outlet the time its readings cover
  without a gap and the **complete London days** inside it (an outlet's day counts only when its readings cover the whole
  day). Items a day are counted on complete days only.
- **The standards** are code from round 3 on (`tools/play/standards.mjs`, `tools/play/dates.mjs`), so every share in this
  log is what the bible's own rules remove, never a guess.
- **The hand check.** `tools/play/handcheck.mjs`: every report that would air judged by hand, use or out, with a reason;
  the tool's verdicts scored against it. A report fails when it breaks a standard **or repeats an event told in the 24
  hours before**. **Rules are tuned on some days and judged on others**: a set's score counts as held out only when no
  rule was changed after looking at it. Each rule set is frozen beside the readings before the set that judges it is
  looked at (`data/play-measure/standards-v3-frozen.mjs`, `standards-v4-frozen.mjs`, `standards-v5-frozen.mjs`,
  `measure-v5-frozen.mjs`, `measure-v6-frozen.mjs`), with the labels (`handcheck-*.json`).
- **Supply.** `tools/play/supply.mjs`: what each segment could carry each day, and the fresh events at each edition hour.
- **The accent.** `tools/play/accent.mjs`: CIEDE2000 distances and WCAG contrasts.
- Tests: `test/play-measure.test.js`.

---

## Round 1 — the first draft (PLAY), on paper

The first draft: PLAY, 8–10 minutes, every hour. Max Circuit hosting with a new co-host. Segments: the lead; RUMOUR MILL
(the day's leaks and rumours, labelled RUMOUR); REVIEW SCORES (a new game's Metacritic score, read from Steam's store);
STEAM TOP 10 (the concurrent chart); GUESS THE GAME (a screenshot sharpening in steps while the presenters guess); FREE
THIS WEEKEND; SPEEDRUN OF THE DAY (the newest world record, with the runner's name); ON THIS DAY (release anniversaries
from Wikipedia); PATCH NOTES. Sources: the niche study's two outlets "and the big sites". Standards: PAY ATTENTION's
excluded kinds and the channel's `isGrave`, with every grave story out, layoffs included. A green accent; "a games room
full of screens".

Faults:

1. **RUMOUR MILL airs leaks and rumours.** A label does not make a guess true, and leaked footage is someone's stolen
   work. (Standards editor, games journalist.)
2. **REVIEW SCORES** states an aggregate as the game's quality ("an 87") and reads it from Steam's store endpoint, which
   no licence covers. (Standards editor, games journalist.)
3. **GUESS THE GAME is PAY ATTENTION's PICTURE THIS** with a games skin. (Producer.)
4. **FREE THIS WEEKEND advertises** a publisher's offer. (Standards editor.)
5. **SPEEDRUN OF THE DAY names private people** by their handles, some of them children, and speedrun.com's terms were
   never read. (Standards editor.)
6. **Max Circuit hosting.** He fronts TECH BYTES and plays PAY ATTENTION; the two magazines would read as one, and no
   other presenter would be on air as much. (Producer, first-time viewer.)
7. **Layoffs and closures excluded.** The industry's biggest story of these years would be dropped, and the owner asked
   for grave news "con respeto pero bien". (Games journalist, standards editor.)
8. **The quiz's exclusions and `isGrave` on games copy, untested.** "Gears of War", "Grand Theft Auto", a mode "killed".
   (Standards editor.)
9. **Nothing measured**; the outlets were named from memory. (Producer.)
10. **Hourly, 8–10 minutes**, with no supply figure behind either. (Director, producer.)
11. **PLAY reads as a media control** on screen and is awkward to say ("That's PLAY"). (First-time viewer, director.)
12. **A viewer who doesn't play has no way in**: games are named and never explained. (First-time viewer.)
13. **Green is MONEY MINUTE's accent.** No colour was measured. (Pixel artist.)
14. **"A games room full of screens"** is the screen-covered set `ART_DIRECTION.md` calls cheap, and moving screens break
    its motion budget. (Pixel artist, director.)
15. **STEAM TOP 10 rests on an endpoint nobody checked.** (Producer.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 4.0 | 1, 2 |
| Standards | 3.5 | 1, 4, 5, 7, 8 |
| Entertainment and repertoire | 6.0 | 3 |
| Data viability | 3.0 | 9, 15 |
| Craft | 5.0 | 13, 14 |
| Consistency | 6.0 | 11 |

**Round score: 3.0.**

## Round 2 — the second draft (PRESS START), on paper

**Fixed**:

- no rumour segment, no leaks;
- THE REVIEWS: each outlet's verdict quoted, with its name, and no aggregate;
- no quiz round, no deals, no speedruns;
- two new presenters (Max as the owner's alternative, with what it costs);
- layoffs and closures told plainly; an industry figure's death as a tribute;
- standards of its own, as word lists: leaks, rumours, explicit content, harm to people, conflict, gambling, the
  outlet's voice, guides, commerce, off topic;
- 30 outlets listed, and every one probed through the proxy (28 answered);
- 6–7 minutes;
- the title PRESS START (PLAY and HIGH SCORE as alternatives);
- the cartridge, so every game named is explained;
- lemon proposed as the accent; the arcade after closing as the set;
- PATCH NOTES, UNLOCKS, ACHIEVEMENT UNLOCKED, THE PLAYER COUNT.

Faults:

1. **STEAM TOP 10 is still in**; the endpoint's documentation and terms are unread. (Standards editor, producer.)
2. **ON THIS DAY rests on Wikimedia**, unverified, and a release's day differs by region. (Games journalist.)
3. **The chemistry jokes about real games** ("the hardest level ever made"): opinions of real products. (Standards
   editor.)
4. **Publisher screenshots of mature games** could put gore or nudity on screen, pixelated or not. (Standards editor,
   pixel artist.)
5. **The border with TECH BYTES is undefined**: the same story on two programmes an hour apart. (Producer.)
6. **No weekend**: the draft assumes every day is a weekday. (Producer.)
7. **Lemon sits next to NEWS IN 60's yellow**, and nobody has measured how close. (Pixel artist.)
8. **The arcade's cabinets animate**: dozens of attract modes behind the faces break the motion budget. (Director, pixel
   artist.)
9. **THE REVIEWS takes "the best reviews"**: a choice that becomes the channel's opinion. (Standards editor.)
10. **No rule for time words**: "launches tomorrow" read two days later. (Games journalist.)
11. **PATCH NOTES could carry a layoff** as a "−" line. (Standards editor.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 7.5 | 9, 10 |
| Standards | 7.0 | 3, 4, 11 |
| Entertainment and repertoire | 8.0 | 6 |
| Data viability | 6.0 | 1, 2 (reachability probed; nothing else measured) |
| Craft | 7.5 | 7, 8 |
| Consistency | 8.0 | 5 |

**Round score: 6.0.**

## Round 3 — measured on the live feeds, with the bible's exclusions

Round 2's fixes were written, and its standards became code (rules v1). The first readings (16 Oct, 16:22, 16:36 and
16:42 UTC) were measured, and the outlets' items of 14 and 15 Oct were judged by hand.

Faults:

1. **The channel's grave test misreads games copy.** `isGrave` (`server/facts.js`) flagged 84 of the 469 games items of
   complete days (17.9 %). Four of them were harm or a death: a death told twice, a data breach and an anecdote about
   9/11. The other 80 were game titles and figures of speech ("Fire Emblem", "Gears of War", "server crashes", a mode
   "killed in January"). The quiz's excluded kinds (`server/quiz/desk.js` `excludedKind`) found crime in 44 and conflict
   in 54. The station's grave mode would have silenced the music and the chat on one story in six. (Standards editor;
   consistency.)
2. **Game titles set off the bible's own rules.**
   - "Grand Theft Auto" read as a theft, putting four GTA stories under harm;
   - "Stalker" (a game) as stalking;
   - "Stranger Than Heaven Act 1" as law;
   - "puzzle" made the channel's `notNews` drop a puzzle game ("Porta Nubi turns the iPhone Duo into part of the
     puzzle");
   - "The Last of Us" read as the outlet's first person;
   - "rip off" read as RIP, a death.
   
   (Standards editor.)
3. **The outlet's voice passes.** On 15 Oct, sixteen reports the rules kept were the outlet's opinion, snark or hedge:
   "The Shogun 2 remaster is so bad, Sega is removing it from sale", "Put Down Your Pitchforks, GTA 6 Was Always
   Eligible…", "CONTROL Resonant crosses 1 million sales, and all that not pirating might have paid off". (Games
   journalist, standards editor.)
4. **On a day the rules had not seen, a quarter of what they kept should have gone.** On 14 Oct, with the fixes of fault
   3 in, 13 of the 49 reports the rules kept were features, previews, hedges or promotion: a precision of 73.5 %
   ("Destiny 1 project … seemingly gets a nod", "Looking back on 10 years of Overwatch", "PlayStation Plus Game Catalog
   for October"). Recall was 97.3 %. (Games journalist, standards editor.)
5. **Events chained.** Grouping reports with the desk's `sameStory`, one report at a time, joined 22 reports into one
   event through shared names: a franchise title is four or five capitalised words, and `sameStory` takes two shared
   names for one story. A datamine in that event took a layoffs story off with it. (Producer.)
6. **Weekends are thin.** The seven outlets read whole over 10–11 Oct gave one would-air event on Saturday and three on
   Sunday. (Producer.)
7. **Release dates are few.** The date reader found 13 unique dated releases in the whole window, almost all from
   Gematsu. As designed ("the next seven days"), UNLOCKS would have been empty on every day before 16 Oct. (Producer.)
8. **Steam's data is not what the draft assumed.**
   - `ISteamChartsService` is not in Steam's public Web API documentation: its documentation page opens the home page;
   - `GetTopReleasesPages` is stale (its newest page is "Top Releases of February 2025");
   - the store endpoints (release dates, prices, Metacritic, review summaries, top sellers) have no licence;
   - the Web API's own terms (July 2010) license an Application named at key sign-up.
   
   (Standards editor, producer.)
9. **Wikimedia answers 429**, and its SPARQL endpoint timed out, from this environment: ON THIS DAY cannot be built.
   (Producer.)
10. **Short feeds**: Polygon's ten items span 1.5 hours, TheGamer's 2.7, Insider Gaming's 6.5, IGN's 15. One reading
    measures nothing of them. (Producer.)
11. **Reachability flickers.** Nintendo Life answered 403 on one reading and Pure Xbox on another (the same publisher's
    sites); VentureBeat answered 429 every time; NME's feed is empty. (Producer.)
12. **THE REVIEWS is rarer than designed.** Two games carried two outlets' verdicts in the week (Penguin Colony;
    Castlevania: Belmont's Curse). (Producer.)
13. **TECH BYTES already tells games stories**: 32 of its 628 airings in the 12–16 Oct archive (5.1 %, about seven
    stories). (Producer.)
14. **The measurement's own coverage rule** cut a trade desk's weekend: a gap of more than two days between items ended
    an outlet's coverage, and GamesIndustry.biz rests from Friday evening to Monday morning. (Consistency.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 7.0 | 3, 4 |
| Standards | 5.0 | 1, 2, 4 |
| Entertainment and repertoire | 7.5 | 6, 12 |
| Data viability | 4.5 | 4, 5, 6, 7, 8 |
| Craft | 7.5 | — |
| Consistency | 6.5 | 1, 14 |

**Round score: 4.5.**

## Round 4 — the redesign (rules v2), judged on days the rules never saw

What changed:

1. **Game titles masked first** (`TITLE_LOOKALIKES`: "Grand Theft Auto", "Gears of War", "Heavy Metal Death Can", "The
   Last of Us", "Stalker"…), then the programme's own harm and death tests. `isGrave` does not judge PRESS START's copy
   (bible §4.11).
2. **A games event test**: the desk's `sameStory` **and** a shared word of what happened beyond the names (a stem of four
   letters, a common games word only with another), and each report joins the first report of its event, never by
   chains (`tools/play/measure.mjs` `sameGamesEvent`, `clusterEvents`).
3. **Event rules carried by half the reports**: a leak, harm, a conflict or gambling puts the whole event off only when
   at least half of its reports carry it; one report wrongly joined never does.
4. **One report an event**, by tier (1 the trade and platform desks, 2 the general desks, 3 the desks that write in
   their own voice, 4 the platforms' blogs, never told from); tier 3 only when another outlet carries the event.
5. The rules on fault 3 of round 3: the reader addressed, interjections, teasers, verdict tails, "so bad", feuds; a
   quotation stripped with its apostrophes; "puzzle" read as a genre; leaks as an event, not leaks as a subject.
6. **SAVE FILE**, the weekend shape, from the programme's own archive.
7. **Steam**: only the documented Web API (the live player count, a developer's news posts), and only once the owner has
   registered a key naming GLOBIT 24. The charts, the store data and the stale pages are listed and not used.
8. **ON THIS DAY and the speedruns dropped**, with the reasons recorded.
9. **The accent measured** (`tools/play/accent.mjs`): lemon is 19.1 from NEWS IN 60's yellow in CIEDE2000, further than
   three pairs already on air.
10. **The cabinets are still**: abstract idle frames, one marquee sweep every 24 s.
11. **The border with TECH BYTES** (bible §3.3) and the harm hand-off to TECH BYTES's pool (§4.4).
12. **Time words** re-anchored with FULL TIME's `retime`.
13. **PATCH NOTES never carries hardship**; **THE REVIEWS takes every verdict of the week**, up to four.
14. **The coverage rule**: a gap of four days, not two, ends an outlet's coverage.

**Judged on 12–13 Oct** (77 items, every one by hand; no rule had been changed after looking at those days): **24 of
the 31 reports that would air passed (77.4 %)**.

Faults:

1. **Features and profiles from tier 1 pass**: "The happiest man in gaming hates generative AI", "'Years of building…' –
   Why GameDataCore wants to find out how players feel", "Kaho Shibuya on her love for turn-based RPGs". (Games
   journalist.)
2. **A rumour told as fact by one outlet airs**: GamesIndustry.biz on Epic's "AI first" plan, which four other outlets
   hedge ("reportedly"). (Standards editor.)
3. **The outlet's hedge passes**: "Arc Raiders player-numbers rebound…, but they might be deceptively high". (Standards
   editor.)
4. **Gossip passes**: "as GTA 6 and Zelda are lampooned by Saturday Night Live, former employees recall Elon Musk Wario
   skit controversy". (Standards editor.)
5. **The voice passes in tier 2**: "No Man's Sky is somehow coming to mobile". (Games journalist.)
6. **One event would air twice**: "Nintendo executive confirms company has 'no plans to ditch physical games'" (Eurogamer)
   and "Nintendo's Latin America VP says there are no plans to ditch physical games" (GamesIndustry.biz) were not joined.
   (Producer, director.)
7. **The mature titles' pictures** are not ruled on. (Pixel artist.)
8. **UNLOCKS** over "the next seven days" held no date on 12–15 Oct and three on 16 Oct. (Producer.)
9. **Lemon and NEWS IN 60** are 19.1 apart, but the bible does not say how the two are told apart beyond hue. (Pixel
   artist.)
10. **The editions' hours and minimum** are not set against the measured hours of filing. (Director.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 8.5 | 2, 5 |
| Standards | 7.5 | 1, 2, 3, 4 |
| Entertainment and repertoire | 8.5 | 8 |
| Data viability | 7.0 | 1, 6, 8 |
| Craft | 8.5 | 7, 9 |
| Consistency | 8.5 | 10 |

**Round score: 7.0.**

## Round 5 — rules v3, judged on archives first read after they were frozen (set D)

What changed:

1. **An event one outlet carries airs only from a tier 1 or 2 report whose headline states an act** (`NEWS_VERB`: a
   launch, a date, a delay, a deal, a closure, a statement). A feature, a profile, an interview or a preview states none.
2. **A rumour puts the event off when more than half of its reports hedge it** (one report and one announcement of the
   same thing is an announcement).
3. **The outlet's hedge on its headline** ("seemingly", "somehow", "might be", "appears to", "it seems") keeps that
   report off. In a later sentence it hedges a detail and does not ("upscaling that appears to have been done by AI").
4. **Mature titles**: before 21:00 the cartridge, never a screenshot (bible §4.3); measured: 10 of 42 would-air events
   on the GTA 6 trailer day, 2 of 37 the next.
5. **UNLOCKS**: the nearest three to five dates of the next fourteen days, from 30 days of stories; fewer than three, no
   segment.
6. **Lemon is told apart by device as well as hue**: always with ink and the ▶ cursor, never a dial or a ring.
7. **The editions**: about 12:00, 17:00 and 21:00 London, each needing eight fresh would-air events (bible §7).

**The rules were frozen at 17:00 UTC on 16 Oct** (`tools/play/standards.mjs`, sha1 8918f639…, kept as
`data/play-measure/standards-v3-frozen.mjs`). On the days they were tuned on (12–15 Oct), 78 of the 80 reports that
would air pass by hand (97.5 %).

**Held out (set D).** Five outlets publish an archive in pages (Siliconera, Kotaku, Destructoid, Insider Gaming,
Shacknews: `page`/`deepPages` in `tools/play/outlets.json`). They were first read in depth at 17:22 UTC, after the
freeze, back to 5–7 Oct: items no rule had seen. Every report of theirs that rules v3 would air was judged by hand
(`data/play-measure/handcheck-deep-v3.json`): **39 of 61 passed (63.9 %)**. Siliconera, tier 1: 24 of 33. The tier 3
desks, which v3 let tell an event another outlet carried: 15 of 28. The same readings measured the first weekend: 12
outlets complete on Saturday 10 and Sunday 11 Oct.

Faults:

1. **A quarter of Siliconera's would-air reports are not games news.** Anime ("Dragon Ball Super: Beerus Anime Debut
   Date", "First Suikoden: The Anime Episode Will Be Free on YouTube", "Witch on the Holy Night, Madoka Visual"), an
   audio drama on a train, figures, an action figure, toys, "Canon-Accurate Danganronpa 2 Underwear", an airline's
   collaboration ("Chiikawa Characters Get Jobs in ANA Collaboration"). Tier 1 trusted a desk whose beat is Japanese
   pop culture as much as games. (Games journalist, standards editor.)
2. **Tier 3 tells events.** Allowed to tell an event another outlet carried, the voice desks put their own framing on
   air: "However it looks, Phantom Blade Zero is no Soulslike", "Capcom's Resident Evil remakes shine on Nintendo Switch
   2", "The Internet Loves Star Wars: Galactic Racer's Biddy Blas", "You'll Have One Last Shot At The Zelda… Switch 2",
   "Physical Sales Of Wolverine Estimated To Be Surprisingly High For A Company That's Ab[out to…]". The event is
   real; the report told is the outlet's column. (Games journalist.)
3. **A private person on air**: "Hellraiser: Revival Gameplay Gets YouTuber Permanently Banned". (Standards editor.)
4. **Guides and promotion in new forms**: "Should you use Afterburner or Ramjet…", "Beginner's Tips: 9 Hints…", "EVO
   France 2026: Schedule, brackets, prize pool, games & where to watch", "PlayStation Plus Games Catalog Adds 9 Games",
   a collector's edition's contents. (Producer, standards editor.)
5. **Television passes as games**: an actor on a television series ("Nicolas Cage Says He's Done Working With
   Amazon…"), an animated series ("Avatar: Seven Havens…"). (Games journalist.)
6. **One event airs twice.** On 14–16 Oct, ten pairs of the 98 would-air reports told one event: the desk's names test
   reads names from sentence case, and title-case headlines ("Fire Emblem: Fortune's Weave Expansion Pass Announced,
   Wave 1 Launches Today") give it none. (Director, producer.)
7. **The hand labels disagreed with themselves**: a Helldivers 2 Warbond was judged out as promotion on one day and a
   Fire Emblem expansion pass in on another. Both are a game's paid content announced by its maker: both use. The
   label was corrected, and the 12–15 Oct score was recomputed on it. (Consistency.)
8. **Two archives cannot be read in depth**: VGC's and Gematsu's second pages answer 403, so their weekends stay
   unmeasured. (Producer.)
9. **The weekend, now measured, is thin**: with 12 outlets complete, one would-air event on Saturday 10 Oct and three on
   Sunday 11 Oct; Saturday's 27 usable reports were all from tier 3. (Producer.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 7.0 | 2 |
| Standards | 6.5 | 1, 3, 4 |
| Entertainment and repertoire | 8.5 | 9 |
| Data viability | 6.0 | 1, 2 (63.9 % held out), 6 |
| Craft | 8.5 | — |
| Consistency | 8.0 | 7 |

**Round score: 6.0.**

## Round 6 — rules v4 and events v5, judged on 16 Oct

What changed:

1. **Tier 3 never tells an event** (rules v4): the voice desks only confirm, counting as a second outlet for an event a
   tier 1 or 2 report tells (bible §4.12). Faults 2, 3 and 5 of round 5 came from tier 3.
2. **Off topic, widened** (`OFF_TOPIC` in `tools/play/standards.mjs`): anime (never "anime game" or "anime-style"),
   manga, webtoons, audio dramas, light novels, action and scale figures, a figure that "appears" or "follows", toys,
   plushies, apparel and underwear, streamers and YouTubers, television series and their actors.
3. **Guides and commerce**: "where to watch", "tips:", "hints to", "beginner's", "should you…", a platform's "games
   catalog", a collector's edition.
4. **The outlet's voice**: "shine(s) on", "however it looks", "the internet loves / hates / is".
5. **Events v5** (`gamesEventMatch`, `clusterEvents` in `tools/play/measure.mjs`): two headlines are one event when they
   share a run of two or more words that names something (not filler, a platform, a month or a bare word like
   "trailer"; capitalised where the headline is in sentence case) and either the run says what happened ("GTA 6 launch
   trailer") or the rest of both headlines shares a word of what happened, never a platform or a maker. The desk's names
   test still joins sentence-case headlines that share no run ("Ubisoft closing Trials developer RedLynx" / "Ubisoft to
   close Trials studio RedLynx"), but only with a particular name in common, never platforms alone. A report joins the
   event it matches best, when it matches at least a third of that event's reports. Each step was taken after a
   measured failure: joining by the first report alone split events told differently first; joining by any report
   chained "Fortnite is coming to Linux" to "Big Walk not coming to Xbox", and Big Walk's boycott took Fortnite off;
   merging two events a report matched made one event of every GTA story of the week.

**Frozen**: rules v4 at 17:27 UTC (sha1 16786c0c…; `data/play-measure/standards-v4-frozen.mjs`), events v5 at 17:51
UTC (`data/play-measure/measure-v5-frozen.mjs`). On the material they were tuned on:

- the 12–15 Oct hand labels: 69 of the 70 labelled reports that still air pass (the miss: round 4's Nintendo pair,
  "no plans to ditch physical games", told twice);
- set D: 18 of the 20 Siliconera reports that still air pass. The two that do not: "Witch on the Holy Night, Madoka
  Visual Shows Both Heroines" (an anime film whose headline names no medium) and "Chiikawa Characters Get Jobs in ANA
  Collaboration";
- events on 14–16 Oct: 98 would-air reports; five pairs still tell one event (Zero Parades on Switch 2, The Blood of
  Dawnwalker's update 1.1, Peak on PS5, the Ocarina of Time overview trailer, Call of Duty's next sub-series), against
  ten under v4. Two stories were lost to a wrong join: Rockstar's employment tribunal (joined to "Rockstar's next game
  won't take eight years") and Saturday Night Live's GTA 6 and Zelda sketch (joined to an Activision executive's "no
  offense to Zelda").

**Judged on 16 Oct to 17:30 UTC.** The rules had been tuned while looking at a few of that day's items (the cancelled
Assassin's Creed footage, Penguin Colony's reviews), so the day is not held out; but none of its would-air reports had
been judged. After both froze, all 43 were (`data/play-measure/handcheck-2026-10-16.json`): **29 passed (67.4 %)**.
Five failed a standard and nine were repeats.

Faults:

1. **One event told twice, nine times in a day.** The event test missed pairs told in different words: within the day,
   Steam's achievement sets (The Verge at 00:00, VGC at 11:00), The Blood of Dawnwalker's update 1.1 (Push Square, IGN),
   Ken Kutaragi on discs (IGN, Push Square), the end of Beast of Reincarnation's updates (Push Square, Polygon); across
   days, Call of Duty's next sub-series, Control Resonant's sales, Zero Parades on Switch 2, Ancestors on PS5 and Peak's
   console dates, each told on 15 Oct and again on 16 Oct. "Control Resonant becomes the fastest-selling game in
   Remedy's history" matched one of its event's four reports, under the third the clustering asks. (Director,
   producer; the first-time viewer: "didn't they say this yesterday?")
2. **A leak airs**: "The Shrek 2 Video Game Is Getting a Remaster, Leaks via Xbox Store" (Push Square). Two of the
   event's five reports read as leaks ("Microsoft Store page appears", "Officially Leaked By Xbox"), under half.
   (Standards editor.)
3. **Two deals air**, both IGN's: "Get a Switch 2-Ready 512GB MicroSD Express Card for $85", "Don't Miss Out on
   Amazon's Fall Audible Deal: Pay $0.99 Per Month". (Standards editor.)
4. **A person's praise of a product as the story**: "Xbox's New OLED ROG Ally Is Getting Huge Praise From This Former
   PlayStation Exec". (Games journalist.)
5. **Round 5's airline collaboration is still in** ("Chiikawa Characters Get Jobs in ANA Collaboration"). (Games
   journalist.)
6. **A tier 3 report passed every rule though criminal and explicit**: "Blogger Found Guilty Of Taunting State Senator
   With Shrek Dick Picks" (Kotaku). Tier 3 never tells, but a report that passes counts as a confirming outlet.
   (Standards editor.)
7. **Wrong joins lose stories**: Rockstar's employment tribunal and Saturday Night Live's sketch (above). (Producer.)
8. **Whose verdicts THE REVIEWS quotes is unwritten.** The week's verdicts came mostly from tier 3 (Rock Paper Shotgun,
   Destructoid, Shacknews), the desks the tiers never tell from. (Consistency.)
9. **The weekend clears SAVE FILE's minimum on one report**: one fresh would-air event on Saturday 10 Oct, from
   Eurogamer. (Producer.)
10. **NOW LOADING's filling bars read as the stream buffering.** On a live channel a bar that fills under a picture says
    "wait". (First-time viewer.)
11. **The open ends on a full-field white flash**: a jolt on a 24-hour channel and a needless photosensitivity risk.
    (Director.)
12. **The ACHIEVEMENT toast slides in at the bottom right**, where the strap and the captions are. (Pixel artist,
    director.)
13. **SAVE FILE's week in games is five headlines read in a row**: a list, the thing a weekend edition must not be.
    (Producer.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 8.0 | 2 |
| Standards | 7.5 | 2, 3, 6 |
| Entertainment and repertoire | 8.0 | 1, 13 |
| Data viability | 6.5 | 1–5 (67.4 %) |
| Craft | 8.0 | 10, 11, 12 |
| Consistency | 8.5 | 8 |

**Round score: 6.5.**

## Round 7 — rules v6, events v7 and the repeat check, judged on the older days (set E)

What changed:

1. **The repeat check** (`repeats`, `tools/play/measure.mjs`; bible §4.12): a story is not told when PRESS START told
   one in the 24 hours before whose headline shares a naming run with it **and** a kind of act (two releases, two
   updates, two sets of sales, two trailers…) or a platform. Another story of the same game, of another kind, airs ("GTA
   6 Launch Trailer…" and "GTA 6 Barely Makes the Cut for The Game Awards").
2. **Leaks**: "leaks via". **Commerce**: a headline that starts "Get / Grab / Snag a…" and carries a price, "don't miss
   out", "per month". **The outlet's voice**: "huge / high / rave praise", "from this former…". **Off topic**: an
   airline's collaboration. **Harm**: "found guilty", "guilty verdict". **Explicit**: "dick pic", "genital".
3. **Events v6**: "getting" and "got" name nothing ("Is Getting a Remaster" / "Is Getting Huge Praise").
4. **THE REVIEWS quotes any outlet's verdict, whatever its tier** (bible §5.5): a verdict is an opinion by definition
   and airs as one, in quotation marks with the outlet's name; the tiers decide who tells the news. A review in
   progress is not a verdict (`reviewVerdict`, rules v6; it changes no selection).
5. **STAGE SELECT** replaces NOW LOADING: the three headlines as stage tiles on a level-select screen, the ▶ cursor
   stepping to each as it is read. **The open blooms** (a soft brighten over a quarter of a second), never a white
   flash. **The toast rises from the strap's top edge** and stays above the strap and the captions. **SAVE FILE's week**
   gives each event its sentence, its board and its day, in the order they aired, and a line for what changed since.
6. **Events v7: a franchise's full name and its short one are one name** ("Grand Theft Auto" and "GTA", "Call of
   Duty" and "COD"). On 15 Oct "Grand Theft Auto 6 launch trailer suddenly drops…" and "GTA 6 Launch Trailer…" were
   two events of one trailer; the first was off only because its tier 1–2 reports were all explicit.

**Frozen** at 18:09 UTC (rules v5 and events v6: `standards.mjs` sha1 1441085c…, `measure.mjs` a7596f63…), then at 18:21
with items 4 and 6 (rules v6 e9aa23d4…, events v7 f75c9a04…, its comments brought up to date at 18:30 with no code
changed; copies `data/play-measure/standards-v5-frozen.mjs`, `standards-v6-frozen.mjs`, `measure-v6-frozen.mjs`,
`measure-v7-frozen.mjs`). On the material they were tuned on: the 12–15 Oct labels 67 of 68 (the miss: round 4's
Nintendo pair, "no plans to ditch physical games", still told twice); set D 17 of 18 (the Madoka film's headline names
no medium); 16 Oct 29 of 33, the four misses repeats in words that share no run ("Steam can now show game achievements
in separate 'sets'" / "Steam is introducing Achievement Sets"; Kutaragi's "Killing Discs Backlash" / "Disc Mess";
"Ancestors: The Humankind Odyssey coming to PS5…" / "Animal Evolution Sim Ancestors Gets Surprise PS5 Version"; Peak's
console dates, told on 15 Oct and again by Nintendo Life). The 12–15 Oct labels had judged the standards only; every set
now counts a repeat as a failure. The repeat check removed eight reports on 14–16 Oct, all eight true repeats. A looser
check, joining on one shared name, removed seventeen, eight of them wrongly ("Pokémon TCG Pocket" as a repeat of
"Pokémon Dev … Beast of Reincarnation"), and was dropped.

**Held out (set E).** The items filed after 17:30 UTC (set C) came slowly: four would-air reports in the first
75 minutes. The older days were a larger set no rule had been tuned on: every would-air report filed before 5 Oct
London, from the long feeds (GamesIndustry.biz, Game Developer, Game Informer, Ars Technica…) and from Siliconera's
archive, read back to 20 Sep at 18:32 UTC, after the freeze. Ten were left out because their titles had been read
before: the eight the channel's `isGrave` flagged (round 3 read those titles) and two printed by a debugging run. **42
of the 55 others passed (76.4 %)** (`data/play-measure/handcheck-held-out-e.json`).

Faults:

1. **Siliconera's merchandise in words the rules did not list**: "2 Figures of Persona 4 Revival Protagonist Yu
   Narukami Confirmed", "Atelier Yumia Figure Status Update Shared", "Bleach Blood Chains Ichigo Maximatic Figure Will
   Follow Hitsugaya One", "Xenosaga KOS-MOS Model Kit Returns in May 2027", "Family Computer & Nintendo Entertainment
   System Photo Book Debuts"; a concert ("Persona Super Live 2027 Concert Will Last 3 Days"); shops ("Mall of America
   Bandai Namco Cross Store and Gundam Base Openings Delayed"). Rules v4 named a figure by what it did ("appears",
   "follows"): fitted to set D's words. (Games journalist, standards editor.)
2. **Hardship told as plain news**, so the bed would play under it: "Moss Developer Polyarc Is Shutting Down",
   "Microsoft CEO says Xbox is simply 'streamlining' after cutting over 5,750 jobs in three years". (Standards editor.)
3. **A roundup and the outlet's own promotion**: "Everything Announced At The BlizzCon 2026 Opening Ceremony", "Cover
   Reveal – Grand Theft Auto VI" (Game Informer's magazine), "Winners of the UK Best Places To Work Awards 2026 revealed"
   (GamesIndustry.biz's own awards). (Producer.)
4. **General technology**: "Meta announces new VR glasses that weigh about 100 grams and cost $1,300" (Game Developer).
   (Producer.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 8.0 | 2 |
| Standards | 7.0 | 1, 2, 3 |
| Entertainment and repertoire | 8.5 | — |
| Data viability | 7.0 | 1–4 (76.4 % held out) |
| Craft | 9.0 | — |
| Consistency | 8.5 | 1 (a rule fitted to its examples) |

**Round score: 7.0.**

## Round 8 — rules v7, judged on Siliconera's September (set F)

What changed (rules v7, frozen 18:38 UTC, `standards.mjs` sha1 9a662cb2…, `data/play-measure/standards-v7-frozen.mjs`):

1. **Merchandise in general words**: a figure, unless it is a number or a person ("sales figures", "a key figure"),
   model kits, photo and art books, keychains, acrylic stands, collectibles, concerts, shop and café openings, the
   Gundam Base; **smart and VR glasses** with TECH BYTES's technology.
2. **Roundups**: "everything announced", "all the announcements", "the biggest reveals".
3. **The outlet's own promotion**: "cover reveal", "cover story", "Best Places To Work".
4. **Hardship**: a studio that "is shutting down", jobs cut "over 5,750", a collective action.

On set E, now tuned on, all thirteen failures are fixed. **Held out (set F)**: Siliconera's archive from 31 Aug to 20
Sep, read at 18:38 UTC after the freeze: **39 of 44 passed (88.6 %)** (`handcheck-held-out-f.json`).

Faults:

1. **Merchandise again, in new words**: "Creer Beaute Pon de Couleur Animal Crossing Makeup Gashapon Announced",
   "Yu-Gi-Oh Crocs and Jibbitz Charms Launch Next Week", "Cospa to Release New NieR Automata Shirts and Jacket". (Games
   journalist.)
2. **A roundup**: "Here Are All The Legend of Zelda 40th Anniversary Direct Reveals". (Producer.)
3. **An impression**: "Model Debut4 Remains a Game Focused on Playing Dress-up, but Gets Buggy on PC". (Standards
   editor.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 8.5 | 3 |
| Standards | 7.5 | 1 |
| Entertainment and repertoire | 8.5 | — |
| Data viability | 7.5 | 1–3 (88.6 % held out) |
| Craft | 9.0 | — |
| Consistency | 8.5 | 1 |

**Round score: 7.5.**

## Round 9 — rules v8, judged on Siliconera's August (set G)

What changed (rules v8, frozen 18:42 UTC, sha1 ea0f1135…): gashapon and capsule toys, Crocs and charms, shirts,
jackets, shoes, make-up, cosmetics and perfume; "here are all the…", "all the … reveals"; a verdict tail "but gets
buggy / rough / janky…". On set F, now tuned on, all five failures are fixed.

**Held out (set G)**: Siliconera's archive from 31 Jul to 31 Aug, read at 18:42 UTC after the freeze: **41 of the 52
reports that would air passed (78.8 %)** (`handcheck-held-out-g.json`), and one story was wrongly held back as a repeat.

Faults:

1. **Nine of the eleven failures are Siliconera's merchandise and events, in words no list had**: watches, a museum's
   tickets and goods, trading cards, an exhibition, a themed café, a drinks maker's cans in vending machines, a takoyaki
   collaboration, a board-game maker's souvenirs, a crossover's shop event. Three held-out sets in a row: each round's
   words fix the last set and miss the next. **Word lists will not clean Siliconera's single-outlet stream.** (Producer,
   games journalist.)
2. **A guess**: "Terranigma Might Appear at Pixel Arcadia Showcase". (Standards editor.)
3. **An opinion**: "Genshin Impact 7.0 Offers Valuable Answers". (Games journalist.)
4. **The repeat check held back a different story**: "The Witcher 3 Remastered Arrives Ahead of Songs of the Past DLC"
   a day after "Witcher 3 Expansion Will Be at Gamescom, Witcher 4 in 2028": one name, one kind of act (a DLC), two
   stories. (Producer.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 8.5 | 2, 3 |
| Standards | 7.0 | 1 |
| Entertainment and repertoire | 8.5 | 4 |
| Data viability | 7.0 | 1 (78.8 % held out) |
| Craft | 9.0 | — |
| Consistency | 8.5 | 1 |

**Round score: 7.0.**

## Round 10 — v9: Siliconera never tells an event alone, judged on 5–11 Oct (set H)

What changed (frozen 18:49 UTC: `standards.mjs` sha1 83640d51…, `measure.mjs` 26906870…, `outlets.json` 1bd0c747…;
copies `data/play-measure/*-v9-frozen.*`):

1. **Siliconera never tells an event it carries alone** (`"alone": false` in `tools/play/outlets.json`; bible §3.1). It
   tells an event another outlet carries ("New Epic Games Launcher 'Vibe Coded' Because 'Programming Is Hard'", seven
   outlets) and confirms others' events. On sets D–G, now tuned on, 152 of Siliconera's 156 judged reports go, and
   with them all 32 of its failures. **The cost**: 120 sound reports over the 77 days of its archive read, about one and
   a half a day (Japanese release dates, patches, events), and 1–3 of each weekday's would-air reports on 13–16 Oct.
   Gematsu (tier 1) covers that beat; how much of Siliconera's it also carries could not be measured, since Gematsu's
   older pages answer 403.
2. G's words for the other outlets: watches, goods, souvenirs, trading cards, exhibitions (never an exhibition match),
   museum tickets, themed cafés, vending machines, theme parks; the hedge "might appear / arrive / launch / come /
   return".

**Held out (set H).** Between set E (before 5 Oct) and the first hand labels (12 Oct) lay a week no one had judged:
every would-air report filed 5–11 Oct London that no label covered, from the long feeds (Eurogamer, GamesIndustry.biz,
Game Developer, Game Informer…). Twelve were left out as seen (isGrave's flags, and four printed by the weekend check).
**24 of the 28 others passed (85.7 %)** (`handcheck-held-out-h.json`).

Faults:

1. **An unconfirmed report from private posts**: "Ninja Theory begins laying off staff, according to employee posts"
   (GamesIndustry.biz). (Standards editor.)
2. **A hedge in a word the list lacked**: "Supermassive Games suffers layoffs as more than 70 developers seem to have
   left the company this week" (Eurogamer). (Standards editor.)
3. **Fans' words as the story**: "'Horrible day to be a Shion main' - Overwatch fans aren't happy about five new
   China-exclusive skins" (Eurogamer). (Standards editor, games journalist.)
4. **An actor's tease under a pun**: "More Cox in video games as Daredevil and Clair Obscur star says he's in an
   unannounced Sega title" (Eurogamer). No word list catches a pun. (Games journalist.)
5. **Across every set judged, single-outlet and multi-outlet events fail about equally** (now airing: 77 of 82 single,
   70 of 74 multi): a desk that told only events two outlets carry would lose half its supply and not reach the bar.
   (Producer.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 8.5 | 1, 2 |
| Standards | 8.0 | 1–4 |
| Entertainment and repertoire | 8.5 | — |
| Data viability | 8.0 | 85.7 % held out |
| Craft | 9.0 | — |
| Consistency | 9.0 | — |

**Round score: 8.0.**

## Round 11 — rules v10, judged on what was filed after 17:30 UTC (set C)

What changed (rules v10, frozen 19:02 UTC, `standards.mjs` sha1 89e6a054…; events and selection unchanged since v9):
the hedge "seem(s) to have / be"; a report "according to employee posts", "posts on LinkedIn / social media"; "fans
(players) aren't happy", "fans are furious / livid / outraged". On set H, now tuned on, 24 of 25 pass (the pun stays).

**Held out (set C)**: every item filed after 17:30 UTC on 16 Oct, to the last reading at 19:06 UTC: 35 items, of which
**four would air** (`handcheck-held-out-c.json`). Two of the four titles had been read while tuning (no rule was written
for either); a third title read then, Siliconera's "Resident Evil Anniversary Exhibition Full Map Revealed", is off under
v10 and is not counted. **Of the two never seen, one passed; of all four, one.**

Faults:

1. **A leak airs as "official"**: "Stop The Presses! Shrek 2 Is Officially Being Remastered For Xbox Series X|S" (Pure
   Xbox). The remaster appeared on the Microsoft Store before any announcement; three of the event's seven reports said
   so ("store page appears", "Officially Leaked By Xbox", "Leaks via Xbox Store"), under the half the event rule asks,
   and "Appears Briefly on XBOX Store" is a store listing in words the leak list lacks. The half rule protects an event
   from one wrongly joined report; here it let a leak through. (Standards editor.)
2. **The outlet's column**: "GTA 6 Recaptures What Made GTA's Best DLC So Great" (Polygon). (Games journalist.)
3. **A free-play promotion with a teaser**: "You Can Play WoW: Forever For Free Next Week (But There's A Catch)"
   (GameSpot). (Standards editor.)
4. **The evening's copy is the hardest**: of the 35 items, twelve were off topic, five guides, four the outlet's voice
   and one a review; nine passed every rule but were tier 3's or not told; the four that would air were what was left,
   and three were wrong. Four is too few to measure a rate, and three of four is not a rate the panel can pass.
   (Producer.)

| Category | Score | Worst fault |
|---|---|---|
| Editorial truth | 8.0 | 1 |
| Standards | 7.5 | 1–3; five held-out sets at 64–89 % |
| Entertainment and repertoire | 9.0 | — |
| Data viability | 7.5 | the held-out precision; weekends half read |
| Craft | 9.0 | — |
| Consistency | 9.0 | — |

**Round score: 7.5.**

---

### Round 11's standing (superseded by round 12)

**The final score is 7.5, under the 9.7 the owner's process asks.** The design is not accepted by its own bar. What
holds and what does not:

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial truth | 8.0 | What airs is the source's own report, credited, with its evaluative words kept off the strap and the voices; but on held-out copy a leak told as "official", a column, a pun and a tease still pass the words, and six repeats in words that share no name remain in the tuned sets |
| Standards | 7.5 | The rules are measured word lists, and their measured precision on copy they never saw did not converge: 63.9 % (D), 76.4 % (E), 88.6 % (F), 78.8 % (G), 85.7 % (H), 1 of 2 (C). Each round's words fixed the last set and missed some of the next. The structural rules held where words did not (tier 3 never tells: round 5's tier-3 failures gone; Siliconera never alone: all 32 of its failures gone) |
| Entertainment and repertoire | 9.0 | The rituals (the cartridge, PATCH NOTES, UNLOCKS, THE REVIEWS, ACHIEVEMENT, STAGE SELECT), three shapes and banks for every frame are designed on measured material; nothing is recorded yet, THE PLAYER COUNT waits on the owner's Steam key, and the chemistry rests on fictional teases a viewer has not yet heard |
| Data viability | 7.5 | Weekday supply is measured and ample on full-desk days (32 and 40 would-air events; editions 6–18 fresh, the noon one sometimes short); the weekend is measured for 12 outlets only (1 and 3 events); the desk's precision on unseen copy is the limit |
| Craft | 9.0 | Accent measured (lemon, 19.1 from the nearest), the set, the open (no flash), the boards and the sound designed and placed; none rendered or heard |
| Consistency | 9.0 | The bible's numbers are the tools' outputs and its rules the code it names; the frozen copies and labels let every score be recomputed. The grave-test figure (160 of 1,083) comes from the scope read by 18:00, before Siliconera's archive |

**What would pass it**, in the order the panel asks for it:

1. **A second reading, measured** (bible §10, step 1): the writer's prompt carries the standards, and the writer may
   decline a story it reads as merchandise, a rumour, a private person's words or the outlet's column, with its reason.
   The words and the writer together are judged on three held-out days at 97 % or better. This is the step-1 gate; the
   design can only name it, since the writers are not run in a design session.
2. **The leak rule for a store listing**: an event whose reports include a store page or listing that appeared before
   an announcement stays off, whatever the other reports call it (fault 1).
3. **A whole weekend read** with the platform desks, and the noon edition's threshold set on it.

## Round 12 — corroboration as a universal rule (the reviewer's lever), judged on every held-out set

The reviewer (16 Oct) kept round 11's 7.5 and refused a model writer as the gate: the station has none, and the design
must pass on what it has. The lever already proved twice ("tier 3 never tells", "Siliconera never alone") was to be
tested as a universal rule before concluding that the word lists cannot converge.

What changed:

1. **The corroboration rule** (rules v11; `independentSources`, `tools/play/measure.mjs`): a story is told only when two
   independent sources carry its event in reports that pass every rule, and a tier 1 or 2 report tells it. Sister sites
   of one publisher count once (`group` in `tools/play/outlets.json`: Nintendo Life, Push Square and Pure Xbox; PC Gamer
   and GamesRadar+; IGN, Eurogamer, GamesIndustry.biz and Rock Paper Shotgun; TheGamer and Polygon; The Verge's two
   feeds; Ars Technica's two). The single-outlet path (a headline that states an act) is gone; so is Siliconera's
   special rule, which the universal one contains.
2. **The store-listing rule**: a report that shows a store page or listing, or an age rating, before an announcement
   puts the whole event off on its own ("Shrek 2 Remastered Appears Briefly on XBOX Store").
3. **Rules v12: on a corroborated event, a tier 2 report tells only from a headline that states an act.** Written after
   set C's two failures, both tier 2 tellers of real events ("GTA 6 Recaptures What Made GTA's Best DLC So Great", "You
   Can Play WoW: Forever For Free Next Week (But There's A Catch)").

Frozen: v11 at 19:21 UTC (`standards.mjs` 8abd75a5…, `measure.mjs` 1eb9495c…, `outlets.json` 35cf5136…), v12 at 19:38
(`measure.mjs`; the source count moved into `independentSources` afterwards with an identical selection, 838a8a33…).
v11's definitions were fixed before any held-out set was scored with them. v12's act rule came after v11's scores, from
set C, and its effect on set H (two sound stories dropped) was seen before it froze: on D–H it is held out only in the
sense that no failure there suggested it. Independence by publisher and by outlet gave the same counts on every day
compared (10, 11 and 14–16 Oct).

**Held out, with and without.** Every held-out set was judged once, under the rules frozen before it was read. Applying
corroboration to those same labelled reports (an event counts as corroborated in the events of the frozen v11 code, and
a report kept off corroborates nothing) gives the side-by-side the reviewer asked for:

| Set (rules it was judged under) | Without corroboration | With corroboration (v11) | With the tier 2 act rule (v12) |
|---|---|---|---|
| D, the paged archives (v3) | 39 of 61 (63.9 %) | 5 of 5 | 5 of 5 |
| E, before 5 Oct (v6) | 42 of 55 (76.4 %) | 3 of 3 | 3 of 3 |
| F, Siliconera's September (v7) | 39 of 44 (88.6 %) | 1 of 1 | 1 of 1 |
| G, Siliconera's August (v8) | 41 of 52 (78.8 %) | none airs | none airs |
| H, 5–11 Oct (v9) | 24 of 28 (85.7 %) | 10 of 10 | 8 of 8 |
| C, after 17:30 UTC (v10) | 1 of 4 | 0 of 2 | (tuned on: the rule was written from it) |
| **Held out in all** | **186 of 244 (76.2 %)** | **19 of 21 (90.5 %)** | **17 of 17 (100 %)** |

**Every leak, rumour and column that got through, and whether corroboration stops it** (held-out sets):

| Kind | Reports | Stopped by corroboration | Stopped by v12 |
|---|---|---|---|
| Leak (Shrek 2's store listing told as "official", C) | 1 | 1 (the listing rule) | 1 |
| Rumour or hedge (Wolverine's sales "Estimated To Be Surprisingly High", D; Terranigma "Might Appear", G; Ninja Theory "according to employee posts" and Supermassive "seem to have left", H) | 4 | 4 | 4 |
| Column, verdict or teaser (three tier 3 reports in D: "…is no Soulslike", "…shine on Nintendo Switch 2", "The Internet Loves…"; "Remains a Game…, but Gets Buggy", F; "Offers Valuable Answers", G; "More Cox in video games…", H; Polygon's GTA 6 column and GameSpot's free-play promo, C) | 8 | 6 | 8 |
| A private person's words (a YouTuber's ban, D; Overwatch fans, H) | 2 | 2 | 2 |
| Merchandise, anime, cafés, exhibitions, tech, guides, promotion (D–G) | 41 | 41 | 41 |

The two that corroboration alone let through were real events told by a tier 2 desk's column or promotion; the first
of them was also a wrong join (Polygon's column and GamesRadar+'s "GTA 6 might finally fix a graphical bug" share only
"GTA 6").

**The whole pipeline on every window judged** (12–16 Oct to 19:06 UTC and the older days, every would-air report judged,
the reports no label covered judged now): without corroboration 166 of 182 pass (91.2 %), with v12 64 of 66 (97.0 %).
The two v12 misses: "Gears of War boss says the next game won't take seven years to make as he dances around the
question" (Eurogamer, 8 Oct, three sources: a voice tail) and Nintendo Life's "'Peak' … Scales October's Stacked Switch
2 Release Schedule" on 16 Oct, a repeat of Peak's console dates told on 15 Oct. These windows were tuned on; they are
not held out.

**Fresh held out after the freeze**: from 19:06 to the last reading at 19:45 UTC the 30 outlets filed one item, and none
would air. The weekend of 17–18 Oct has not happened. **No fresh held-out report exists for v12.**

**Supply, with and without** (would-air events a London day; for each schedule, the events that became tellable since
the edition before: under corroboration an event can air only once its second source has filed):

| Day | Without | With (v12) | One edition at 19:00, without / with | Two (13:00, 19:00), with | Three (12, 17, 21), with |
|---|---|---|---|---|---|
| Sat 10 Oct (12 outlets read whole) | 1 | 1 | 1 / 2 | 2, 0 | 0, 1, 0 |
| Sun 11 Oct | 3 | 1 | 3 / 1 | 0, 1 | 0, 0, 1 |
| Mon 12 Oct (long feeds only) | 9 | 3 | 7 / 2 | 1, 1 | 1, 1, 0 |
| Tue 13 Oct | 8 | 1 | 8 / 1 | 1, 0 | 1, 0, 1 |
| Wed 14 Oct | 20 | 11 | 16 / 5 | 2, 3 | 0, 2, 6 |
| Thu 15 Oct (the full desk) | 32 | 19 | 29 / 19 | 10, 9 | 6, 9, 3 |
| Fri 16 Oct (to 20:45 London) | 39 | 12 | 45 / 19 | 13, 6 | 9, 6, 1 |

**Supply decides one edition a weekday, at about 19:00 London**, airing only with eight or more tellable events since
the day before: on the two full-desk days, 19 and 19. A second edition would leave the evening one with 9 and 6. On the
partial-desk days (12–14 Oct) no edition would air. Corroborated segments on the full-desk days: PATCH NOTES 7 and 3
lines, ACHIEVEMENT 2 and 1, serious stories 0 and 1. **UNLOCKS nearly disappears**: on 16 Oct two independent sources
state one date in the next fourteen days and two in the next thirty (Modern Warfare 4 on 23 Oct, Zero Parades on 3 Nov).
**Weekends**: SAVE FILE once a day from the week's archive, with the one fresh corroborated story each weekend day gave.

**The weekend read**: the platform desks' feeds give no older pages (page 2 is page 1 for Nintendo Life, Push Square,
Pure Xbox, GameSpot, Polygon and IGN; The Verge answers 404; VGC's and Gematsu's older pages answered 403 at 17:22), and
the long feeds' page 2 is their page 1 too. The last weekend cannot be read whole; the next one has not happened.

**The grave test on the full sample**: `isGrave` flags 191 of the 1,546 games items of complete days (12.4 %). Nine are
harm, a death, a disaster or a conflict (a death told by three outlets, a voice actress's death, a hack of Discord's
users, a DDoS attack, an anecdote about 9/11, a war, an earthquake relief donation); the other 182 are game titles and
figures of speech. It misses six the programme's own tests catch (a data breach, an arrest, a fraud allegation, a
conviction, a crypto pump-and-dump, a death told as "passes away"). The programme's own harm test raised five false
alarms, four kept off by an earlier rule anyway and one a games story lost ("Xenoblade Chronicles 2 Switch 2 Edition
Prioritizes Blades").

Faults:

1. **Seventeen held-out reports cannot show 97 %.** 17 of 17 is the bar's level, but one more miss would make it 94 %;
   with no misses, about a hundred held-out reports are needed before 97 % is the lower bound. At 19 corroborated events
   a full weekday that is five weekdays of readings under the frozen v12, which the session cannot wait for. (Producer,
   standards editor.)
2. **The tier 2 act rule was written after set C**; its held-out evidence is post hoc on D–H, where it also dropped two
   sound stories ("Blizzard is changing the appearance of WoW: Forever's new Skyborne race…", "Dave the Diver and
   Subnautica 2 team up…"). On the tuned windows, seven of the ten tier 2 tellers it removes were sound. (Games
   journalist.)
3. **A voice tail and a cross-platform repeat still pass** on the tuned windows: "…as he dances around the question",
   and Peak on PS5 then on Switch 2. (Standards editor, director.)
4. **One edition a weekday, not three, and none on a partial-desk day.** (Producer.)
5. **UNLOCKS becomes occasional** (one corroborated date in the next fourteen days on 16 Oct). (Producer, first-time
   viewer.)
6. **The weekend's platform desks are unread**: no older pages, two 403s. (Producer.)
7. **The publisher groups are public knowledge, not measured**: they need the owner's or the build's check. (Standards
   editor.)
8. **The programme's harm test dropped a games story** ("…Prioritizes Blades"). (Games journalist.)

| Category | Score | What keeps it from 10 |
|---|---|---|
| Editorial truth | 9.5 | Every story on air is carried by two independent sources and told from a trade, platform or general desk's report of an act; a voice tail and a cross-platform repeat remain on the tuned windows |
| Standards | 9.3 | Held out: 76.2 % without corroboration, 90.5 % with it, 17 of 17 with v12; no story from an excluded kind on held-out copy under v12. Seventeen is too few to show 97 %, and the v12 act rule was fitted to set C |
| Entertainment and repertoire | 9.0 | One edition a weekday with room to choose (19 tellable events on a full-desk day); UNLOCKS rare; nothing recorded yet; THE PLAYER COUNT waits on the Steam key |
| Data viability | 9.0 | One weekday edition on full-desk days; none on partial-desk days; weekends one fresh story a day and the archive; the platform desks' weekends unread |
| Craft | 9.0 | Designed and placed, none rendered or heard |
| Consistency | 9.5 | The bible matches the code and the tools' outputs, the grave figure re-measured on the full sample; the publisher groups rest on public knowledge |

**Round score: 9.0.**

---

## Where the design stands: not passed, and what would pass it

**The final score is 9.0, under 9.7.** The corroboration rule is the lever: it took held-out precision from 76.2 % to
90.5 %, and with the tier 2 act rule to 17 of 17, on what the station has (feeds, word lists, publisher groups, no model).
The price is supply: one edition each weekday evening, SAVE FILE at weekends, UNLOCKS seldom. What keeps the design
under the bar is evidence, not a fault the panel can fix on paper:

1. **About a hundred fresh held-out reports under the frozen v12** (five weekdays of readings), judged by hand, at 97 %
   or better with no excluded kind on air. This is build step 1's gate (bible §10), and it can start the day the desk
   reads the feeds every 20 minutes.
2. **A whole weekend read with the platform desks**, to set SAVE FILE's fresh-story minimum on measured supply.
3. **The publisher groups checked** by the owner or the build.

Round 11's standing (7.5) is superseded; its findings stay above as the record.

## Readings

All on 16 Oct 2026 (UTC), through the environment's proxy: 16:22, 16:36, 16:42, 16:48, 16:57, 17:13, 17:19, 17:22 (the
five archives in pages, back to 5–7 Oct), 17:50, 17:56, 17:59, 18:10, 18:17, 18:26, 18:28, 18:32 (Siliconera to 20 Sep),
18:38 (to 31 Aug), 18:42 (to 31 Jul), 18:50, 19:02, 19:04, 19:06, and for round 12 19:27 and 19:45: 24 readings over 3.4
hours. Steam's Web API and store endpoints at 16:22, 16:36, 16:57, 17:19, 17:50, 19:02 and 19:06. Older pages probed at
19:17 and 19:40 (status, item counts and dates only, so the pages stayed unseen). Every reading is saved raw under
`data/play-measure/snapshots/` and `data/play-measure/data/` (gitignored); every hand label under
`data/play-measure/handcheck-*.json`; every rule set as frozen beside them.
