# FULL TIME — style bible (design passed, round 5: 9.75)

The day in sport on GLOBIT 24. Owner, 13 Oct: new programmes, planned systematically, sport first
(`docs/roadmap/NEW_PROGRAMMES.md`). Programmes must entertain, not only inform. This file builds on `docs/ART_DIRECTION.md`
and `docs/programmes/world-now.md` and states only the differences. The design's critique rounds are in
`docs/roadmap/critique/full-time-design.md`.

## 1. The idea in one paragraph

Seven minutes that tell a viewer who does not follow every league what happened in sport today, and give a fan the
results with a rhythm of their own. A presenter who reads with pace and a former international who explains what a
result *means* — the table, the record, the streak, what comes next — from the facts, never from opinion. They sit on a
platform at the corner of a floodlit pitch. Results land on the stadium's scoreboard; the day's moment gets its own
spot; the week ahead is a calendar; the managers' words come from the press-conference room. Nothing is said that the
sources do not say, and nothing a viewer sees is a guess.

## 2. Cast

| | Role | Character | On air |
|---|---|---|---|
| **Kai Sprite** | Presenter (reader) | Quick and warm, a sports reporter who became an anchor: knows when a result is a story, enjoys a number, never shouts | Reads the lead, the results, most stories; asks Rosa the question viewers are asking |
| **Rosa Rally** | Analyst (co-presenter) | A former international midfielder (fictional): calm, exact, dry. Explains why a result matters — the table, a record, a run, what comes next | THE BREAKDOWN; the number and the moment of the day; some stories; the chats |

