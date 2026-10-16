# PRESS START — style bible (design; working title)

The day in video games on GLOBIT 24. Owner, 13 Oct: new programmes, planned systematically; the niche study ranks video
games third (`docs/roadmap/NEW_PROGRAMMES.md` §3: 78 of 100, working title PLAY). Programmes must entertain, not only
inform. This file builds on `docs/ART_DIRECTION.md` and `docs/programmes/world-now.md` and states only the differences.
The design's critique rounds are in `docs/roadmap/critique/press-start-design.md`; every number below is one of the
measurements logged there (`tools/play/`, readings saved under `data/play-measure/`, which is gitignored).

**The title is a working title for the owner** (§2.4): PRESS START, chosen over the study's PLAY in the critique's first
round; PLAY and HIGH SCORE are the alternatives.

**Status: step 2 not passed.** The critique's eleventh round scores 7.5 against the owner's 9.7. Supply, sources, shape,
look and repertoire hold; the desk's precision on copy it never saw does not (64–89 % on five held-out sets, §4.10), and
the critique's last section says what would pass it.

## 1. The idea in one paragraph

Six minutes on what happened in video games today, for the viewer who plays a little or not at all as much as for the
player who wants the dates, the numbers and the news without the noise. Two presenters, in an arcade after closing time,
tell the day's games news from the trade and news desks: the launches, the delays, the deals between companies, the
studios in trouble. Every game named gets its **cartridge**, a card that says what it is, who makes it and where it plays,
so nobody is lost. The day's small changes arrive as **PATCH NOTES**; the week's release dates **UNLOCK** one by one; what
the critics said is quoted and credited, never ours; a live **PLAYER COUNT** says how many are playing right now; and the
day's milestone pops up as an **ACHIEVEMENT**. A viewer stays for the rituals, the pace, the pixel art at home in its own
subject and two people who enjoy it. **Nothing on screen is the channel's opinion, a leak or a guess**: the stories pass
standards measured on the live feeds (§4), and the programme does not air on a day too thin to fill it (§7).

## 2. Cast

### 2.1 Two new presenters (recommended; the owner chooses)

| | Role | Character | On air |
|---|---|---|---|
| **The host** (new; name, face and voice for the owner) | Presenter | Quick, warm and curious; plays everything and finishes almost nothing; loves a date and a number, never a hype word | Reads the headlines, the lead, most stories, UNLOCKS and THE REVIEWS; asks the co-host the question a non-player would ask |
| **The co-host** (new; name, face and voice for the owner) | Co-presenter | The arcade veteran (fictional): dry, exact and patient; explains what a figure means from the source's facts; never impressed by a trailer | PATCH NOTES, THE PLAYER COUNT, ACHIEVEMENT UNLOCKED, some stories, the context after the lead |

- **Candidates** (sheets at build step 6; one pair goes on air):
  - host A **Cleo Combo**: a chin-length shag with a heavy fringe, black with one lemon streak, a navy overshirt over a
    lemon tee;
  - host B **Remy Respawn**: a tight curly top with faded sides, a short boxed beard, a charcoal track jacket with a lemon
    zip;
  - host C **Juno Joypad**: long box braids gathered into one low knot, round silver earrings, a cream cardigan over a
    striped tee;
  - co-host A **Arlo Arcade**: a grey flat cap, round tortoiseshell glasses, a white goatee, a vintage ink varsity
    jacket;
  - co-host B **Hattie Hiscore**: a short silver crop swept back, small square glasses, a burgundy roll-neck under a
    tweed jacket;
  - co-host C **Gus Glitch**: a bald head with a full grey beard and a woollen beanie pushed back, a denim jacket over a
    hoodie.

  Each silhouette is checked against every face on air (the presenters, the correspondents, the experts, Kai and Rosa,
  the three quiz-host candidates) at step 6, as FULL TIME's were. No one on air wears a cap, a beanie or a varsity jacket.
  The guests' look generator adds the chosen pair to the looks it must not repeat.
- **Voices**: two new blends unlike the voices on air (`server/voice/casting.json`), three candidates each; the owner
  chooses by ear.
- **Why new faces**:
  - a games show wants play in its register; TECH BYTES is built "for grown-ups", with no puns and no silliness
    (`tech-bytes.md` §3.2);
  - a new pair gives the channel's thirteenth programme its own chemistry;
  - every existing presenter already carries one programme or more, and Max also plays PAY ATTENTION.

### 2.2 The alternative: Max Circuit hosts, with one new co-host

The owner may prefer an existing face. Max is the channel's gamer type ("always first to try the new thing",
`config/channel.json`).

- **For**: a known face; one new character instead of two; Max's enthusiasm suits the subject.
- **Against**:
  - Max would front TECH BYTES (up to 15 stories, several editions a day) and PRESS START, and play PAY ATTENTION: no
    other presenter would be on air as much;
  - the two programmes would read as one, which matters because they share a border (TECH BYTES aired 32 games airings,
    about seven stories, in 12–16 Oct's archive, §3.3);
  - TECH BYTES's rules on Max (no puns, adult register) would have to bend on one programme and hold on the other.
- If the owner chooses it, Max keeps his look and voice. The co-host is one of the three candidates above, and the
  banter moves from eras (§2.3) to Max's habit of buying everything at launch, a trait from his own bible.

### 2.3 The chemistry and its limits

- **The generations.** The host grew up online and on phones, and the co-host in arcades. They tease each other about
  eras, never about a real game, company or person: "In my day a patch came on a magazine disc." / "In my day it came
  while I slept." Each has a bank of twenty fictional memories (the co-host's lost high score; the host's backlog) that
  name **no real game, company, console or person** (FULL TIME's rule for Rosa's past, `full-time.md` §2): one an
  edition, none again within seven days, since a regular viewer sees about twenty editions a week and a memory heard
  twice is a rerun. The teases are twelve each, none again within six hours station-wide.
- **The fiction is spoken, never shown.** No board, number or caption carries a presenter's fictional past.
- **Nobody judges a game, a studio or a person** (§4.7): no "brilliant", "a mess" or "worth it". A verdict airs only in
  THE REVIEWS, as the outlet's own words, with its name.
- **No laughter and no applause**, the owner's rule.

### 2.4 The title (for the owner)

- **PRESS START** (recommended): the words on every game's title screen, said before anything begins. It works spoken
  ("Welcome to PRESS START") and as a ritual: the open is a title screen waiting for the button (§8.3).
- **PLAY** (the niche study's): short, but on a screen it reads as a media control, and "That's PLAY" is awkward to say.
- **HIGH SCORE**: lively, but it promises competition, which the programme does not hold.

The id follows the working title (`press-start`), as PAY ATTENTION's did. If the owner names it otherwise, the id stays.

## 3. Editorial: the sources

### 3.1 The outlets (measured; §4.10 for the numbers)

Thirty games outlets and four of TECH BYTES's feeds were read through the proxy, again and again through the design
session (the critique's final round lists every reading). Twenty-eight of the thirty answered with a feed:

| Tier | Outlets | Why this tier |
|---|---|---|
| **1** (a single outlet's event airs) | GamesIndustry.biz, Game Developer, VGC, Gematsu, Nintendo Life, Push Square, Pure Xbox, RPG Site; Siliconera only for events another outlet carries (below) | Trade and platform desks whose headlines state an act ("Fishlabs announces layoffs", "Vixen 357 coming to … on October 23") |
| **2** (a single outlet's event airs) | Eurogamer, The Verge (games), Ars Technica (gaming), IGN, GameSpot, Game Informer, Polygon, Guardian Games | General games and mainstream desks |
| **3** (never told from; confirms) | Rock Paper Shotgun, Kotaku, PC Gamer, GamesRadar+, Destructoid, Shacknews, TheGamer, Insider Gaming, Pocket Gamer | Desks that write in their own voice, or mostly guides, codes and deals. Allowed to tell an event another outlet carried, 13 of their 28 would-air reports failed the hand check ("However it looks, Phantom Blade Zero is no Soulslike"; §4.10). They count as a second outlet for an event a tier 1 or 2 report tells |
| **4** (never told from) | Xbox Wire, PlayStation Blog | The platforms' own blogs: promotion. Read for UNLOCKS only: a date is the maker's own announcement ("Modern Warfare 4 Launches October 23", Xbox Wire), credited to the blog |

- **Not reachable**: VentureBeat Games (HTTP 429, a reset or a time-out on every reading), NME Gaming (an empty feed).
  Nintendo Life answered 403 on three readings of 22 (two of them two minutes apart, at 19:04 and 19:06) and Pure Xbox
  on two (the same publisher's sites): a desk that reads them every 20 minutes must back off on a 403 and read the next
  time, never retry at once.
- **Siliconera never tells an event it carries alone** (`"alone": false` in the desk's feed list). It files Japanese
  pop culture beside its games news (anime, figures, model kits, cafés, exhibitions, collaborations), and three
  held-out sets in a row showed the words chasing it: each round's off-topic words fixed the last set and missed the next
  (§4.10). It tells an event another outlet carries ("New Epic Games Launcher 'Vibe Coded' Because 'Programming Is
  Hard'", seven outlets) and confirms others'. The cost: about one and a half sound reports a day over the 77 days of
  its archive read, 1–3 a weekday on 13–16 Oct. Gematsu (tier 1) covers that beat.
- **The tiers are editorial**, from the hand check (§4.10), and live in the desk's feed list. A tier changes only with a
  new hand check.
- **Short feeds**: Polygon's ten items span about 1.5 hours, TheGamer's 2.7, Insider Gaming's 6.5, IGN's 15. The desk
  reads them every 20 minutes or loses items. **Archives in pages**: Siliconera, Kotaku, Destructoid, Insider Gaming and
  Shacknews publish older items in feed pages, read back to 5–7 Oct for the measurement (Siliconera to 31 Jul); VGC's
  and Gematsu's second pages answer 403.
- **How much was measured, exactly**: 22 readings on 16 Oct, from 16:22 to 19:06 UTC (2.7 hours of
  reading; `tools/play/snapshot.mjs`, raw under `data/play-measure/snapshots/`, gitignored). A feed carries its own
  past, so the readings cover each outlet back to its oldest item: the long feeds and the archives in pages whole
  London days (Game Developer 27, Siliconera's archive 76), the short feeds only hours. Items a day are counted on an outlet's complete days only; for a
  short feed, the rate over the hours its readings cover. 16 Oct itself is complete for no outlet (its evening was still
  being filed). The table, from the last reading (`tools/play/measure.mjs`; Siliconera's archive read back to 31 Jul):

| Outlet | Tier | Read | Hours covered | Complete days | Items a day | Kept a day | Items a day, short feeds (rate over hours read) | Usable events | Also carried by another outlet |
|---|---|---|---|---|---|---|---|---|---|
| Game Developer | 1 | 22/22 | 679 | 27 | 1.7 | 1.3 |  | 34 | 11 |
| GamesIndustry.biz | 1 | 22/22 | 415 | 16 | 5.7 | 3.2 |  | 55 | 20 |
| Gematsu | 1 | 22/22 | 23 | 0 | — | — | 26.6 | 23 | 3 |
| Nintendo Life | 1 | 19/22 | 50 | 1 | 13 | 7 |  | 11 | 5 |
| Pure Xbox | 1 | 20/22 | 73 | 2 | 8.5 | 3 |  | 10 | 7 |
| Push Square | 1 | 22/22 | 30 | 0 | — | — | 20.7 | 17 | 9 |
| RPG Site | 1 | 22/22 | 86 | 2 | 6.5 | 4.5 |  | 16 | 9 |
| Siliconera | 1 | 22/22 | 1850 | 76 | 7.2 | 3.6 |  | 257 | 13 |
| VGC | 1 | 22/22 | 29 | 0 | — | — | 8.2 | 7 | 6 |
| Ars Technica Gaming | 2 | 22/22 | 99 | 3 | 1 | 1 |  | 14 | 3 |
| Eurogamer | 2 | 22/22 | 264 | 10 | 9.2 | 4.8 |  | 51 | 33 |
| Game Informer | 2 | 22/22 | 218 | 8 | 1.6 | 0.6 |  | 28 | 8 |
| GameSpot | 2 | 22/22 | 48 | 1 | 18 | 4 |  | 9 | 9 |
| Guardian Games | 2 | 22/22 | 221 | 8 | 0.6 | 0 |  | 1 | 0 |
| IGN | 2 | 22/22 | 20 | 0 | — | — | 47.4 | 8 | 6 |
| Polygon | 2 | 22/22 | 4 | 0 | — | — | 88 | 8 | 7 |
| The Verge | 2 | 22/22 | 53 | 1 | 5 | 2 |  | 7 | 3 |
| VentureBeat Games | 2 | 0/22 | 0 | 0 | — | — | — | 0 | 0 |
| Destructoid | 3 | 22/22 | 248 | 9 | 17 | 2.7 |  | 31 | 13 |
| GamesRadar+ | 3 | 22/22 | 24 | 0 | — | — | 58.1 | 22 | 12 |
| Insider Gaming | 3 | 22/22 | 187 | 6 | 25.2 | 14.3 |  | 103 | 39 |
| Kotaku | 3 | 22/22 | 245 | 9 | 16.3 | 8.6 |  | 95 | 44 |
| NME Gaming | 3 | 0/22 | 0 | 0 | — | — | — | 0 | 0 |
| PC Gamer | 3 | 22/22 | 51 | 1 | 30 | 6 |  | 14 | 9 |
| Pocket Gamer | 3 | 22/22 | 27 | 0 | — | — | 33.3 | 12 | 0 |
| Rock Paper Shotgun | 3 | 22/22 | 239 | 9 | 10 | 5 |  | 50 | 21 |
| Shacknews | 3 | 22/22 | 248 | 9 | 11.1 | 6.1 |  | 59 | 23 |
| TheGamer | 3 | 22/22 | 6 | 0 | — | — | 52.4 | 3 | 2 |
| PlayStation Blog | 4 | 22/22 | 194 | 7 | 1.1 | 0.4 |  | 4 | 3 |
| Xbox Wire | 4 | 22/22 | 69 | 2 | 3 | 1.5 |  | 8 | 4 |

"Usable events" are the events of the outlet's reports that pass every rule, over every reading; "also carried" counts
those another outlet carried too. VentureBeat Games and NME Gaming never answered with a feed.

### 3.2 What the desk adds to a story

- **The time words** are re-anchored from the day a story was filed to the day it airs, with FULL TIME's reader
  (`server/sport/words.js` `retime`): "launches tomorrow" filed on Monday airs on Wednesday as nothing, since the day has
  passed; a sentence that cannot be re-anchored is dropped.
- **The cartridge** (§8.5) holds only what the story states: the game's name as written, its maker as named ("by Aggro
  Crab", "developer 4J Studios"), its platforms as listed, its date if stated. A field the story does not state is left
  off, never looked up.
- **The release date** (§5.4) is read from the headline or the first sentence only when the sentence says it plainly
  (`tools/play/dates.mjs`): a day and a month, a release verb, never a demo, a beta, a sale or a DLC wave.

### 3.3 The border with TECH BYTES

- **Games stories belong to PRESS START.** The games feeds are a new category, `games`, that no other programme takes.
- **TECH BYTES's own feeds still carry games items**: 2 of 71 items in one reading; in the archive of 12–16 Oct, 32 of
  TECH BYTES's 628 airings (5.1 %, about seven stories). The station's covered map (`NewsDesk.markCovered`) already keeps
  one story from airing twice, whichever programme tells it first.
- **The rule**: TECH BYTES keeps a games story only when it is about a platform's technology or business as a technology
  story (a handheld's chip, an anti-cheat that blocks Linux). Otherwise the desk files it under `games`. This is a change
  to TECH BYTES's desk and needs its own critique round at build step 1.

## 4. Editorial standards: what is never told, and what is told with care

Every rule below is a word list in `tools/play/standards.mjs` (build step 1 makes it the server's games desk). Each was
measured on the live sample (§4.10): the share of items it removes, and its errors in a hand check. **The rules judge
one report; four of them judge the whole event** (§4.9).

### 4.1 Off the desk: not news, not games

| Rule | What it catches | Measured (§4.10: the first rule that keeps an item off, 5–15 Oct) |
|---|---|---|
| **Off topic** | Films and television (a game's adaptation too: the culture desk's), anime, manga, audio dramas, cards, figures, model kits, toys, clothing and merchandise, concerts, exhibitions, themed cafés and shops, PC parts and general technology (TECH BYTES's), word puzzles, streamers and YouTubers, a brand's tie-in with an airline, a headline in another language | 10.7 % |
| **Guide** | How-tos, codes, tier lists, walkthroughs, release-time explainers, countdowns, roundups ("Everything Announced At…", "Here Are All The … Reveals"), "ICYMI", "where to watch", "beginner's tips", "should you…" | 15.1 % |
| **Commerce** | Deals ("Get a … for $85", "Don't miss out"), preorders, stock, bundles, sales, giveaways, free weekends, gift guides, collector's editions, the platforms' monthly catalogues | 1.7 % |
| **The outlet's voice** | Columns, polls, talking points, features, interviews, previews, impressions, the reader addressed, the outlet's first person, questions, interjections ("Whoa,"), teasers ("This…", "From This Former…"), verdict tails ("…, And It's Ridiculous", "…shine on Switch 2"), "the internet loves", a person's praise of a product, the outlet's own magazine cover and awards | 11.5 % |

### 4.2 Leaks and rumours

- **A leak is never told**, nor its pictures shown: leaked footage, a leaker's video, a datamine, a store page or a
  rating that appears before an announcement. The whole event stays off, whichever outlet tells it (16 Oct: the cancelled
  Assassin's Creed footage, in four outlets).
- **A rumour is never told as fact**: "reportedly", "allegedly", "according to sources", "insiders", an analyst's or a
  bank's forecast, "people on Reddit", and the outlet's own hedge on its headline ("seemingly", "it seems", "might be",
  "might appear").
  That report stays off; the event airs only from an outlet that states it as announced. **When more than half of an
  event's reports hedge it, the event stays off** (12 Oct: GamesIndustry.biz told a report on Epic's "AI first" plan as
  fact; four other outlets said "reportedly").
- Measured (the first rule that keeps an item off, §4.10): leaks 1.7 %, rumours 4.6 %; whole events off, 0.2 % of items
  for a leak and 0.4 % for a rumour.

### 4.3 Explicit content and age ratings

- **A report whose headline or opening sentence is sexual or gory stays off**, and none of its pictures airs ("saucy
  shower scene", "sex sells", "naked", "gore"). The event may air from a clean report (15 Oct: the GTA 6 trailer: five
  reports framed it by its sex scene, eight told it clean). 1.1 % of items.
- **Mature titles** (a list of franchises rated 18 or M, and "PEGI 18", "M-rated" in the text): before 21:00 London the
  story stands on its cartridge (§8.5), never a screenshot; after 21:00 the outlet's picture may air. On 15 Oct, the GTA
  6 trailer day, 6 of the 32 would-air events named a mature title; on 16 Oct, 2 of 37.
- Violence inside a game is the game's content, not news: "kill", "war", "shooter", "heist", "police chase" are never
  grave words on this desk (§4.11).

### 4.4 Harm to real people

- **Harassment, abuse, threats, swatting, doxxing, racism, child safety, self-harm, crime, arrests, scams, data
  breaches**: the news programmes tell these, with their correspondents, Ines Clause's legal desk and their balance
  rules. PRESS START does not, and the whole event stays off. 0.6 % of items ("Alleged hacker arrested over leak that
  exposed GTA Online's daily revenue", "Blogger Found Guilty Of Taunting State Senator…").
- This is the channel's "con respeto pero bien" for a games magazine: told fully, by the programmes built to tell it. A
  games feed's item the desk refuses for harm goes to TECH BYTES's pool (category `tech`), so the channel does not lose
  it (a build step 1 change, with TECH BYTES's critique).

### 4.5 Deaths in the industry

- **An industry figure's death airs as a tribute** (designer, developer, composer, voice actor, founder…): the host,
  plainly, with what the source says of the person and their work; the outlet's photograph of the person, credited, or
  the plain TRIBUTE card; no chat after, no music under it or in the segment after (the channel's grave rule), never in
  PATCH NOTES, never as the ACHIEVEMENT, never the lead's cartridge (14 Oct: "Duke Nukem 3D level designer Richard
  'Levelord' Gray dies aged 68", in GamesIndustry.biz and Ars Technica).
- **Anyone else's death** is the news programmes'.
- A tribute never closes an edition, and the sign-off after it is the plain variant.

### 4.6 Layoffs, closures, strikes and hardship

- **Told plainly and fully**, as industry news: the company's own words and the numbers the source gives ("Ubisoft
  closing Trials developer RedLynx and cutting jobs in Singapore studio"). Serious treatment: no joke, no chat after, no
  music under it, never in PATCH NOTES, never next to the ACHIEVEMENT, never on a cartridge with a release date. 2.5 % of
  items were kept as serious, with the lead allowed ("Moss Developer Polyarc Is Shutting Down", "…after cutting over
  5,750 jobs").
- A union's vote or a strike is told with both sides when the source gives them ("Activision Quality Assurance workers
  vote to authorize strike").

### 4.7 Opinions and reviews

- **An opinion is never stated as fact.** An evaluative word in the outlet's headline ("beloved", "iconic", "excellent",
  "a mess", "insane"; 7.4 % of items) never reaches the strap or a presenter: the desk writes from the story's factual
  sentences, as FULL TIME's prepare stage does (`server/sport/prepare.js`), and the writer's validator refuses the words.
  **Every sentence the writers use passes the same tests as the headline**, one by one: the outlet's voice, its first
  person, its hedges and its evaluative words drop the sentence (the summaries carry them too: "The happy-go-lucky
  bigwigs at Epic Games have instructed…", Rock Paper Shotgun 12 Oct).
- **Never a private person's words**: a player's post, a streamer's clip, a commenter's verdict ("'Charging Players $$$
  For AI-Generated Content Is Peak Disrespect'", players quoted by Kotaku 15 Oct). Quotations come from people speaking
  for a company, a studio, a body or themselves in a public role.
- **A review goes to THE REVIEWS** (§5.5), never into the news: the outlet's verdict as it wrote it, quoted, with the
  outlet's name. 3.5 % of items were reviews; three games carried two or more outlets' verdicts in 12–16 Oct (§5.5).
- **A person's or a firm's jibe at another** ("'Little Tim is so obsessed with Gabe'", "throws shade at Steam") is
  gossip and stays off. A person's own account of their own work, attributed, is news ("Rockstar co-founder Dan Houser
  blames himself for Max Payne 3").

### 4.8 Loot boxes and gambling

- **Never**: casino and slot games, betting, odds, poker, bingo, coin and spin links, crypto and NFT games, "free pulls"
  and summon rates. The whole event stays off. 0.3 % of items.
- **A law, a ruling or a regulator's decision about loot boxes is legal news** and airs, plainly (§4.9).

### 4.9 Politics, law and the event rules

- **Politics and conflict** (a war, an occupation, a boycott over one, sanctions, parties, elections, named heads of
  state) are the news programmes'. The whole event stays off (15 Oct: Big Walk's boycott story, in twelve outlets).
  1.2 % of items.
- **Law about games airs, attributed and plain**: a bill ("Power To The Players Act"), a court's ruling, a regulator's
  decision, a lawsuit between companies (what each side says, as the source states). Never an allegation against a
  person.
- **The event rules.** Leaks, harm to people, conflict and gambling put the whole event off when at least half of its
  reports carry them; a rumour when more than half do. One report wrongly joined to an event never takes it off.

### 4.10 What was measured, and how well the rules hold

- **The sample**: every item of every reading (§3.1 says how much was read). The shares below are on the **1,045
  items of 5–15 Oct on the complete London days of the 20 outlets complete on any of them** (an outlet's day counts
  when its readings cover it whole): the window where most of the desk was read whole. Siliconera's archive back to 31
  Jul would weigh the shares toward its own mix and is left out of them.
- **Removed** (the first rule that keeps an item off): off topic 10.7 %, guide 15.1 %, commerce 1.7 %, review 3.5 %,
  the outlet's voice 11.5 %, leak 1.7 %, rumour 4.6 %, explicit 1.1 %, harm 0.6 %, conflict 1.2 %, gambling 0.3 %,
  gossip 0.4 %; whole events off for a leak 0.2 % and a rumour 0.4 %. **Kept**: 46.9 % (news 43.2 %, serious 2.5 %,
  legal 0.9 %, tribute 0.4 %).
- **Per outlet** (kept, of its items on its complete days): Game Developer 72.3 %, RPG Site 69.2 %, GamesIndustry.biz
  57.1 %, Insider Gaming 57 %, Shacknews 55 %, Eurogamer 54.3 %, Nintendo Life 53.8 %, Kotaku 53.1 %, Siliconera 50.6 %
  (76 days of archive), Rock Paper Shotgun 50 %, Pure Xbox 35.3 %, GameSpot 22.2 %, PC Gamer 20 %, Destructoid 15.7 %
  (65 % of its items are guides). `tools/play/measure.mjs` prints the full table, rule by rule.
- **The hand check** (`tools/play/handcheck.mjs`; every label beside the readings). The rules were tuned on some days and
  judged on others; a set counts as held out only when no rule was changed after looking at it.

  | Set | Reports that would air | Passed by hand | Rules |
  |---|---|---|---|
  | 12–13 Oct, **held out** | 31 | 77.4 % | v2 |
  | Five archives read in pages, 5–16 Oct, **held out** (D) | 61 | 63.9 % | v3 |
  | 16 Oct to 17:30 UTC (seen while tuning, judged after) | 43 | 67.4 % (5 standards, 9 repeats) | v4, events v5 |
  | Before 5 Oct, **held out** (E) | 55 | 76.4 % | v6, events v7 |
  | Siliconera, 31 Aug–20 Sep, **held out** (F) | 44 | 88.6 % | v7 |
  | Siliconera, 31 Jul–31 Aug, **held out** (G) | 52 | 78.8 % | v8 |
  | 5–11 Oct, **held out** (H) | 28 | 85.7 % | v9 (Siliconera never alone) |
  | **Filed after 17:30 UTC on 16 Oct, held out** (C), to 19:06 | 4 (2 never seen) | **1 of the 2; 1 of 4 with the two titles read while tuning** | v10 |
  | Every set before C that still airs, tuned on | 155 | 95.5 % (6 repeats in words that share no run, 1 pun) | v10 |

  Each held-out set was judged once, under the rules frozen before it was read; its failures then became the next
  rules (the critique's log, rounds 4–11). **The held-out scores have not converged above 90 %**: each round's words fix
  the last set and miss some of the next.

- **What the words cannot catch**, and the gate that does (build step 1): a pun or a tease ("More Cox in video games
  as Daredevil and Clair Obscur star says he's in an unannounced Sega title"); a feature with a headline that states an
  act; an outlet's opinion in a tail clause; merchandise and events in words no list has yet; one event told twice in
  words that share no name ("Steam can now show game achievements in separate 'sets'" / "Steam is introducing
  Achievement Sets"). Step 1's gate checks every report the desk would air, by hand, over three days, and then a fourth
  day the fixes never saw at 97 % or better.

### 4.11 The channel's grave test does not read games copy

The channel's `isGrave` (`server/facts.js`) flagged **160 of the 1,083 games items of the complete days read by 18:00
UTC (14.8 %)**. Seven of them were harm, a death or a conflict (a death told by three outlets, a hack of Discord's
users, a DDoS attack, an anecdote about 9/11, a war); the other 153 were game titles and figures of speech: "Fire
Emblem", "Gears of War", "server crashes", a mode "killed in January", "Trivia Murder Party". It also missed five the
programme's own tests catch (a data breach, an arrest, a fraud allegation, a crypto pump-and-dump, a death told as
"passes away"). The quiz's excluded kinds (`server/quiz/desk.js` `excludedKind`) flag crime in 98 and conflict in 114.
PRESS START therefore has its own grave and harm tests (§4.4, §4.5), which mask game titles and in-game words first
(`TITLE_LOOKALIKES`: "Grand Theft Auto" is no theft, "Act 1" no law, a puzzle game no newspaper puzzle, "The Last of Us"
no first person). The station's grave mode (music off, no chat) follows the programme's own verdict, not `isGrave`'s,
inside PRESS START: a build step 2 change in the producer and the cue sheet, with a test that "Gears of War" leaves the
bed on and a tribute takes it off.

**Esports** results did not appear in the measured outlets. If a games outlet reports one, it is told as news with FULL
TIME's rule on judging players (`full-time.md` §3.4), never with odds; FULL TIME does not take esports.

### 4.12 The selection: one report an event

- **Events** (`gamesEventMatch` and `clusterEvents`, `tools/play/measure.mjs`; events v7). The channel's `sameStory`
  reads names from sentence case, and games headlines are often in title case: "Fire Emblem: Fortune's Weave Expansion
  Pass Announced" gives it no names, and "Fire Emblem" is a fire to it. So two reports are one event when their
  headlines share a run of two or more words that **names something**, and either the run **says what happened** ("GTA
  6 launch trailer") or the rest of both headlines shares a word of what happened ("Control Resonant … 1 Million Sales"
  / "Control Resonant has sold 1 million copies").
  - A run names something only with a word that is not filler, a platform, a month, a bare word ("trailer", "first
    look", "available") or a word of what happened, and, in a headline in sentence case, only with a capitalised word:
    "launches today" and "breaks new ground" join nothing.
  - What happened is never a platform or a maker: "Activision Confirms Call of Duty Will Get a 'New Sub-Franchise'" is
    not "The 'Call of Duty tax' … Activision says".
  - A franchise's name alone is two events ("Star Wars Galactic Racer launches on Amazon Luna" / "… will soon welcome
    larger podracing parties").
  - A franchise's full name and its short one are one name: "Grand Theft Auto" and "GTA", "Call of Duty" and "COD"
    (15 Oct: "Grand Theft Auto 6 launch trailer suddenly drops…" and "GTA 6 Launch Trailer…" were two events of one
    trailer).
  - Sentence-case headlines that share no run still join through the desk's names test, with a particular name in
    common ("Ubisoft closing Trials developer RedLynx" / "Ubisoft to close Trials studio RedLynx"), never platforms
    alone.
  - A report joins the event it matches best, when it matches at least a third of that event's reports within three
    days. Matching the first report alone split events told differently first; matching any report chained ("Fortnite
    is coming to Linux" joined "Big Walk not coming to Xbox", and the boycott took Fortnite off).
  - Two stories were lost to a wrong join on 14–16 Oct (Rockstar's employment tribunal, joined to "Rockstar's next game
    won't take eight years"; Saturday Night Live's GTA 6 sketch, joined to an Activision executive's "no offense to
    Zelda").
- **The repeat check** (`repeats`). Some reports of one event share no run that says what happened ("Zero Parades, The
  Successor To Disco Elysium, Has Been Confirmed For Switch 2" on 16 Oct; "ZERO PARADES: Director's Cut coming to
  Switch 2 on November 3" on 15 Oct). So a story is not told when PRESS START told one in the 24 hours before whose
  headline shares a naming run with it **and** a kind of act (two releases, two updates, two sets of sales, two
  trailers…) or a platform. Another story of the same game, of another kind, airs: "GTA 6 Launch Trailer…" and "GTA 6
  Barely Makes the Cut for The Game Awards" on one day.
  - **Measured** on 14–16 Oct: it removed eight reports, all eight repeats (Zero Parades, The Blood of Dawnwalker's
    update, Beast of Reincarnation's last updates, Control Resonant's sales, Call of Duty's next sub-series, Peak on
    PS5, the GTA 6 trailer from The Verge, the Ocarina of Time overview trailer). Six repeats remain, told in words
    that share no run: on 16 Oct Steam's achievement sets, Ken Kutaragi on discs, Ancestors on PS5 and Peak's console
    dates; on 14 Oct The Verge's "Epic's new games launcher is 'vibe coded'" (its one capitalised name a maker's); on
    12 Oct Nintendo's "no plans to ditch physical games". It also held back one different story, "The Witcher 3
    Remastered Arrives Ahead of Songs of the Past DLC" a day after "Witcher 3 Expansion Will Be at Gamescom" (one name,
    one kind of act). A looser check, on one shared name, removed seven stories wrongly in 14–16 Oct and was dropped.
- **The report told**: tier 1, then tier 2; within a tier, the report with no evaluative word, then the first filed.
  Siliconera tells an event only when another outlet carries it (§3.1).
  **Tier 3 and tier 4 never tell an event**: a tier 3 report counts as a second outlet for an event a tier 1 or 2 report
  tells.
- **An event one outlet carries airs only from a headline that states an act** (a launch, a date, a delay, a deal, a
  closure, a statement): a feature, a profile, an interview or a preview states none ("The happiest man in gaming hates
  generative AI").
- Measured supply: §7.2.

### 4.13 Pictures

- **The outlet's picture only**, the one it published with the story; through the channel's pixelation
  (`public/js/pixelate.js`: cover crop, its own palette, an ordered dither, `ART_DIRECTION.md` "Story pictures"), so
  publisher art becomes the channel's pixel art.
- **Credit**, on screen whenever the picture is: the credit the feed or the article gives for that picture, else the
  outlet whose picture it is (`server/news.js` `pictureCredit`, the channel's rule). Measured: four outlets name a
  picture's credit in the feed (PC Gamer 94 %, Guardian Games 100 %, Ars Technica 95 %, GamesRadar+ 91 % of items); the
  rest are credited to the outlet, as on every programme.
- **Supply**: 90–100 % of most outlets' items carry a picture; Destructoid, Siliconera and Xbox Wire half, Insider
  Gaming none.
- **Never**: a leak's picture, a picture from an explicit or harm report, a picture borrowed from another event, a
  screenshot of a mature title before 21:00 (§4.3), a picture with a story about a child (§4.4 keeps the story off).

## 5. Shape, running order and segments

### 5.1 The weekday edition

| Segment | Who | What | Budget |
|---|---|---|---|
| STAGE SELECT | Host | Three headlines over their pictures, as three stage tiles on a level-select screen; the ▶ cursor steps to each as it is read (the channel's montage, the programme's skin) | 18 s |
| Title | — | The open (§8.3) | 8 s |
| Greeting | Host, co-host | Both named; the time of day | 8 s |
| **The lead** | Host | 3–5 sentences, with its board (§5.6) | 40 s |
| The context | Host asks, co-host answers | One of the story's own sentences the host has not read: a date ahead, a figure, an attributed quote, what the company said; the host's question fits it ("When does it land?", "How many?", "What are they saying?"). No such sentence, no exchange; never after a serious story | 20 s |
| **The news** | In turn | 3–6 stories, 2–3 sentences each, each with its cartridge or board | 25 s each |
| **PATCH NOTES** | Co-host | 3–5 one-line updates (§5.3) | 35 s |
| **UNLOCKS** | Host | The week's dated releases (§5.4) | 25 s |
| **THE PLAYER COUNT** | Co-host | A game in today's news, playing on Steam right now (§5.7; when the owner turns Steam on) | 15 s |
| **THE REVIEWS** | Host | A game reviewed by two or more outlets this week: each outlet's verdict, quoted (§5.5) | 30 s |
| **ACHIEVEMENT UNLOCKED** | Co-host, then a chat | The day's milestone (§5.6) | 20 s |
| Sign-off | Host | "That's PRESS START…" (a bank of 10; the plain variant after a tribute or a serious last story) | 8 s |

- **Length**: target 6:00–7:00, accept 5:30–7:30 (`targetSeconds [330, 450]`). The budgets with four stories and every
  segment add to 327 s before the director's pauses (about a tenth more: 6:00). Without THE REVIEWS and THE PLAYER
  COUNT, the common case until the owner turns Steam on, they add to 282 s, and the fifth and sixth stories make the
  length. Over: THE PLAYER COUNT, then the context, then the last news story go. **Under 5:00 with every segment and six
  stories, the edition does not air** (§7.1).
- **Segments without material are skipped, never padded**: THE REVIEWS (about three times a week measured), THE PLAYER
  COUNT (Steam off, or no Steam game in the news), ACHIEVEMENT (no milestone).
- **The order moves by the day's material**: a serious lead pushes ACHIEVEMENT to the end and drops the context; a
  release day opens UNLOCKS with OUT TODAY after the lead (§5.2).

### 5.2 The three shapes

| Shape | When | Order |
|---|---|---|
| **WEEKDAY** (default) | Monday to Friday | §5.1 |
| **LAUNCH DAY** | A dated release in UNLOCKS is today and three or more outlets carry it | headlines → title → greeting → the launch as the lead, its cartridge → UNLOCKS (OUT TODAY first) → the news → PATCH NOTES → THE REVIEWS (if reviewed) → ACHIEVEMENT → sign-off |
| **SAVE FILE** (weekends) | Saturday and Sunday | headlines → title → greeting → **THE WEEK IN GAMES** (the week's five most-carried events, one sentence each, from PRESS START's own archive) → the weekend's news (whatever is fresh) → UNLOCKS (the week ahead) → THE REVIEWS (the week's) → ACHIEVEMENT (the week's) → sign-off |

- **Why SAVE FILE**: the outlets read whole over a weekend filed little. On Saturday 10 Oct the twelve complete outlets
  gave 1 would-air event, on Sunday 11 Oct 3 (the platform desks that publish at weekends have short feeds and were not
  read whole that weekend; §7.2 says what is still owed). The week's own archive fills a weekend edition with what the
  programme already checked, as SEVEN DAYS does for the channel.
- **The week in games is never a list of five headlines read in a row.** Each event gets its sentence and its board
  (the cartridge, the ACHIEVEMENT figure, the UNLOCK tile), and the five run in the order they aired, each with its day
  ("On Wednesday…"); a sixth line says what changed since, when a later story did (a date moved, a game launched).
- SAVE FILE retells only what PRESS START aired, in the words it aired (`server/archive.js`), with the day it aired.

### 5.3 PATCH NOTES

- **What**: the day's small changes, one line each: an update, a patch, a DLC, a port, a demo, a delay, a mode or a
  game's end of service, a remaster. 13–15 such events a weekday on the full desk (§7.2).
- **The board**: a changelog headed PATCH 16.10 (the date as a version number), each line prefixed:
  - `+` added (a DLC, a port, a demo, a feature);
  - `~` changed (a delay, a date moved, a price changed by the maker);
  - `−` removed (a delisting, a mode's end, a game's end of service).
  
  Never hardship: a studio's closure, layoffs and strikes are stories (§4.6), never a line.
- **Spoken**: one sentence each, the co-host's, brisk; the line types on as it is read.

### 5.4 UNLOCKS

- **What**: the release dates the stories of the last 30 days stated, the nearest three to five in the next fourteen
  days; OUT TODAY on the day. Read by `tools/play/dates.mjs` from headlines and opening sentences: a day and a month, a
  release verb, the date ahead of the day it was filed. The platforms' blogs count here, and only here (§3.1). A date
  from a tier 3 outlet airs only when another outlet or the maker states it too. Fewer than three dates, no segment.
- **Measured**: 5–9 dated releases filed a weekday when Gematsu is read (15 and 16 Oct). On 16 Oct, with two days of
  Gematsu in hand, the next fourteen days held five dates (three in the next seven), the next 31 days eight (two DLC
  packs dated by tier 3 outlets left out). The desk's 30 days of memory will hold more; the reader misses some forms
  ("climbs its way onto PS5 October 22", "next week"), a step 1 task.
- **The board**: a row of locked tiles, one a date; each unlocks as it is read (the padlock opens, the tile lights in the
  accent): the day, the game, its platforms as stated.
- **A date changed by a later story** (a delay) replaces the earlier one; the board says DELAYED beside the old date for
  a week. A date no story has confirmed in 30 days drops off.

### 5.5 THE REVIEWS

- **What**: one game reviewed by two or more outlets in the last seven days, at most once a week per game. Each
  outlet's verdict as it wrote it (`reviewVerdict`: the headline after "review –"): "an Antarctic odyssey of Nazis and
  Lovecraftian horrors" (Guardian Games), "the least expected Soulslike you'll play" (Rock Paper Shotgun).
- **Whose verdicts**: any outlet's, whatever its tier (§3.1). A verdict is an opinion by definition and airs as one, in
  quotation marks with the outlet's name; the tiers decide who tells the news, not whose opinion may be quoted as
  opinion.
- **Rules**:
  - quotation marks and the outlet's name on every verdict, said and shown ("The Guardian calls it…");
  - every review the desk has of that game in the week, not a chosen few, up to four; never "the critics agree";
  - a score only when the outlet's own headline prints it;
  - a review in progress is not a verdict ("review-in-progress: A campaign you shouldn't skip");
  - never a reviewer's opinion of a person;
  - a verdict that is explicit (§4.3) is left out, and with it the segment if fewer than two remain.
- **Measured** (12–16 Oct, the archives read in pages included): three games carried two or more outlets' verdicts:
  Valor Mortis on 12 Oct (Rock Paper Shotgun, Destructoid, Shacknews), Castlevania: Belmont's Curse on 13 Oct (Rock
  Paper Shotgun, Guardian Games, Shacknews; RPG Site's headline gives no verdict), Penguin Colony on 16 Oct (Rock Paper
  Shotgun, Guardian Games). Kotaku's ("The Kotaku Review"), RPG Site's and IGN's review headlines carry no verdict, and
  Siliconera's ("Review: Castlevania: Belmont's Curse Is an Uneven Return") a form `reviewVerdict` does not read yet (a
  step 1 task). So THE REVIEWS airs about three times a week, once per game.

### 5.6 The boards and the ACHIEVEMENT

- **The lead's and the stories' boards**, the strongest each has, never the same type twice in a row when another exists:
  - the **cartridge** (§8.5), for any game named;
  - **UNLOCK**, a single locked tile, for a story whose news is a date;
  - **WHAT WE KNOW** (the network's board), for serious and legal stories;
  - **THE PLAYER COUNT** (§5.7), for a Steam game in the news;
  - the **TRIBUTE** card (§4.5).
- **ACHIEVEMENT UNLOCKED**: the day's milestone as a toast: a trophy icon, ACHIEVEMENT UNLOCKED in micro type, the
  figure and its label as the source states them ("1 MILLION COPIES · CONTROL RESONANT"). A milestone is a figure crossed:
  sales, players, downloads, a record, an anniversary (3–5 a weekday). Never hardship, never a tribute, never a figure the
  source hedges. The chat after it is the edition's lightest moment, about the figure and the presenters themselves.

### 5.7 THE PLAYER COUNT (when the owner turns Steam on)

- **What**: how many people are playing a game in today's news on Steam right now, read at prepare time
  (`ISteamUserStats/GetNumberOfCurrentPlayers`, §6.1), with the time of the reading ("AT 17:42"). On a quiet game, a
  HEAD TO HEAD of two games in the news.
- **The board**: big pixel digits counting up to the figure; STEAM · PLAYING NOW · AT 17:42 under it; the source line.
- **Never** a rank among all games (that needs a chart Steam does not document, §6.2), never "the most played", never a
  peak. The game is matched to its Steam app only by a hand-checked table of the games the desk follows (about 60 at the
  start, kept in the desk's config).

### 5.8 Plain words for a viewer who doesn't play

- **The cartridge** says what a game is (§8.5).
- **A games word is said in plain words the first time it airs in an edition**, by a fixed list of about 25 terms the
  writers know: "a demo, a free first taste of the game", "downloadable content, extra pieces sold after a game's
  launch", "early access, a game sold while it is still being made", "a port, a game brought to another machine", "a
  remaster, an old game rebuilt for new machines", "a live service game, one that keeps adding content for years". The
  words are ours, fixed and general (never a claim about the story), as IN PLAIN ENGLISH's are on TECH BYTES; here they
  are a clause inside the sentence, not a segment or a card.
- **A platform is named in full** the first time (the Nintendo Switch 2, the PlayStation 5).

## 6. Structured data (each checked live)

### 6.1 Used (documented, no key needed; the owner registers a free key)

| Source | Reachable | Terms | How stale | Used for |
|---|---|---|---|---|
| Steam Web API `ISteamUserStats/GetNumberOfCurrentPlayers` | 200 on every reading | Steam Web API Terms of Use (July 2010, read 16 Oct): a licence to show "Steam Data" to end users through an Application named at API-key sign-up; no endorsement implied; "as is"; 100,000 calls a day | Live, 3–6 minutes behind: Counter-Strike 2 read 1,174,551 → 1,169,579 → 1,162,476 → 1,162,158 → 1,172,996 across 88 minutes | THE PLAYER COUNT |
| Steam Web API `ISteamNews/GetNewsForApp` | 200 | As above | The developer's own posts, dated | A PATCH NOTES line's confirmation ("Counter-Strike 2 Update"), credited STEAM NEWS |

- **The owner decides**: the endpoints answer without a key, but the licence is written for a registered Application.
  The design asks the owner to register a free Steam Web API key naming GLOBIT 24 (`STEAM_API_KEY`) before THE PLAYER
  COUNT airs. Until then the segment is off, and the programme loses nothing else.
- Credit on screen: SOURCE: STEAM, never Valve's logo.

### 6.2 Reachable, checked, not used

| Source | Why not |
|---|---|
| Steam `ISteamChartsService` (most played, concurrent top 100) | Not in Steam's public Web API documentation (the documentation's page for it opens the home page, 16 Oct): undocumented, like ESPN's scoreboards for FULL TIME. Its "most played" rollup was 40–41 hours old on every reading |
| Steam `GetTopReleasesPages` | Stale: its newest page is "Top Releases of February 2025" |
| Steam store `appdetails`, `appreviews`, `featuredcategories` (release dates, prices, Metacritic, user-review summaries, top sellers) | Store endpoints, not the Web API; no licence for third-party use. Top sellers lists hardware (Steam Deck) and duplicates editions; "specials" are deals |
| OpenCritic | Needs a RapidAPI key (HTTP 400 "API key is required") |
| RAWG, IGDB, Twitch, MobyGames, RetroAchievements | Need a key or an OAuth token (401) |
| Metacritic, OpenCritic, Official Charts, the PlayStation and Nintendo stores | Web pages only: no API, and their terms forbid scraping |
| Wikidata and Wikipedia (an ON THIS DAY in games) | HTTP 429 (rate limited) and SPARQL time-outs from this environment on 16 Oct; a release's day differs by region and Wikidata often omits the region. Not designed until it is reachable and the region rule is written |
| speedrun.com API | Reachable, but its terms page is behind a challenge (403): terms unverified. Runners are private people, some minors |
| Epic's free-games list, GOG's catalogue | Promotion |
| SteamSpy | Estimates, not counts |
| Games Done Quick tracker | Seasonal (January and July marathons); a candidate for a later round |

### 6.3 Charts from the stories

Charts reported in a story are facts with a source ("Japanese Charts: Kingdom Hearts Collection Grabs The Top Spot",
Nintendo Life, Famitsu's sales). The desk tells them as stories, credited to the chart's compiler as the story names it;
never a chart the story does not print.

## 7. Data robustness and the schedule

### 7.1 What airs

| Situation | What airs |
|---|---|
| A weekday with eight or more fresh would-air events since the last edition | The WEEKDAY or LAUNCH DAY shape |
| Fewer than eight fresh events, or under 40 % of the edition's stories new since its last edition | The edition does not air; the station plays the next programme |
| A weekend | SAVE FILE, with at least three of the week's events and one fresh; otherwise it does not air |
| Fewer than six outlets answered in the last six hours | The edition does not air (a desk of two outlets is two outlets' opinions of the day) |
| An outlet's newest item is more than 48 hours old (it stopped, or its feed broke) | It counts as down |
| Steam down, slow (over 3 s) or its reading older than 15 minutes at air | No PLAYER COUNT; nothing else changes |
| No game reviewed by two outlets this week | No REVIEWS |
| Fewer than three dated releases in the next fourteen days | No UNLOCKS (measured on 16 Oct: five) |
| An edition estimated under 5:00 with every segment filled | It does not air |
| A grave breaking story on the channel in the last hour (`severity` 3) | The edition does not air: a games magazine does not follow a tragedy |

### 7.2 Supply (measured)

- **Weekdays** (rules v10, events v7, the repeat check; `tools/play/supply.mjs`): 15 Oct, 32 would-air events (20
  outlets read whole that day, the rest in part); 16 Oct, 40 by 20:06 London. PATCH NOTES lines 13–19 a day,
  ACHIEVEMENT milestones 2–3, dated releases filed 5–8, serious stories 0–5. On 12–14 Oct, before the short feeds were
  read, 8–20.
- **Editions**: by the hour each event was first filed (London), an edition at 12:00 found 6 fresh events on 15 Oct (it
  would not have aired) and 18 on 16 Oct; at 17:00, 17 and 14; at 21:00, 10 on 15 Oct and 9 by 20:06 on 16 Oct. On 14
  Oct, with only the long feeds read that morning, 2, 8 and 8. Mornings are thin: before 09:00 London the outlets file
  little. The full desk is what feeds three editions, and the noon edition is the one that sometimes does not air.
- **Weekends** (measured, partly): with 12 outlets read whole over 10–11 Oct, six of them tier 1–2 (Eurogamer,
  GamesIndustry.biz, Game Developer, Siliconera, Guardian Games, Game Informer), Saturday gave one would-air event and
  Sunday three; Saturday's other 27 usable reports were all tier 3. The platform desks' weekends (Nintendo Life, Push
  Square, Pure Xbox, VGC, Gematsu, IGN) are unread: their feeds hold a day or two, and VGC's and Gematsu's older pages
  answer 403. SAVE FILE is built for that thinness (§5.2); the step 1 gate reads a whole weekend.

### 7.3 Schedule

- **Three editions a weekday**, about 12:00, 17:00 and 21:00 London: a daypart skips it from 23:00 to 11:00
  (`{ "from": 23, "to": 11, "skip": ["press-start"] }` in `config/channel.json` `clock.dayparts`) and `minGapHours: 4`
  spaces the editions. **At weekends, SAVE FILE twice**, about 12:00 and 18:00.
- **The slot**: after the second NEWS IN 60 and before SEVEN DAYS: … WORLD NOW → MONEY MINUTE → NEWS IN 60 → **PRESS
  START** → SEVEN DAYS. Never beside TECH BYTES (its neighbour on the border, §3.3).
- Never at :00 or :30 (NEWS IN 60 is pinned); 6–7 minutes fits between the pins.
- **A draft** (`"drafts"` in `config/channel.json`) until build step 7 passes and the owner approves the faces, the voices
  and the title.

## 8. Look and sound

### 8.1 The accent: lemon

- **Lemon `#fee761`**, ENDESGA 32's own, added to the palette by name only (`P.lemon`, never a quantizer's choice:
  `QUANT` unchanged, as FULL TIME's greens were). Dark ink type on it (14.4:1 against `P.black`).
- **Distinct from every accent** (CIEDE2000, `tools/play/accent.mjs`): nearest NEWS IN 60's yellow at 19.1 and MONEY
  MINUTE's green at 26.2. That is further than three pairs already on air: WORLD NOW and SEVEN DAYS (13.0), COSMOS and PAY
  ATTENTION (17.9), NEWS IN 60 and FULL TIME (18.1).
- **Told apart from NEWS IN 60 by more than hue**: lemon is always paired with ink and an arrow cursor (▶), the
  programme's device. NEWS IN 60's yellow is a dial and a ring on black. The two never share a board shape.
- **The rejected candidates**:
  - mid green (19.8 from MONEY MINUTE): FULL TIME's pitch;
  - navy and dark green: 2.1:1 and 2.3:1 against `P.black`, so they vanish on a dark set;
  - crimson (4.6 from WORLD NOW), burnt orange (7.0 from FULL TIME) and rust (10.2 from WORLD NOW): too close.

### 8.2 The set: the arcade after closing

- **A pixel-art arcade with the lights down**, distinct from every studio on the channel: the glass rooms over a city
  (WORLD NOW, SEVEN DAYS), the product studio (TECH BYTES), the observatory (COSMOS), the game-show stage (PAY ATTENTION),
  the pitch (FULL TIME).
- **The room**:
  - two rows of cabinets recede either side behind the presenters, their screens dimmed to still, abstract idle frames:
    a maze, blocks, a starfield, never a real game, title or logo;
  - a marquee strip over each row, unlit but for one slow sweep of light every 24 seconds, the set's one ambient effect
    (`ART_DIRECTION.md` motion budget);
  - the carpet is the classic arcade pattern: small flat shapes (3–5 px) in two adjacent ramp steps on navy, no dither
    and no noise, seen only below the desk line in the wide, so it never competes with a face;
  - the cabinets' screens stay at or under L* 30 and outside the head zones; their light is the side walls' cool spill;
  - the desk is a long control panel in black with inlaid buttons and two joysticks, its front edge one lemon line;
  - the main screen is the network's centred screen in a CRT cabinet's bezel: the story's picture, or the idle title
    screen (the emblem and PRESS START, still).
- **Light**: warm white key on the presenters; the cabinets' screens give a cool spill at most 10 % on the side walls;
  the faces stay the brightest, warmest pixels (`ART_DIRECTION.md`).
- **The time of day does not change the room**: an arcade after closing is the same at noon and at nine.

### 8.3 The open (≈8 s, 128 BPM)

- black;
- a CRT powers on, its white line opening to the frame;
- the title screen draws in two beats: the emblem (a cartridge with a ▶ on its label), then PRESS START blinking twice
  on the beat;
- the cursor presses: a start chime;
- the picture blooms (a soft brighten over a quarter of a second, never a full-field white flash) and the camera pulls
  back from the main screen into the lit arcade;
- the plate, on the hit at about 7.5 s.

No fireworks, no particles, no stacked text moves (`ART_DIRECTION.md`). The flat fallback is the title screen alone.

### 8.4 Music

- **The bed**: 128 BPM, the channel's music engine with a chip palette (square and triangle leads, a noise-channel kit)
  over a warm bass and a soft pad, so it is music and not a ringtone. Moments: open, news, patch, unlocks, count,
  reviews, achievement, signoff.
- **Stings**:
  - PATCH NOTES: a soft typing blip on each line;
  - UNLOCKS: a two-note rising chime as each tile opens;
  - ACHIEVEMENT: the toast's chime;
  - THE PLAYER COUNT: digits ticking under the voice, never over it.
- **The rules**: no music under a serious story, a tribute or the segment after; no laughter and no applause; every
  sting ducked under the voice.

### 8.5 The boards

| Board | What it shows | Notes |
|---|---|---|
| **STAGE SELECT** | The three headlines' pictures as stage tiles (1-1, 1-2, 1-3), the ▶ cursor stepping to each as it is read | The channel's montage with the programme's skin. Not a loading bar: on a stream a filling bar reads as buffering |
| **The cartridge** | A pixel cartridge, its label holding the game's name, its maker and its platforms as the story states them, and the date if stated | Every game named at its first mention; the non-player's way in. A field not stated is left off |
| **PATCH NOTES** | A changelog: PATCH 16.10, lines with `+`, `~`, `−` | Types on line by line |
| **UNLOCKS** | A row of locked tiles, each opening as read | OUT TODAY in the accent |
| **THE PLAYER COUNT** | Pixel digits counting up, STEAM · PLAYING NOW · AT 17:42 | Never a rank |
| **THE REVIEWS** | Up to four tiles, each an outlet's name and its verdict in quotation marks | Never a score not printed |
| **ACHIEVEMENT UNLOCKED** | A toast: a trophy icon, the figure and its label | Rises from the strap's top edge at the right, as on a console, and stays above the strap and the captions |
| **WHAT WE KNOW** | The network's board | Serious and legal stories |
| **TRIBUTE** | The person's name and role on ink, no game art | §4.5 |

- **Type and safety**: the network's bitmap fonts; every board clear of the top row and the captions; a title that does
  not fit the cartridge's label on two lines is cut at a word with a tested rule, never mid-word.
- **Strap tags**: NEWS, LAUNCH, DELAY, UPDATE, INDUSTRY (serious), LAW, TRIBUTE, REVIEWS, CHARTS, from the story's kind.

## 9. Repertoire: never the same programme twice

### 9.1 What varies

- **The shapes**: WEEKDAY, LAUNCH DAY, SAVE FILE (§5.2).
- **The segments that come and go**: THE REVIEWS (two or three editions a week), THE PLAYER COUNT (Steam on, a Steam
  game in the news), ACHIEVEMENT (a milestone), the context (a story's own sentence of a kind).
- **The context's four kinds**: a date ahead, a figure, an attributed quote, what the company said; never the same kind
  twice running.
- **The boards**: the strongest a story has, never the same type twice in a row (§5.6).
- **The lines**: every spoken frame has a bank, picked by hash and the station's recent-lines memory (none again within
  six hours station-wide): greetings (10), headline links (8), the host's questions (12 for each kind), PATCH NOTES
  openers (8), UNLOCKS openers (8), REVIEWS frames (8), ACHIEVEMENT openers (8), the chats after the ACHIEVEMENT (12 each
  presenter), the generations' teases (12 each), the memories (20 each, none again within seven days), sign-offs (10,
  and 4 plain ones).
- **No catchphrase**; the genre's own words ("patch", "unlock", "achievement") as banks of variants.

### 9.2 A week (the evening edition of each day, from the measured material of 12–16 Oct)

Monday to Friday are built from the events the measurement would air by 21:00 London (`tools/play/measure.mjs`, rules
v10, events v7); the weekend from the shape. Before 15 Oct only the long feeds had been read: on that material Monday
and Tuesday never reach the eight fresh events an edition needs (§7.1), and Wednesday only from 17:00. Those rows show
the shape with the stories the long feeds had; a full desk would add the platform desks' (15–16 Oct: 32 and 37
would-air events).

| Day | Shape | Lead (an event the desk would air) | Segments | What differs |
|---|---|---|---|---|
| Mon 12 | WEEKDAY | Dragon Quest's Yuji Horii releases a game he says he made with AI in 30 minutes (GamesIndustry.biz; three outlets). Epic's "AI first" plan, reported and hedged, stays off (§4.2) | PATCH NOTES (DMZ arrives early in Modern Warfare 4; P.T. comes to PC), ACHIEVEMENT (Steam's second concurrent-user record of the year), REVIEWS (Valor Mortis: Rock Paper Shotgun, Destructoid) | The context is a quote; no UNLOCKS (no date in fourteen days measured). Nintendo's "no plans to ditch physical games" would air twice, from two outlets (§4.12's residue) |
| Tue 13 | WEEKDAY | Xbox announces Xbox Labs (GamesIndustry.biz; six outlets) | PATCH NOTES (Sifu on Android and iOS; The Blood of Dawnwalker's soundtrack on streaming services), the news (Outcast Tales dated for 26 October; Square Enix Collective publishes Vaultbreakers; Xbox's indie showcase), REVIEWS (Castlevania: Belmont's Curse: Guardian Games, Rock Paper Shotgun, Shacknews) | The context is what the company said |
| Wed 14 | WEEKDAY, serious | Ubisoft closes RedLynx and cuts jobs in Singapore (GamesIndustry.biz; five outlets) | TRIBUTE (Richard "Levelord" Gray) among the news, Funcom's layoffs, PATCH NOTES after them with no bed (Gears of War: E-Day's first major update; Guild Wars 2's add-ons bundled) | A serious edition: no context, no chat after the lead or the tribute, the plain sign-off |
| Thu 15 | WEEKDAY, the big story | The GTA 6 launch trailer, told from a clean report (Push Square; nine outlets), on its cartridge before 21:00 | PATCH NOTES (Fire Emblem: Fortune's Weave's DLC wave; Monster Hunter Wilds's demo on Switch 2), ACHIEVEMENT (Control Resonant's million copies) | The framed reports of the trailer and Big Walk's boycott story (twelve outlets) stay off; The Game Awards' eligibility is another GTA 6 story, not a repeat |
| Fri 16 | WEEKDAY | Nintendo's new trailers for the Ocarina of Time remake show Dark Link (Polygon; six outlets) | UNLOCKS (Dementium II 20 Oct; Vixen 357 and Modern Warfare 4 23 Oct; Brave Dungeon 24 Oct; Outcast Tales 26 Oct), PATCH NOTES (The Blood of Dawnwalker 1.1), REVIEWS (Penguin Colony: Guardian Games, Rock Paper Shotgun) | UNLOCKS's first airing; the context is a date ahead |
| Sat 17 | SAVE FILE | The week in games: its five most-carried events | UNLOCKS (the fortnight ahead), the week's ACHIEVEMENT | A different shape and pace |
| Sun 18 | SAVE FILE | The weekend's own news first if any, then the week | UNLOCKS, ACHIEVEMENT | Never Saturday's order or lines |

LAUNCH DAY would first come on Friday 23 Oct, Modern Warfare 4's date, if three outlets carry the launch.

### 9.3 Where it overlaps, and why that is acceptable

- **The context after the lead** is what every two-hander does (TECH BYTES's THE CATCH, FULL TIME's THE BREAKDOWN). Here
  it is unbranded, short and built on four kinds of its own.
- **PATCH NOTES is a round-up**, as QUICK BYTES, IN BRIEF and AROUND THE GROUNDS are. It is a different device: a
  changelog with typed lines and `+ ~ −` meaning, carrying only updates.
- **ACHIEVEMENT is a figure**, as THE NUMBER and NUMBER OF THE DAY are. It is a threshold crossed, shown as a toast, and
  it closes the edition as its lightest moment.
- **UNLOCKS is a calendar**, as FULL TIME's COMING UP is: the same function in a different subject and look.
- **No quiz**: nothing of PAY ATTENTION's rounds (no pixelating picture, no letter tiles, no pins, no lock-ins). A
  "guess the game" round was designed and dropped in the critique's first round for that reason.

## 10. Build plan and gates

Every step is a draft until step 7 passes; each step's gate is a hostile critique above 9.7 (`QUALITY_LOOP.md`, the
round's score its lowest category).

1. **The games desk**: the feeds (category `games`, the tiers, the archives in pages), the standards
   (`tools/play/standards.mjs` made the server's), the games event test, the repeat check and the selection (§4.12),
   the release-date reader, the review verdicts (Siliconera's "Review: X Is Y" form), the time words, the TECH BYTES
   border (§3.3) and the harm hand-off (§4.4). *Gate*:
   - three real days and one whole weekend read every 20 minutes;
   - every report the desk would air checked by hand: none from a kept-off kind, none in an outlet's voice, every date
     and figure as the source states it (100 % after fixes);
   - then a fourth day the fixes never saw: at least 97 % pass by hand, every miss logged and fixed. The word lists
     alone have not reached that on held-out copy (§4.10: 76–89 %), so step 1 measures them together with a second
     reading: the writer's prompt carries the standards of §4, and the writer may decline a story it reads as
     merchandise, a rumour, a private person's words or the outlet's column, with its reason, which the validator
     logs. The gate counts what the two let through. Until they pass it together, the programme stays a draft;
   - TECH BYTES's own critique round for the border.
2. **The writers**: both writers write the programme (the shapes, the segments, the banks, the context's kinds, the
   serious and tribute rules, the evaluative-word filter in the validator). *Gate*: twenty editions from the step 1
   days, read in full; no opinion stated as fact, no fault left.
3. **The graphics**: STAGE SELECT, the cartridge, PATCH NOTES, UNLOCKS, THE PLAYER COUNT, THE REVIEWS, the ACHIEVEMENT
   toast, TRIBUTE, the accent. *Gate*: the lab page at 1x and 4x, every text inside its board every 0.2 s, a hostile
   critique above 9.7.
4. **The director and the pace**: the shapes' shots, PATCH NOTES typed to the voice, the tiles unlocking on the words,
   the count's digits under the voice, a pace profile in `public/js/pace.js`. *Gate*: critique above 9.7 on recorded
   timings.
5. **The set, the open, the theme, the bed and the stings.** *Gate*: renders and recordings critiqued above 9.7.
6. **The cast**: the three candidates for each presenter (faces in both renderers, voices), the owner's choice of pair
   and title. *Gate*: the character rubric above 9.7.
7. **On air**: two recorded editions with sound, a weekday and a SAVE FILE, on real feeds. *Gate*: the whole programme
   critiqued above 9.7 (`docs/roadmap/critique/press-start.md`).
   - Steam's PLAYER COUNT joins only when the owner has registered the key (§6.1); its own critique round then.

## 11. For the owner (in plain words)

- **Cast**: two new presenters (recommended), three looks and three voices each to choose from; or Max Circuit hosting
  with one new co-host (§2.2 says what that costs).
- **Title**: PRESS START (recommended), PLAY or HIGH SCORE.
- **Steam**: a free Steam key in the channel's name, if the owner wants the live player count (§6.1).
- **TECH BYTES**: games stories move to the new programme; TECH BYTES keeps the technology ones (§3.3).
- **Siliconera**: it tells only stories another outlet also carries; alone, it filed toys and cafés as often as games
  news (§3.1).
- **Whether to go on**: the design scored 7.5, not 9.7. The automatic desk lets through about one wrong story in five to
  seven on copy it has not seen. The next step would test a second check by the writer before anything is built (§10).