- **Nobody on FULL TIME judges a real person** (§3.4): no "brilliant", "poor", "should have", "the referee got it wrong".
  What Rosa adds is context the source states and the words of the people involved, attributed ("Lampard says they are
  keeping their feet on the ground").
- **Rosa's own past is fictional and touches no real event**: no real club, match, stadium or player. A bank of 12 such
  memories ("I once missed a penalty in a cup final. Nobody here mentions it.") and 12 of her needles at Kai's own
  (fictional) sporting past ("Kai played in goal once. The ball still has not forgiven him." / "It was a very fast
  ball."), none again within six hours station-wide, one an edition: in the chat after the moment of the day, or, on an
  edition without a moment, before the sign-off (Kai asks for a memory: "One from your career before we finish, Rosa?";
  a needle she starts herself), never after a grave or a serious story (a misconduct charge, a court, a ban, a death).
- **Seated at the desk**: the channel's seated poses and gestures, no new walk or standing cycle.
- **Looks** (v2 cast; each unlike every face on air, checked against the list below):
  - **Kai**: a clean-shaven head and a full, neatly squared black beard; warm olive skin; a navy **bomber jacket** with an
    orange ribbed collar and cuffs, zipped half-open over a white crew tee. Built on Max's body with a head and an outfit
    of his own (the correspondents' method: proven parts, a design of their own). No one on air wears a bomber, and his
    silhouette (a smooth dome over a squared beard, a short ribbed collar) is unlike Max's quiff over a blazer.
  - **Rosa**: a high ponytail in near-black with a lighter brown lift where the light catches it; light tan skin; a
    charcoal zip track top with an orange stripe down each sleeve over a white tee; small gold hoops. Built on Lola's body
    with new hair drawers and a new outfit.
  - Checked against: Paco (grey side part, moustache), Lola (auburn bob), Max (espresso quiff, close beard), Ada
    (shoulder-length straight, glasses), Nova (coily, full), Penny (honey chignon), Sam (short textured crop), UNIT-8,
    Rhea (low black chignon), Vic (close wave crop with a line-up), Mika (black bob, blunt fringe), the experts (receding
    grey; silver pixie; high twists; bald with white tufts; magenta undercut; braids; red curls; chestnut waves). No one
    on air has a shaved head with a full beard, nor a ponytail. The guests' look generator (IN THEIR WORDS) adds Kai and
    Rosa to the looks it must not repeat (it has a `bald` and a `ponytail` style).
  - **Built (cast step)**: both renderers draw them, candidate A on air (critique
    `docs/roadmap/critique/full-time-cast.md`, 9.75). v2: `public/js/v2/canvas25d/cast/full-time.js` (the six candidate
    looks, Kai on Max's body, Rosa on Lola's), `cast/hair-sport.js` (hair and beard drawers of their own),
    `cast/wardrobe-sport.js` (the zip tops; the sleeve stripe through character.js's `sleeves` hook); the old renderer:
    `anchors.js` and `scenes/portraits.js`. One difference from the design above: Kai's bomber is **midnight navy** (an
    ink body with a navy sheen over the key-side chest), because a plain navy body measured as a recoloured twin of Lola's
    blazer. The guests' twin guard knows both (a bald, bearded guest's clipped sides go grey).
  - **Candidates for the owner** (sheets: `public/lab/full-time-cast.html`, `?sheet=candidates | pairs | onair | legacy`):
    Kai **A** the bomber (above); **B** a black top knot with faded sides, clean-shaven, brown skin, a rust quarter-zip
    knit over a white tee; **C** ear-length espresso curtains from a middle part, clean-shaven, light skin, a near-black
    suit with an open white collar. Rosa **A** the ponytail (above); **B** cornrows straight back to the nape, deep brown
    skin, a cream roll-neck, gold studs; **C** shoulder-length dark brown curls under a thin orange headband, olive skin,
    a royal blue track top with a white stripe down each sleeve. **To switch** (both renderers): one letter per presenter
    in `public/js/full-time-looks.js`; a candidate other than A gets its own critique round before it airs.
- **Voices**: two new blends unlike the 19 on air.
- **The owner approves both faces and both voices** (A/B looks, A/B voices, as for the experts) before they are final;
  until then the programme airs with the first choice and the LISTA asks for the decision.

## 3. Editorial: what may air

### 3.1 Sources and the desk

- Five sport feeds, category `sport` (`config/feeds.json`): BBC Sport, Guardian Sport, Sky Sports, ESPN, France 24 Sport.
  No other programme takes the category.
- **A story's sport** comes from its link first (`/sport/football/`, `/cricket/`, `/nfl/story/`, `/formula1/`: every sport
  feed but the Guardian's puts it there, measured 13 Oct), then from its words (competitions, positions, events). The
  sport drives the strap's tag, the balance rules, the scoreline reader and the transitions.
- **Women's sport** is known from the link (ESPN's `/wnba/`, `/womens-college-basketball/`, BBC's `/womens-football/`…),
  "women's" in the headline or summary, or a women's competition or team by name (WSL, NWSL, WNBA, Women's World Cup,
  Women's Super League, Women's Six Nations, Lionesses, Matildas, Red Roses…).
- **Never airs** (the desk drops it, by link, title and summary):
  - gossip columns, "the papers", transfer rumours ("eye", "linked with", "interested in", "in talks" without a club
    statement): rumour reported by other papers is not ours to repeat;
  - quiz and game promos ("Who am I? Plus today's other quizzes"), fantasy tips, predictions, odds, betting, tips;
  - live pages, scorecards, minute-by-minute blogs and "as it happened" (they go stale on air);
  - columns and opinion (a byline after a bar, "comment", "verdict"), Q&As, "talking points", "team of the week", player
    ratings, podcasts, video-only pages (BBC's `/videos/`, Sky's `/watch/video/`, France 24's `/tv-shows/`: 40 of the 208
    items on 13 Oct), picture galleries, and evergreen pages dated years ago.
- **Grave sport stories** (deaths, abuse, assault, racism, serious injury) get the channel's grave treatment: Kai reads
  them plainly; no chat after, no music under them or in the segment after; never the moment of the day; never put to
  Rosa; never a scoreline crowd swell. Court cases: what the court or the club said, never comment.

### 3.2 Balance (not a Premier League show)

- The lead is the desk's strongest sport story (most outlets on the same event, then freshness), unless it led FULL TIME
  in the last three hours with nothing new since: then the next.
- Across the edition (results aside): **football at most half the stories**, **one club in at most two stories** (a club
  is a team within one sport: a scoreline's team, or a name in two headlines of the same sport; England's cricket and
  football sides are two clubs), **any other sport at most a quarter of the stories** (three of twelve: four rugby league
  stories in a row on a World Cup squad day were one story told four times), **at least three sports** when the desk has
  them, and **at least one
  women's sport story** when the desk has one from the last 24 hours with a picture and two sentences of its own (never a
  one-line brief to fill the rule).
- An edition airs at least 40 % stories its previous edition did not.

### 3.3 Time words

Sport copy is full of "tonight", "last night", "on Sunday". Before a story's words are used, its time words are
re-anchored from the day it was published to the day it airs (channel time, Europe/London):

| Source says (published Monday) | Airs Monday | Airs Tuesday |
|---|---|---|
| tonight / this evening | tonight | on Monday night |
| today / this afternoon | today | on Monday |
| last night | last night | on Sunday night |
| yesterday | yesterday | on Sunday |
| tomorrow | tomorrow | today |
| on Tuesday (an event ahead) | on Tuesday | today |
| on Tuesday (an event ahead), airing Wednesday | — | dropped |

- A sentence whose time word cannot be re-anchored cleanly ("tonight's game", possessives, "later today") is dropped,
  not guessed.
- **A step ahead whose day has passed is dropped**: "Wales host Albania on Tuesday" read on Wednesday is a game that has
  been played, and the channel does not know the result.
- A story left with fewer than two sentences is not used.

### 3.4 No judgement of a real person, from anyone

The outlets' copy praises and blames ("A brilliant goal from Bruno Guimaraes", "a stunning 3-1 win", "a woeful
display"). Read by Kai or Rosa without attribution, a journalist's verdict on a player becomes the channel's. So, in every
FULL TIME text, from either writer:

- **An evaluative word before a sporting noun goes**: brilliant, stunning, superb, sublime, sensational, magnificent,
  majestic, wonderful, fantastic, dazzling, outstanding, world-class, clinical, woeful, dismal, abject, shambolic, awful,
  dreadful, poor, sloppy, lacklustre, embarrassing, pivotal (before goal, strike, finish, header, save, catch, effort,
  display, performance, win, victory, defeat, comeback, run, show). "A brilliant goal from Bruno Guimaraes helps Arsenal…"
  airs as "A goal from Bruno Guimaraes helps Arsenal…".
- **A sentence that judges a person outright is dropped** ("Caicedo was outstanding", "the referee got it wrong", "he
  deserved…"), and so is one that judges a team by name ("A wasteful Newcastle lost…"), compares ("was even better"),
  names a verdict ("their profligacy", "a nightmare start", "a fine evening for Lampard's side") or puts it after the verb
  ("he played poorly"). **An adverb of praise or blame before an act goes** ("Mfuni superbly added a fourth" airs as
  "Mfuni added a fourth").
- **Inside a quotation, attributed, the words stay** (they are that person's, and the listener hears whose).
- Words about a result, not a person, stay: "a 4-1 win", "an emphatic victory", "a thumping 4-1 home win" (the result is
  a fact; the outlet's emphasis on it judges no one).
- The validator applies the same check to the AI writer's copy, Rosa's answers included.

### 3.4b How the writing is built (step 2)

FULL TIME has no writer of its own: the channel's two writers (the AI writer and the fallback writer) write it between two
stages of its own, in `server/producer.js`:

- **`sport-desk`, before the writer** (`server/sport/prepare.js`): every story made ready (§3.3, §3.4; promotions, reader
  questions, crossheads run into a sentence, a sentence that leaned on one that went, a count that points back, a person
  with two first names in one story, a tangent about another sport all go; a long two-clause sentence is told as two; a
  one-line standfirst is filled out from the article); a story whose headline and copy name different results is not told;
  then the balance (§3.2), whose first stories are the edition and the rest the pool for SCORE CENTRE and COMING UP.
- **`sport`, after the validator** (`server/sport/shape.js`): the shape for the day and the hour (§4), whichever writer
  wrote: the same event's stories told together, sports in groups, who reads what, hand-overs, transitions, signposts,
  SCORE CENTRE, COMING UP, the greeting, Rosa's hello, the memory, the sign-off, the straps and the intro's headlines.

### 3.5 Scorelines: only what can be read with certainty

A scoreline (`server/sport/scores.js`) is read from one sentence of the source only when all of these hold:

1. **A sport with one final score**: football, rugby union and league, American football, basketball, ice hockey,
   handball, baseball. Never cricket (runs and wickets), tennis (sets), golf, F1, cycling, athletics or boxing.
2. **A finished result**: a result verb or noun from the table below. Never with "lead", "led", "trail", "half-time", "at
   the break", "aggregate", "series", "going into", "need", "would", "could".
3. **Both teams in that sentence**, named (one to four capitalised words; a possessive's "'s" comes off; never a
   pronoun, a nickname with an article such as "Les Bleus" or "La Roja", a competition, a day or a person who led a team
   to the win: "Allen leads Bills to…" gives the Bills).
4. **The numbers agree with the verb**: a win → more; a draw → equal; a loss → fewer.

Forms measured on the 55 sentences with "x-y" in the 13 Oct feeds, and the past tense each result line uses:

| Source's form | Result line (SCORE CENTRE) |
|---|---|
| A beat/beats B 2-1 | A beat B, two one |
| A thrash/stun/edge/crush/rout/hammer/down/topple B 4-1 | A thrashed / stunned / edged / crushed / routed / hammered / downed / toppled B, four one |
| A see(s) off B 3-1 | A saw off B, three one |
| A overcome(s) B 4-2 | A overcame B, four two |
| A stun B with a 4-1 victory | A stunned B, four one |
| A come(s) from behind to beat B 2-1 | A came from behind to beat B, two one |
| A enjoyed / secured / earned / sealed a 3-0 win against/over B | A beat B, three nil |
| A's 5-1 win against B | A beat B, five one |
| A suffered a 119-66 defeat to B; A lost 2-1 to B | B beat A, one hundred and nineteen to sixty-six |
| A drew 1-1 with B; A were held 1-1 by B | A drew with B, one all |
| A defeat B in the Nations League (4-1) | A beat B, four one |
| X leads/guides/fires A to a 37-34 victory over B | A beat B, thirty-seven thirty-four |
| Buffalo Bills 37–34 Los Angeles Rams (a summary's first line) | Buffalo Bills beat Los Angeles Rams, thirty-seven thirty-four |

Never a score: "6-4 shot" (odds), "1-4 Texans" and "0-7 in overtime" (records), "2-0 NLCS lead" (a series), "2027-28"
(a season), "105-1" (cricket), "2-1 down at half-time".

**Written in figures, spoken in words.** The result line's text keeps the score as the board shows it ("Coventry thrashed
Newcastle 4-1"), so the captions read like any results service; the voice reads it as a results reader would: zero is
"nil" in football and rugby, a draw is "all" ("one all", "nil-nil" for 0-0), and big scores are numbers ("thirty-seven
thirty-four"). The voice knows the line is a result because the segment carries its scoreline. Every other figure pair
in a story is read by its sport too (step 7: the voice plan passes the story's sport to the speech planner): cricket's
"102-4" is "one hundred and two for four", tennis's "6-4 6-3" is "six-four, six-three", an American team's record is "oh
and seven", a series in football or rugby is "three nil", and a score past a hundred keeps its "to" ("one hundred and
nineteen to sixty-six").

**Who was at home** is shown only when the source says so: "at home", "home win/victory", "away win/victory", "their 4-1
loss at Coventry", "hosts", "visitors". Then the board is the results services' horizontal one: HOME score – score AWAY.
Otherwise the board is **vertical**: two rows, the winner on top in the accent, the loser below, FT beside them (a draw:
the source's order, DRAW beside them). A vertical board makes no home-or-away claim.

### 3.6 What the channel adds, and never

- Never a table, a fixture list or a scorer the stories do not state. With the owner's data source turned on
  (`SPORTS_RESULTS`), exact results, kick-offs and tables become available; the design works without it.
- No crests, kits, sponsors or real logos anywhere: teams are names on plates.

## 4. Shapes and running order

Three shapes, chosen from the calendar (channel time) and the material, so a Saturday evening and a Wednesday morning
are different programmes. A shape fixes the order; a segment without material is skipped, never padded.

| Shape | When | Order |
|---|---|---|
| **MATCHDAY** | Sat 15:00 – Mon 10:00, or 4+ readable results from the last 18 h | headlines → title → greeting → lead → **SCORE CENTRE** → THE BREAKDOWN → AROUND THE GROUNDS → MOMENT OF THE DAY → COMING UP → sign-off |
| **MIDWEEK** (default) | otherwise | headlines → title → greeting → lead → THE BREAKDOWN → AROUND THE GROUNDS (results inside their stories) → THE NUMBER → MOMENT OF THE DAY → COMING UP → sign-off |
| **PREVIEW** | Fri 06:00 – Sat 14:00 with 3+ dated events ahead and under 3 results | headlines → title → greeting → **THE WEEKEND AHEAD** (COMING UP first; titled COMING UP when an event falls outside the weekend) → lead → THE BREAKDOWN → AROUND THE GROUNDS → MOMENT OF THE DAY → sign-off |

| Segment | Who | What | Budget |
|---|---|---|---|
| Headlines | Kai | Three stories' headlines over their pictures (the channel's montage) | 20 s |
| Title | — | The open (§6) | 10 s |
| Greeting | Kai, then Rosa | "Good evening, and welcome to FULL TIME. I'm Kai Sprite, with Rosa Rally." (morning, afternoon or evening by the channel's clock; both named, as every two-hander on the channel: step 7) / Rosa's hello (a bank of its own) | 8 s |
| **Lead** | Kai | 3–5 sentences, with its board: the scoreline card for a match (landing on the bed's crowd swell); otherwise WHO'S WHO, WHAT WE KNOW, IN PROPORTION or WHAT HAPPENS NEXT | 40 s |
| **THE BREAKDOWN** | Kai asks, Rosa answers | Rosa's answer is context of one kind, 1–3 of the story's own sentences Kai has not read: **the record or the wait** ("first … since", "record", "unbeaten", "in 25 years"), **the table** ("top", "bottom", "relegation zone", "points clear"), **what's next** (a dated step ahead), or **what they said** (an attributed quote). Kai's question fits that kind ("How long has that been coming?", "Where does that leave them?", "What's next for them?", "What are they saying?"). No context of a kind, no BREAKDOWN: the story is simply told. After the lead, and after one more main story on long days | 30 s each |
| **SCORE CENTRE** | Kai | 3–6 readable results (§3.5) from the last 24 h (on a Monday before 14:00, since Saturday 06:00), shown as **the stadium's scoreboard** filling the frame: the LED board on its gantry over the stand, a floodlight either side, one row flipping in on a tick as each is read. Grouped by sport ("In the Premier League…" only when the source names it, else "In football…", then "Elsewhere…"). Each line is built from the scoreline (§3.5), names and score marked in the voice plan, a short beat before the score. Title: LAST NIGHT'S RESULTS when every result's story says "last night" or was filed 17:00–02:00 the evening before an airing before 14:00; TODAY'S RESULTS when all were filed today; THE WEEKEND'S RESULTS on a Monday before 14:00 with Saturday and Sunday stories; otherwise THE LATEST RESULTS. A row from another day carries the day (SUN) | 35 s |
| **AROUND THE GROUNDS** | Kai and Rosa in turn | 4–7 more stories (the edition is twelve stories: step 4 measured the bible's first budgets, ten stories, at 5.1–5.4 minutes against its own 6–8), each 2–3 sentences, each led by its sport's tag and transition; a scoreline card when the story has one | 25 s each |
| **THE NUMBER** | Rosa | One figure a story states, with a unit or a label ("25 YEARS", "£10.6M", "39 GAMES UNBEATEN"): the channel's number of the day. Never a score, a record ("1-4"), an age, a shirt number or a date | 15 s |
| **MOMENT OF THE DAY** | Rosa, then a chat | The lighter story: a record, a catch, a milestone, an auction. Never grave. When the source gives the distance of a goal or a kick ("from 30 yards", "from the spot", "a 45-yard field goal"), **THE MOMENT ON THE BOARD**: a chalk tactics board, top-down, the pitch's lines in chalk, and only what the source states: a dotted chalk line from that distance to the goal, its length written beside it ("30 YARDS"). No players, no direction, no keeper: a diagram of a fact, not a replay. A distance is stated in a few stories a day, so the board is an occasional treat; otherwise the moment stands on its picture | 30 s |
| **COMING UP** / THE WEEKEND AHEAD | Kai | Two or three dated events ahead on a calendar board (a leaf each). The fixture reader (`server/sport/fixtures.js`) takes "A will face/host/meet/play/fight B on <day>", "who host B on Tuesday", "when they meet on December 11", "the Test starts on…", "in November" (a month leaf), and the WHAT HAPPENS NEXT reader's forms. The event is "WALES v ALBANIA" or "FURY v JOSHUA" when both sides are named in the sentence; the event's own name only when the sentence uses it as a name ("THE ASHES", "THE CHAMPIONS LEAGUE FINAL"), never one the channel composes; nothing when a side is a description ("Norway's champions"). Future dates only | 20 s |
| Sign-off | Kai | "That's FULL TIME…" | 8 s |

- **Target 6–8 minutes** (`targetSeconds [360, 480]`). When over budget, drop in this order: THE NUMBER, the second
  BREAKDOWN, the fourth story of AROUND THE GROUNDS. When under: a story more in AROUND THE GROUNDS.
- No SCORE CENTRE with fewer than three results, no COMING UP with fewer than two dates.

## 5. Repertoire: never the same programme twice

- **Lines.** Every spoken frame has a bank, picked by hash and the channel's recent-lines memory so none repeats within
  six hours station-wide: greetings (10), results intros by shape (8), Kai's questions by kind (12), sport transitions (at
  least 6 each for football, F1, tennis, cricket, rugby, US sports, combat sports, cycling and "the rest": "To the track…",
  "On the court…"), moment intros (8), coming-up intros (6), sign-offs (10).
- **No catchphrases.** Nothing Rosa or Kai says is a signature line.
- **Chats** (at most four exchanges an edition: Rosa's hello, two BREAKDOWNs, the memory) aim at numbers, waits, weather
  and the presenters themselves, never at a real person.
  A light story about a person (a record jersey sale, a milestone) gets a reaction that celebrates the fact ("Fourteen
  million dollars. For a shirt.") and never the person's character.
- **Boards rotate**: a story's board is the strongest it has (scoreline, THE MOMENT ON THE BOARD, then WHO'S WHO /
  IN PROPORTION / WHAT HAPPENS NEXT / WHAT WE KNOW), and the director never shows the same board type twice in a row when
  the story has another (a story whose only board repeats the last one's type still shows it: a result is worth a
  repeat, a story without its board is not). No plain KEY FACT card: a story without one of these boards stands on its
  picture; THE NUMBER keeps its card. No maps: a world map under a result says nothing a sport bulletin needs.
- **IN THEIR WORDS at the press conference.** A manager's, coach's, captain's or official's quote (38 % of sport items carry
  one) is re-staged by the channel's existing system in the **press-conference room**: the press room re-dressed with a
  backdrop of plain orange-and-slate panels, no sponsor or club logo, the bank of microphones in blank foam covers (no
  broadcaster's mark); its grave variant (darker,
  colder) as for the press room. RECREATION and the source on screen throughout. The system's rules hold (a public adult in
  a public role; never a victim, a relative or a child; never on a court case, abuse or a death). At most one an edition.

## 6. Look and sound (graphics, set, open and sound built)

- **Accent orange** (`P.orange`; dark type on it, already in the graphics' dark-ink set). Distinct from NEWS IN 60's yellow
  and the RECREATION tag's yellow by hue and by its place on screen.
- **The set: the pitchside platform.** No glass, no room: the desk stands on a raised platform at the corner of a floodlit
  pitch, under a cantilevered canopy whose underside carries the studio lights. Behind the presenters the stand rises in
  dark tiers with a few lit exits and an empty-seat pattern; four floodlight towers with soft static halos; the striped
  pitch in front of the stand; the advertising boards round the pitch carry no brand, only the channel's orange band and
  FULL TIME. The desk is curved black with an orange edge light. The platform's screen is the network's main screen
  above the desk: it shows the story's picture, or the idle FULL TIME emblem (the integrator's decision, step 5: a
  screen at the platform's side would break every framing and the channel's camera grammar, which are built on the
  centred main screen). It reads as nothing else on the channel: WORLD NOW and SEVEN DAYS are glass rooms over a city,
  the others are rooms.
  - **The ground follows the hour**, with the channel's sky phases (as WORLD NOW's city): by day the floodlights are off,
    the stand in sun and shadow, the pitch bright; at dusk the floodlights come on bank by bank as the sky reddens; at
    night the halos and the lit pitch. Never a night ground at breakfast.
  - **A crowd that does not move**: the lower tier holds a still, dithered crowd at low contrast (heads as a two-tone
    texture, a few scarves in muted colours, no animation); the upper tier is dark. A full ground is the promise of a
    results show; a twinkling one is noise.
  - Motion, slow and sparse (the art direction): the stand's scoreboard shows the channel's clock and turns over each
    minute; a plain orange pennant on the stand's roof (three frames, slow; never a national or club flag); the room camera's own moves give the depth (the stand on its own parallax layer).
    No twinkling crowd, no beams, no flicker, and nothing drifts by itself (a pixel picture moved slowly steps or
    shimmers).
  - **Built (step 5, the set)**: `public/js/v2/canvas25d/studio/pitch.js` (the ground on its own depth planes: the
    channel's sky by the hour with the town through the open corners; four floodlight towers, a pair in the far corners
    and a pair in front of the stand, whose four banks come on one at a time from 17:00, one every 24 minutes, all lit
    at night and in the blue hour, none by day or at dawn; static stepped glows round the lit heads, warm at the
    golden hour; the far stand: a dark upper tier of empty seats with two
    lit exits, a still two-tone crowd in the lower tier on a seeded seat table; the stand's scoreboard on its roof,
    right of the screen, in its own frame on two legs with its shadow on the roof's lit edge, and the pennant on a pole
    beside it, both drawn live; the boards: two FULL TIME bands in the wide, whole or not at all and never behind a
    person; the striped pitch in perspective, the halfway line), `studio/dressing.js` (the canopy's fascia and orange
    cove, two studio fresnels on the screen's drop pipes, the slim columns with their orange inlays, the curved black
    desk with one orange edge light and no sweep; in the wide, the platform's front: the deck running on in front of
    the desk, its edge's orange LED strip panel by panel, the riser's black panels under it), `studio/styles.js`
    (`'full-time'`, an open set), `studio/wall.js` (the screen: the story's picture or the FULL TIME emblem, a
    stopwatch at full time beside the name; THE NUMBER's own figure on its segment; never a map, a plate or a story's
    age). **The pitch's greens**: the channel's palette gained ENDESGA 32's own mid and deep greens for it
    (`palette.js`: `P.midGreen` `#3e8948`, `P.deepGreen` `#193c3e`, the integrator's decision; drawn by name only, the
    quantisers keep the palette as it was, `QUANT`, so nothing else on the channel changes). Each stripe is one solid colour: the
    stripes behind the presenters' heads the darker value, the centre stripe between them the lit one; in the sun
    midGreen over darkGreen (the brightest pitch, under every face in every framing), under the floodlights darkGreen
    over deepGreen, at dawn deepGreen with a stripe of the darkGreen/deepGreen mix (12 L* apart). A centre stripe 4.2 m
    wide, then 6 m: no edge passes within 8 px of a head in any framing (with Kai's and Rosa's own heads); even stripes
    cannot, since in the two-shot an edge between |X| 2.2 and 8 m from the halfway line passes behind a head. In the
    over-the-shoulder the sky's bands are kept off the presenter's head (the head stands in the second band). The lit
    floodlights glow in steps (an inner step, a middle step, a fringe of every other pixel), never a flat disc. Out of
    focus (the singles) the sky is one tone, the roofline a soft step, the crowd one dim tone, the stripes keep their
    two values and the halfway line is a dim soft line. In the wide the platform's light sits in the free rows between
    the captions and the lower third (to y 196) and the ticker (from y 202), with its falloff down the riser (orange,
    rust, brown) and a break at each panel joint, so it reads as a light on the set, not a graphics rule; the deck
    under the captions is ink, the riser under the ticker black.
  - **The wide and the grass (the integrator's decision, step 5)**: the network's wide stays as it is for every
    programme; a FULL TIME-only camera would break the channel's shared framings and camera grammar. The platform reads
    in the wide by its deck, its LED strip and its riser; its drop to the grass is not required there. (The wide's
    bottom row meets the pitch's surface 11 m out, behind the desk front, 9-9.6 m, and the presenters, 10 m: the
    platform's foot, its steps and the grass and touchline in front of it are below or beside the frame.)
    Labs: `public/lab/v2-set.html` and `v2-camera.html` with `?programme=full-time&hour=<0-24>&zoom=1|3|4` (the set lab
    also frames `mcu-b` and `ots-b`, the singles on presenter B; both labs seat Kai and Rosa); tests
    `test/full-time-set.test.js`; critique `docs/roadmap/critique/full-time-set.md`.
- **The open (≈10 s, 120 BPM).** A dark ground; the floodlights bang on bank by bank on the beat (a low thunk each); the
  camera sweeps down to the centre circle; the scoreboard flips to FULL TIME on the referee's final whistle — three
  blasts, the last long (the common "two short and one long" is the same call) — played by the brass; the emblem is a
  stopwatch at 90:00 that becomes the plate.
  - **Built**:
    - the cue sheet `'full-time'` in `public/js/scenes/opens/cues.js` (10.3 s; the clock 89:55 → 90:00 on the first
      blast; the flip on the long one);
    - the stadium, ray-cast pixel by pixel, in `public/js/scenes/opens/fulltimetitles.js`: mown stripes in solid bands
      (`P.green`/`P.midGreen` lit, `P.darkGreen`/`P.deepGreen` before the light); the far stand with stairs, a concourse
      and three lit exits; a still cut closer on each blast (wide, mid, the board's clock at the emblem's place, FULL
      TIME at 2x beside it), never a zoom; the far stand's scarves up on the long blast;
    - the emblem, a digital stopwatch, in `public/js/scenes/opens/sport.js`;
    - the theme in `public/js/audio/themes.js` (`fullTimeTitles`): the whistle's three blasts on the brass, the
      signature then the colour #5 rising to the 6th on the hit, E-flat;
    - the lab at `public/lab/opens.html?id=full-time`.

    Critique: `docs/roadmap/critique/full-time-open.md` (final round 9.8).
- **Music.** The bed: 116 BPM, punchy drums, bass and muted guitar. SCORE CENTRE: a ticking bed of its own, a tick per row.
  The lead's scoreline card: a crowd swell, if the A/B test says it sounds like a crowd and not like rain; otherwise a
  brass stab and a timpani hit. After a grave story the music rule holds (nothing under it nor in the segment after),
  but SCORE CENTRE's ticks stay as quiet sound effects: they mark the rows, they are not music. The sign-off: the theme's tail, except after grave news (the cue sheet's rule: never under
  grave news nor in the segment after it).
  - **Built**:
    - **The bed:** the song `'full-time'` in `music/proposals/lofi/palettes.js`. It has a punchy kit (`DRUMS.punchy`,
      the rig's `punchKick`/`punchSnare`), the bass in eighths, the palm-muted guitar (`mute`) and a low pad, with its
      moments.
    - **SCORE CENTRE:** the `scores` moment is its ticking bed. The row tick is `audio.sfx('scoreTick')`, from the
      director's `playBoardSegment` as each row flips in. The bed's own ticks leave room for it (`LofiEngine.rowTick`,
      asked through `music/live.js`): none within 150 ms of a row's tick.
    - **The scoreline sting:** `STINGS.scoreSting`, ducked under the voice, with both candidates kept (`scoreCrowd`,
      `scoreBrass`). The A/B picked the crowd swell (`SCORE_STING`). The director cues it when the lead's scoreline card
      is cut to (`seg.scoreSting`).
    - **The rules:** the cue sheet's `SPORT` policy in `cuesheet.js` holds the grave rules for the beds and the sting.
      `signoffAllowed` holds back the tail after grave news, asked by the director through `music/live.js`.
    - **The tail:** `buildOutro('full-time')` in `audio/themes.js`.
    - **Lab and tests:** `public/lab/full-time-sound.html`; tests in `test/full-time-sound.test.js`.

    Critique, with the A/B's evidence: `docs/roadmap/critique/full-time-sound.md` (final round 9.8; the owner chooses
    between the two sting candidates by ear).
- **Graphics**: the strap's tag is the sport (FOOTBALL, F1, TENNIS, CRICKET, RUGBY, BASKETBALL, BASEBALL, BOXING, CYCLING,
  GOLF, ATHLETICS; NFL, NBA, MLB only when the link says the league: the London Lions against the Trail Blazers is
  BASKETBALL); the **scoreline card** (vertical rows or the horizontal home–away board, §3.5; scores at 3x; FT, DRAW and a
  stage tag such as FIRST LEG when the source says it); the **stadium scoreboard** for SCORE CENTRE (rows with the sport's
  icon); the **COMING UP** calendar (a leaf a date); **THE MOMENT ON THE BOARD** (chalk on a dark green board); eleven
  sport icons at 11 × 11, drawn pixel by pixel (ball, racket, car side-on, bat and ball, oval ball, helmet, basketball,
  glove, bicycle, flag on a green, runner), each passing a silhouette test at 1x; a sport without one (baseball, ice
  hockey) gets none, never a neighbour's.
  - **Built (step 3)**: `public/js/scenes/cards-sport.js`, seen in `public/lab/sport.html` (`?dt=`, `?scale=1`,
    `?overlay=1` with the top row and a caption over every board); critique in
    `docs/roadmap/critique/full-time-graphics.md` (9.8). One type size a board (1x, the score column moved off the
    middle or a long name on two lines before anything shrinks; the compact six-row board's last resort is the micro
    face for every name together); the winner white on either side; every board credits its source (SCORE CENTRE on its
    foot); the digits in the accent, never NEWS IN 60's yellow; the chalkboard draws only football, American football
    and rugby (in metres), only distances from 1 to 70, and writes the source's own number.

## 7. Data robustness

| Situation | What airs |
|---|---|
| Matchday, many results | MATCHDAY, SCORE CENTRE with up to six results, the rest in stories |
| Quiet Tuesday morning, two results | MIDWEEK; the two results inside their stories with scoreline cards; no SCORE CENTRE |
| No readable scoreline | Stories with their other boards; no scoreline card anywhere |
| Fewer than five fresh sport stories | The programme does not air; the station plays the next in rotation |
| The owner's results source on | Classified results in the traditional cadence, exact tables and kick-offs (a later round) |

## 8. Schedule

- One slot in the rotation (`config/channel.json` `rotation`), after WORLD WEATHER: COSMOS → WORLD WEATHER → FULL TIME →
  WORLD NOW, so it never sits beside TECH BYTES or MONEY MINUTE, the other magazine shows.
- `minGapHours: 1.5` (the station's rule for SEVEN DAYS): about ten editions a day.
- **Until step 7 passes, FULL TIME is a draft**: it lives under `"drafts"` in `config/channel.json`, validated like every
  programme and written by the tests and the gate (`tools/sport/gate.mjs`), never in the rotation and never seen by the
  station or the browser (`loadChannel(file, { drafts: true })` merges it for those who ask).
- It airs only with at least five fresh sport stories and at least 40 % of them new since its last edition; otherwise
  the station plays the next programme (overnight in UK time this skips most slots, as it should).
- Never at :00 or :30 (NEWS IN 60 is pinned).

## 9. Build plan and gates

1. **Desk**: the sport feeds, the never-air filters, the sport from the link, time words (§3.3), the judgement filter
   (§3.4), scorelines (§3.5) and fixtures. *Gate: precision 100 % on the scorelines and fixtures of three days of real
   feeds (every board checked by hand), and every filtered item listed and justified.*
2. **Writers**: the programme in both writers (shapes, segments, banks, balance, grave rules), the validator's checks.
   *Gate: twenty editions written from three days of cached feeds, each read in full; no fault left.*
3. **Graphics**: scoreline card, stadium scoreboard, COMING UP, THE MOMENT ON THE BOARD, sport icons, the accent. *Gate:
   the lab page at 1x and 4x, a hostile critique above 9.7.*
4. **Director and pace**: the shapes' shots, SCORE CENTRE as a full-screen sequence, board rotation. *Built: FULL TIME's
   pace profile (`public/js/pace.js`), the board registry and rotation (`pickBoard`), the board segments
   (`director.js` `playBoardSegment`: SCORE CENTRE fills the frame, COMING UP holds the calendar, a row or a leaf as
   its line is read), the v2 planner's board segments; critique in `docs/roadmap/critique/full-time-director.md`.*
5. **Set, open, theme and bed.** *Gate: renders and recordings critiqued above 9.7.* The set is built (§6; its critique
   passed at 9.8 in round 8, `docs/roadmap/critique/full-time-set.md`). The open, its theme, the bed, SCORE CENTRE's
   ticks and the scoreline sting are built (§6; both critiques passed at 9.8 in round 4,
   `docs/roadmap/critique/full-time-open.md` and `full-time-sound.md`); the owner chooses the sting by ear.
6. **Cast**: Kai and Rosa and their voices (A/B for the owner). *Gate: QUALITY_LOOP's character rubric above 9.7.*
   *Looks built (§2): three candidates each, A on air in both renderers; critique in
   `docs/roadmap/critique/full-time-cast.md` (9.75). The owner's choice of face and the voices are still to come.*
7. **On air**: record a matchday edition and a quiet-day edition with sound; critique the whole programme above 9.7
   (`docs/roadmap/critique/full-time.md`). *Passed at 9.8 in round 3: a matchday (the offline desk, Saturday 18:30,
   4:49) and a quiet day (the 13 Oct snapshot, Tuesday 09:20, 6:01), recorded with Kokoro voices through
   `tools/sport/onair.mjs` (the server under a chosen clock) and `tools/record.mjs --progressive`. What the recordings
   changed: the montage follows the spoken headlines; THE NUMBER airs MIDWEEK only (§4), its story otherwise told with
   its result; a short result keeps its card; one type size on the scoreline card too; FULL TIME's own shot windows in
   the v2 planner; never two hand-overs by name in a row, none at the end of a story on a card; Rosa named in the
   greeting; no odds, no strap cut in its aside, no verdict in a "with" phrase; figures read by sport. Still with the
   owner: faces, voices, the sting, the AI writer, a real matchday (17–19 Oct) and leaving the drafts.*
