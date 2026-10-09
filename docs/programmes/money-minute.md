# MONEY MINUTE: style bible

A short round-up of markets and household money, presented by Penny Sterling alone. The server builds each episode live from business feeds: `stories: 3`, `maxChats: 0` and the `number` feature (`config/channel.json`). This file builds on `docs/ART_DIRECTION.md` and does not repeat it. Where it departs from ART_DIRECTION, it says so.

**Source status (revised 2026-10-02).** None of the outside claims here has been checked against a live page.
- **First draft:** the egress proxy blocked direct fetches, so claims came from search summaries of the linked pages. No frames were viewed.
- **This revision:** WebSearch was out of budget (200 of 200 calls used). WebFetch returned EGRESS_BLOCKED for ted-merz.com, journalistsresource.org, newscaststudio.com, variety.com, en.wikipedia.org, gijn.org, prnewswire.com, spokesman.com, pressgazette.co.uk, qz.com, markporter.com and ahbj.sabew.org. Nothing was newly verified, and nothing was worked around.
- **What changed:** a tertiary source, a Medium post, a speaker-bureau blurb about a named presenter, and a reference that was not used have all been removed. Quotations that could not be checked are now paraphrases. §2.1 lists what is still owed.

**How to read the numbers.** Each value in §3 carries one of these tags:
- a **link:** a search-summary claim, page not opened;
- a **repo path:** a value fixed by our code or by another bible;
- ***(our rule)*:** a design decision with no outside source;
- ***(tunable)*:** our rule whose value is a starting point, to be tuned by eye or ear in the lab. The checklist (§5) tests its floor or ceiling, not the exact value.

## 1. Identity

MONEY MINUTE is the channel's "after the close" desk. It is for adults with a pension, a mortgage or a shopping bill, not for traders. In about a minute the viewer is briefed, as after a good FT chart or a radio markets read.

- **The figure comes first,** then what it means for people's money, but only when the source says so.
- **The room is warm and still.** Warm practicals sit on slate panels, the camera never moves, and every change is a cut on a full stop.
- **The signature device is a cream "paper" card:** one figure, a title that states the point, and nothing that pretends to be a chart.
- **The wit is one dry line at most per episode,** in the sign-off, and never on a bad day.

**One network, distinct personalities.** The values below come from each programme's bible in `docs/programmes/`.

| | WORLD NOW | TECH BYTES | COSMOS DESK | NEWS IN 60 | **MONEY MINUTE** |
|---|---|---|---|---|---|
| Device | red rule under titles | cyan cursor | magenta desk line | yellow dial | **cream paper card, green "bottom line"** |
| Camera | up to 3 slow pushes | 1 push (THE CATCH) | set camera never moves | studio locked | **never moves; cuts on full stops only** |
| Room | home look, cool practicals | product studio at night | one step darker, purple | neutral | **the only warm room (cream practicals)** |
| Music | D, low brass over timpani, 84–104 BPM | A dorian, 100–108 BPM, arpeggio, hats | E lydian, 72–88 BPM | E minor / G major, 120–132 BPM | **F major with the 6th, 112–116 BPM, off-beat electric piano, no hats, no arpeggio** |
| Under stories | silence | silence | bed under pictures | continuous bed | **silence; a data-driven bed under the number** |
| Wit | And finally, sign-off | one dry line per chat exchange | UNIT-8's literal readings | one line at most | **one dry line per episode, sign-off only** |

## 2. Real references (search summaries, not verified)

What each does well for an adult money audience, and the one thing we take.

**Bloomberg Television**
- **Graphics:** the 2021 package brought chart and data visuals into the titles, as a nod to the Terminal ([NCS](https://www.newscaststudio.com/2021/05/07/bloomberg-redesign/)). The 2024 Surveillance studio uses its LED walls for market deep dives ([NCS](https://www.newscaststudio.com/2024/01/17/bloomberg-updates-television-schedule-adds-new-studio-for-surveillance/)).
- **Colour:** the Terminal's amber on black was reportedly chosen to stand apart, because competitors used green ([Ted Merz](https://ted-merz.com/2021/06/26/amber-on-black/)).
- **Music:** more than 50 themes are built on one two-note sonic logo ([PR Newswire](https://www.prnewswire.com/news-releases/reelworld--reel2media-create-new-sonic-brand-for-bloomberg-television-and-radio-301376292.html)). `tech-bytes.md` cites the same release, so this is not independent confirmation.
- **Clutter:** Mark Porter's case study presents the TV redesign as a reduction of on-screen clutter ([Porter](https://markporter.com/work/bloomberg-television)).
- **What we take:** one short motif, and data as the scenery of a story rather than a permanent wall of numbers.

**CNBC**
- **Graphics:** the 2023 package aims for a clean, minimal look that viewers can live with all day. It sits on a square grid, drops bevels, flares and glassy 3D, and usually shows a single strap element ([NCS](https://www.newscaststudio.com/2023/12/12/cnbc-new-graphics-logo-ticker/)).
- **Ticker:** its lower tier became a colour-coded "bottom line" of market indices ([NCS](https://www.newscaststudio.com/2023/12/12/cnbc-new-graphics-logo-ticker/), [Variety](https://variety.com/2023/tv/news/cnbc-ticker-overhaul-screen-graphics-tv-news-1235832629/)).
- **Ritual:** Closing Bell is built around the 4 pm bell ([Wikipedia](https://en.wikipedia.org/wiki/Closing_Bell)).
- **Removed:** the first draft said CNBC redrew its arrows to point north-east and south-east. That came from a tertiary mirror, so it is gone. Our arrow glyphs are our rule.
- **What we take:** flat shapes, one strap at a time, a ticker of figures, and a daily ritual.

**BBC business output**
- **Format:** World Business Report ran 25-minute editions for a global audience from 1995 to 2024. Business Today replaced it, presented from London, New York and Singapore ([Wikipedia](https://en.wikipedia.org/wiki/World_Business_Report), [Wikipedia](https://en.wikipedia.org/wiki/Business_Today_(BBC_News_programme))).
- **Data:** in 2024 the BBC dropped market-data feeds from its website but kept market headlines on air ([Press Gazette](https://pressgazette.co.uk/news/bbc-market-data-news/)).
- **What we take:** one spoken market line beats a wall of quotes.

**Financial Times**
- **Charts:** as GIJN summarises John Burn-Murdoch's advice, a good chart has a narrative title that states the point and explanatory annotations. It maximises contrast by highlighting one or two series and greying the rest ([GIJN](https://gijn.org/stories/data-visualization-storytelling-tips-john-burn-murdoch/)).
- **Colour:** the paper has been salmon pink since 1893 ([Quartz](https://qz.com/462285/why-the-financial-times-is-pink)).
- **What we take:** warm paper cards whose title states the takeaway, with one value in focus.

**Marketplace (American Public Media radio)**
- **Ritual:** in "Let's do the numbers", the host reads the day's indices over music ([Marketplace](https://www.marketplace.org/story/2009/06/02/lets-do-numbers)). The tune reportedly follows the market: one standard on up days, a gloomy one on down days and a third on mixed days ([Houston Chronicle](https://www.houstonchronicle.com/local/gray-matters/article/Let-s-do-the-numbers-5751441.php)).
- **What we take:** music chosen by the data, which our runtime can compute (the "tape", §3.3). We use original writing only, never song quotes.

**Wall Street Week (Louis Rukeyser)**
- **Delivery:** a self-written, wry and pun-heavy opening commentary in plain language ([AHBJ](https://ahbj.sabew.org/lives/0330201louis-rukeyser-1933-2006-wall-treet-week/)). After the 1987 crash he reportedly told viewers it was only their money, not their life ([Spokesman-Review](https://www.spokesman.com/stories/1995/nov/26/rukeyser-paved-way-for-financial-news-on-tv/)).
- **What we take:** the wit lives in the framing line, never inside the facts. We skip the puns.

**Listener studies (pace)**
- In Rodero's 2015 study, 150 wpm felt slow, 170–190 wpm felt normal, and 170 wpm was best for dense news ([Journalist's Resource](https://journalistsresource.org/media/radio-news-pace-words/)). `world-now.md`, `tech-bytes.md` and `news-60.md` cite the same summary, so this is not independent confirmation.

### 2.1 What was analysed, and what is still owed

| Kind of evidence | Status |
|---|---|
| Composition from frames | None viewed for this file. The off-centre single (MCU-R, §3.5) rests on ART_DIRECTION §2's inspected frames: NHK's MCU puts the presenter right and a logo panel in the empty left third, and NBC and the BBC put the anchor in the right third with the wall at left. |
| Shot lengths, graphic holds | **Not measured from any broadcast.** All are our rules, derived from sentence lengths. |
| Pace | From the study summary above, not measured from broadcasts. |
| Brand, ticker, music | Trade-press and agency summaries (links above). |

**Owed: a re-check in a session with open egress**, before this file is called sourced.
1. Every linked claim in §2, starting with the nine a reviewer could not check: Ted Merz's "green" reason, the CNBC 2023 package description, Marketplace's three tunes, Rodero's figures, the GIJN summary, Bloomberg's 50+ themes on a two-note logo, Rukeyser's 1987 line, the World Business Report dates, and the 2024 BBC market-data change.
2. A timing pass on official uploads of Bloomberg *The Close*, CNBC *Closing Bell* and BBC *Business Today* (first 5 minutes each). Log cuts with scene detection (ffmpeg `select='gt(scene,0.3)'`, checked by hand), then report the median shot, how long full-frame data graphics hold, and how many figures are spoken per minute.
3. One Marketplace "numbers" read: its length, and the music level under the voice.
4. Then replace the *(our rule)* tags on shot lengths, card holds and bed levels with measured values, or adjust the rules.

## 3. Our style

### 3.1 Delivery and writing (writer prompt and voice request)

**Figures**
- The story's first grounded figure is spoken in sentence 1 or 2 *(our rule)*.
- At most one figure per sentence and two per story. WORLD NOW makes the same rule (`world-now.md`) *(our rule)*.
- Figures are copied exactly from the source, as `server/writer.js` ACCURACY already requires. `public/js/voice/speechtext.js` expands "$2bn" into words, so the writer keeps digits.
- Ticker symbols are never read aloud *(our rule)*.

**Sentences**
- 8–22 words each, averaging 18 or fewer, with one idea per sentence and no parentheses *(our rule)*.
- The number story's opener ("Our number of the day: 4.2 percent.") is exempt from the 8-word minimum.
- Declarative sentences only, with no "?" and no "!". The voice engine has no pitch control (`tools/voice/engine.py`), so "no upspeak" has to be a writing rule, as in `world-now.md`.

**Words**
- **Direction verbs:** rose, fell, held, edged up, slipped. "Soared", "plunged" and "crashed" appear only if the source uses them *(our rule)*.
- **Jargon:** one gloss of 3–6 words that defines the term and adds no fact ("bond yields, the cost of government borrowing") *(our rule)*.
- **Places and currencies:** the place comes first ("In Tokyo, the Nikkei…"), and currencies are said as words ("the pound") *(our rule)*.
- **The money line:** a story's last sentence says what the news means for people's money only when the source says so. Otherwise the story simply stops. This is the writer's existing "why it matters" rule in `server/writer.js`.
- **No advice, ever:** never tell the viewer to buy, sell, invest, spend, save, switch or "consider" anything. Report what the source says, attributed *(our rule)*.

**Humour**
- At most one dry line per episode. It is written only as the outro's optional `dry` sentence (§4 request E3), never inside a story or the intro *(our rule)*.
- Use understatement or a mock-formal tone, aimed at the format or at markets as an institution. Never aim it at people in a story, and never make it advice.
  - Example (one sentence, 12 words): "That was the economy in about a minute; economists usually need longer."
- The server drops it automatically when any story is grave (`isGrave`, `server/facts.js`) or the tape is `down` (§3.3).

**Fixed lines**
- **Greeting:** "This is Money Minute. I'm Penny Sterling." *(our rule)*.
- **Sign-off:** "That's your Money Minute. I'm Penny Sterling." plus the optional dry line.
- **The next programme is not spoken.** At write time the server cannot be sure what airs next: `server/station.js` skips a rotation slot that lacks fresh news. The end card names it instead, from the live schedule (§3.9).

**Pace and pauses.** wpm is measured as in `tools/voice/measure.py`: words ÷ segment duration, with pauses included.

| What | Target | How |
|---|---|---|
| Penny, all segments | 165–175 wpm, aim 170 *(our rule)* | Preset `speed` in `tools/voice/presets.json`, calibrated with `python3 tools/voice/measure.py rates`. `TARGET_WPM` penny changes from 172 to 170. |
| Pause at a full stop | 0.40 s *(tunable)* | Penny's `pauses.sentence` (engine default 0.35, `tools/voice/textnorm.py` DEFAULT_PAUSES) |
| Gap between segments | 0.8 s *(tunable)* | Director gap, today a fixed 0.3 s (`public/js/director.js`) |
| Gap before the number of the day | 1.2 s *(tunable)* | Director gap. It makes room for the sting (§3.8). |

No pause is inserted before figures. A synthetic voice that stops before every number sounds mechanical, and with one figure per sentence the card and the full stop already give the figure room *(our rule)*.

### 3.2 Structure and running time (produced live)

The number of the day is a **flag on one of the three stories**, not a fourth segment.

| # | Segment | Built from | Words | Seconds at 170 wpm |
|---|---|---|---|---|
| 1 | Open | template, `scenes/opens.js` | — | 4.0 |
| 2 | Intro: cold-open line from the lead's headline, greeting, then "Also coming up: <story 2>[, and our number of the day]." | `intro` (the writer's existing cold-open shape) | 22–33 | 7.8–11.6 |
| 3 | Lead story, 3 sentences | story 1 | 24–60 | 8.5–21.2 |
| 4 | Story 2, 2–3 sentences | story 2 | 16–60 | 5.6–21.2 |
| 5 | Number of the day, 1–2 sentences, at most 200 characters (request E2). Without a qualifying story, an ordinary story 3. | story 3 | 15–33 (ordinary story: 16–60) | 5.3–11.6 (5.6–21.2) |
| 6 | Sign-off, plus the optional dry line | `outro` | 7–21 | 2.5–7.4 |
| 7 | 0.3 s hold, stinger, end card | `director.js` | — | 0.3 + 0.8 + 3.0 |

- **Seconds** = words × 60 ÷ 170. The `storyLength` cap of 360 characters is about 60 words.
- **Gaps:** 0.8 s × 3 plus 1.2 s before the number = 3.6 s (3.2 s with no number).
- **Running time:**
  - shortest: 41 s;
  - typical: about 1:00–1:05 (intro 27 words, lead 45, story 2 35, number 22, sign-off 12);
  - longest with a number: 1:25;
  - longest without one: 1:34.
- **Name:** "Minute" is a promise of brevity, not a stopwatch. The typical episode is close to it.

**Order rules.** These are **new requirements**; today's code does not do this (§4, E1).
- The number of the day airs **last**. `server/writer.js` `applyFeatures` today only drops duplicate number stories and sets the kicker. `server/providers/mock.js` `runningOrder` only moves the `lighter` story last, and its `numberStory` may be the lead.
- **The lead is never the number of the day.** The biggest story goes first. If the only qualifying figure is the lead's, there is no number of the day that episode.
- **The intro adds no figure of its own.** There is no separate "number that matters today". If the lead's headline contains its figure, the cold-open line may say it, but the intro shows no figure graphic.

### 3.3 The tape (market direction, computed live)

The tape is one word per episode, `up`, `down`, `mixed` or `neutral`. It picks the bed under the number of the day and decides whether the dry line survives. It changes no colour (§3.6).

- **Owner:** the server. `normalizeBulletin` writes it to an optional `episode.tape`, plus `numbers[i].dir` and `numbers[i].market` per figure (request E4). The client reads these, and treats a missing value as `neutral` and no glyph. One computation means the server's dry-line rule and the client's bed always agree.
- **Scope: market prices only.** A figure is `market: true` when its sentence names a priced asset:
  - shares, a stock or an index (FTSE, Dow, S&P, Nasdaq, Nikkei, DAX, CAC, Hang Seng, Stoxx);
  - a currency (the pound, sterling, the dollar, euro, yen, yuan);
  - a commodity (oil, Brent, crude, gold, silver, copper).
  
  Economic statistics are never market figures: inflation, prices, wages, jobs, unemployment, GDP, interest rates, bond yields, house prices, profits. For these, "up" is not "good" *(our rule)*.
- **Direction per figure:** `server/facts.js` `extractFigures` already reads the verb right before a figure (rose, up, grew, jumped, increased → UP; fell, dropped, down, cut, declined → DOWN).
  - Extend it with gained, climbed, edged up, rallied, advanced → `up`; slipped, slid, lost, edged down, eased, tumbled → `down`; held, unchanged, flat, steady → `flat`.
  - No verb means no `dir`.
- **Episode tape, from market figures only:**

| Tape | When |
|---|---|
| `up` | at least one `up` and no `down` |
| `down` | at least one `down` and no `up` |
| `mixed` | both `up` and `down` |
| `neutral` | no market figure with a direction, all `flat` (the tie-break for "held"), any `isGrave` story in the episode, or any doubt |

- **Statistic guard:** if the number-of-the-day story has no `market: true` figure, its bed is `neutral` whatever the tape says. So "inflation rose" never gets a major-key bed. This adds to the repo's only existing guard, which covers grave stories.

### 3.4 Set and light: "after the close"

- **Key and rim:** the channel key and the 1 px `P.silver` rim, untinted (ART_DIRECTION §3).
- **Room:** the home value range (not darker than WORLD NOW). Money is the **warm** room: the one symmetric pair of practicals that ART_DIRECTION allows casts `P.cream` pools on slate panels at most 12% alpha, never inside the head zones, so the face stays the warmest thing in frame. Scenery tint is cream, at most 8% (ART_DIRECTION re-dressing table) *(our rule)*.
- **Accent line:** one steady 1 px `P.darkGreen` desk line. Nothing glows.
- **Video wall:**
  - **Idle** (intro, sign-off): a flat `P.ink` field with a Bayer ink-to-slate falloff in its top 12 px. "MONEY MINUTE" sits in Body 1x `P.fog`, centred on x=192 in the upper half, with a 16 px `P.darkGreen` rule under it. There is no grid, no line and no chart: a seeded line on a grid reads as a price series, and it would be a fake one. The old 12 px grid also did not tile the 104x62 wall *(our rule)*.
  - **In a story, on the WIDE:** the story's picture, dimmed to an average L\* of 45 or less, if it has one; otherwise its kicker in the same position as the wordmark.
  - **On the MCU-R:** the figure panel (§3.5).
  - The wall changes only under a cut, and its bottom 16 px stay dark (ART_DIRECTION, solo at x=192).
- **Code today:** `public/js/set.js` `THEMES.money` (the 2D set) still has a `P.yellow` LED, `glow: P.green` and `idle: 'chart'`. `public/js/v2/canvas25d` has no money dressing. Requests D3 and S1.

### 3.5 Camera and directing (from segment data and word timings, seeded per episode)

**The camera never moves.** There are no pushes, pulls or drifts in MONEY MINUTE, so ART_DIRECTION §3 ("must stay still: … the camera") applies unchanged. There is no exception to justify. The first draft's WIDE→MCU-R push is withdrawn: an MCU is about 2x the wide, which cannot be a 3–6% move *(our rule)*.

**Shots and how they map to `director.js`**

| Here | `director.js` shot | Framing, rendered by the 2.5D camera as a fixed `cam` preset (`studio25d.js`), never by scaling a baked frame | Status |
|---|---|---|---|
| WIDE | `wide` | Solo desk, Penny at x=192, the wall centred above (ART_DIRECTION) | exists |
| MCU-R | `close` + `frame: 'right'` | Head centre at x 248–264, eye line at y 64–76, head top at least 10 px below frame top *(tunable)*. The wall's left part fills the left 45% and carries the figure panel (white Display 2x, micro label in `P.fog`), inside x 24–176, above y 120 and at least 6 px from the head. | **new, request D1 and S2** |
| CARD | `fact` + `look: 'paper'` | Full frame: ink field and the paper panel (§3.6) | **new variant, request C1** |
| PIC | `full` | As the channel does | exists |
| MAP | `map` | As the channel does; at most once per episode | exists |

Until MCU-R exists, the director uses the centred `close`, and figures appear only on the CARD.

**Cuts.** Every cut falls in a pause between sentences, between the last word's end and the next word's start (from word timings). The one exception is the cut into the number of the day, which falls in the 1.2 s gap. Any shot lasts 3–12 s *(our rule)*.

**Per-story plan** (one pure function, request D1):
1. **Opening shot.** Story 1 opens on MCU-R. Each later story opens on the studio shot (WIDE or MCU-R) that the previous story did not end on, so every story change is a visible cut. Sentence 1 always plays on it: no cutaway during a story's first sentence (ART_DIRECTION §5). If sentence 1 is under 3 s, sentence 2 stays too.
2. **One cutaway,** at the first sentence boundary after the opening shot has run 3 s. Take the first that applies:
   - **CARD, preview:** the card's figure is spoken in a later sentence, and its legibility lead is at least 0.3 s. Lead = figure-word start − (cut + 0.25 s wipe).
   - **CARD, recap:** the figure was already spoken, and the card shows the takeaway while she continues. A preview whose lead would fall under 0.3 s moves to the next boundary as a recap. If there is no next boundary, there is no card, and the MCU-R panel carries the figure.
   - **PIC** when the story has an image.
   - **MAP** when the story has a `location` and the episode's MAP is unused.
   - **Otherwise** the other studio shot, if at least 3 s of the story remain.
3. **Length of a cutaway:** whole sentences only, 3–12 s. It covers one sentence, or two if the first is under 3 s. A two-value CARD holds until the end of the sentence that speaks the second value.
4. **Return:** if sentences remain after the cutaway, cut back to MCU-R for the money line.
5. **No cutaway:** alternate WIDE and MCU-R at the first boundary where the current shot has run at least 7 s *(tunable)* and at least 3 s of the story remain. With a 22-word cap a sentence lasts at most 7.8 s, so no shot passes 12 s.

**Fixed moments**
- **Intro:** WIDE throughout (7.8–11.6 s). No headline montage: one cold-open line needs none *(our rule)*.
- **Number of the day:** it starts on the CARD, the only cutaway allowed at a story's start. The cut lands at the start of the 1.2 s gap, under the sting. The numeral is legible 0.25 s after the cut, about 2.5 s before it is spoken after "Our number of the day:". Return to MCU-R at the sentence boundary if the card has run at least 4 s and a sentence remains. Otherwise hold it to the end (12 s at most).
- **Sign-off:** WIDE throughout, so the dry line plays on the wide without a cut. Then the end card.

**Restraint: one figure, one place.** A story's figure appears big in one place only. The planner decides the CARD first; the MCU-R panel shows the figure only when the story has no CARD, and otherwise shows the kicker. The ticker shows only figures from stories already aired (§3.6). The intro shows no figure graphic *(our rule)*.

**Gestures** (cue names from `public/js/cues.js`)

| Allowed | Limit |
|---|---|
| `nod` | any story, and once at the greeting |
| `steeple` | at most one per story |
| `lean_in` | once per episode, on a money line |
| `papers` | once, on the WIDE after the sign-off's last word, in the 0.3 s hold plus stinger. No cut lands inside it. |

- **Mapped or dropped** by a per-programme filter (request D2): `count` → `steeple` (the mock writes `[count]` on number stories). `point_camera`, `raise_hand` and `wave` → `nod`. `point_screen`, `glasses` and every `light` action are dropped. Penny wears no glasses (`public/js/scenes/portraits.js` gives them only to paco and ada).
- **Timing:** at most one per sentence and two per story. None in the first 0.6 s of a shot *(tunable; 0.5 s floor, as in WORLD NOW)*. No gesture apex within ±0.4 s of a figure word, so the arms are still while the figure lands *(our rule)*.
- **Brows:** there is no separate brow cue. The canvas25d rig already lifts the brows on stressed syllables (`public/js/v2/canvas25d/rig.js` layer 6: brow += 0.42 × emphasis × persona `energy`). Penny's look, when built, gets `energy` 0.6 *(tunable)*, below Paco's 0.7, so emphasis stays small. Per the BRIEF, nothing reads as a twitch.
- **Eyeline and life:** Penny looks at the lens. In the gap between stories she glances down at her notes, starting at most 0.3 s after the last word and back on the lens at least 0.15 s before the next first word. This is the owner's listener principle (17:47) applied to a solo presenter (request S2).
- **Prop:** her pen (`public/js/anchors.js` `prop: 'pen'`) rests in her hand and is never a cue.

### 3.6 Graphics

**One colour rule** *(our rule)*: green is MONEY MINUTE's identity and never carries data. Direction is shown by glyph shape only, in a neutral colour. No red or green means up or down anywhere in this programme.
- **Why green stays the accent:** it is already the money accent in ART_DIRECTION, in `THEME_ACCENT` (`public/js/cast.js`), in the opens package and in Penny's wardrobe (`portraits.js`).
- **Why direction carries no colour:** red is the network's brand and BREAKING colour. Shape-only glyphs also read without colour vision.

| Element | Colour | Contrast |
|---|---|---|
| Kicker tag plate | `P.green`, `P.black` text | 8.41:1 |
| Desk line, rule under the card title | `P.darkGreen` | 5.39:1 on cream (the card rule) |
| The open's bottom line | `P.green`, drawn on the dark field only | 6.49:1 on ink |
| Direction glyphs on dark (ticker, wall) | `P.silver` | 8.48:1 on ink |
| Figures on dark | `P.white` | 13.89:1 on ink |
| Text, glyphs and "after" bar on the paper card | `P.ink` | 9.59:1 on cream |
| "Before" bar on the paper card | `P.steel` | 3.80:1 on cream (a graphic, not text) |
| Source micro line on the card | `P.slate` | 6.59:1 on cream |

**Direction glyphs:** 5x5 px, hand-placed pixels. An up figure gets a north-east arrow: a diagonal shaft with a 2 px head. A down figure gets a south-east arrow, and a flat one "=" (two 5 px bars). A glyph is drawn only when the figure has `dir` and `market: true`. Statistics get no glyph *(our rule)*.

**The paper CARD** *(our rule; the FT's paper and Burn-Murdoch's titles, §2)*
- **Panel:** `P.cream`, x 40–344 and y 32–120 (304x88), centred on x=192, on a full `P.ink` frame. That is 32% of the frame, down from the first draft's 43%. It sits clear of the strap and ticker (graphics keep y ≥ 140 free).
- **Calm cut:** the cut goes to the dark frame and the panel wipes in. A cream panel never hard-cuts in. At full panel the frame's mean L\* (from mean relative luminance, panel plus ink field) is about 56, against about 38 for a typical MCU. The ceiling is 58 *(tunable)*.
- **Legibility floor on cream:** text at least 4.5:1, graphics at least 3:1. Never on cream: `P.green` (1.48:1), `P.fog` (1.95), `P.red` (2.89), `P.white`, `P.silver`, `P.yellow`, `P.tan`.
- **Content,** from grounded `numbers[]` only:
  - **one value:** title, the figure in Display 2x (3x, 21 px, for the number of the day), its label in Body, and the glyph if any;
  - **two non-negative values with the same unit and the same label:** zero-based proportional bars, 8 px tall and 6 px apart, at most 200 px long and at least 1 px. Before is `P.steel`, after `P.ink`, with values at the bar ends;
  - **anything else:** the first value alone. One figure per card.
- **Layout:** the title is the grounded headline in Body, at most 2 lines, followed by a 1 px `P.darkGreen` rule across the inner width. Inner margin 8 px. "SOURCE: <outlet>" in micro, bottom left.
- **No chart:** never a trend line, axis or candle. We have no series data.

**Card motion** *(tunable, with the floors the checklist tests)*
- The panel wipes in left to right in 0.25 s, ease-out, on whole pixels. The floor is 0.2 s: nothing appears faster except at a cut.
- The text and numerals are revealed by the wipe itself. There is no separate rise, so the figure is legible 0.25 s after the cut.
- **Legibility lead** before a figure is spoken: floor 0.3 s, target 0.6 s or more.
- Bars grow over 0.5 s, ease-out, starting on the second value's word.
- Then everything holds and leaves on a cut. No count-ups and no rolling digits.

**Strap and kicker**
- Channel timings apply (in 0.35 s, flip 0.3 s, out 0.25 s), with the source on the micro line.
- **Kicker:** the writer's own topic kicker, 1–3 words ("OIL", "THE POUND", "INTEREST RATES", "JOBS"). It already exists (`normalizeKicker`, `server/writer.js`). The number story gets NUMBER OF THE DAY from `FEATURE_KICKERS`. "MARKETS" and "YOUR MONEY" are no longer kickers; neither exists in code and neither had a selection rule.
- **Name super:** "PENNY STERLING · MARKETS", held 5 s, rides on her **first story's** strap, as `director.js` `playStory` does today. This departs from ART_DIRECTION §4 ("the first time each presenter speaks", which here would be the intro). The greeting already says her name aloud, and the intro wide stays clean with no strap *(our rule)*.

**Ticker "bottom line"**
- It flips this episode's grounded figures, but only from stories already aired. The story on air and the number of the day before its turn never appear ("OIL  $82" plus the silver glyph).
- Hold 1.5 s + 0.4 s per word (ART_DIRECTION §4).
- With fewer than two aired figures, it shows headlines.

### 3.7 Programme open (within the opens package contract)

The shared clock comes from CONTRACTS.md (opens): build 0–1.5 s, reveal 1.5–3.2 s, then still from 3.2 s to 4.0 s. The open is matched to the WORLD NOW open the owner liked: an emblem builds at centre, glides left, and the title settles with an underline.

- **Motion idea, "the bottom line":** a small cream ledger card, 2x size at centre, is ruled live. Three 1 px `P.steel` lines draw across it left to right, one after another, 0.15 s each from 0.2 s, ease-out. Then one 1 px `P.green` line draws in 0.3 s on the dark field, 2 px below the card's bottom edge: the bottom line. Green never touches the cream, where it would fall to 1.48:1 *(our rule)*.
- **Reveal:** the card glides to the left slot at 1x (24x30 px), as the WORLD NOW globe does. The title plate wipes, and the green line extends from the card to underline "MONEY MINUTE". It plays the part of WORLD NOW's red underline.
- **Lock-up:** card, title in 2x white, tagline in micro `P.fog`, then "WITH PENNY STERLING". It is pixel-identical from 3.2 s to 4.0 s (`__lab.hash`). The field is the network's.
- **Banned in the open:** numbers, bars, trend lines and arrows. A chart that rises every evening would contradict the tape. The current `public/js/scenes/opens/money.js` emblem (five green bars and a climbing trend line with an arrow head) is replaced (request C2).
- After the lock-up, a hard cut on the downbeat to the WIDE.

### 3.7b The title sequence (owner, 9 Oct: as crafted as WORLD NOW's)

9.47 s at 114 BPM on the cue sheet in `public/js/scenes/opens/cues.js`; the pictures (`opens/moneytitles.js`) and the theme (`themes.js` `moneyTitles`) read the same beats. After the close: a time-lapse of the financial district, then its tallest tower emptying, floor by floor, until one lit office is left. That office is the bit, and the ledger opens out of it.

| Beats (s) | Pictures | Music |
|---|---|---|
| 0–8 (0–4.2) | A time-lapse from the golden hour to the blue hour. The camera rises over the rooftops and tracks along the skyline: far haze, offices, an elevated road, the towers and the rooftops under the camera, each layer in parallax. The sun goes down behind the far towers, lenticular clouds stream, the road's traffic draws streaks, and the offices light up in bursts. The tallest tower's crown comes on at beat 5.5. | Fmaj9 from silence on the pad. Short e-piano chords on the "and" of 2 and 4: each is a burst of windows coming on (beats 1.5, 3.5, 5.5, 7.5). The tri bass enters in half notes with Dm9 as the sun goes. |
| 8–11.5 (4.2–6.05) | Cut on the downbeat to that tower's top floors and stepped crown, every office lit, between two neighbours further off. The camera tilts down to the top floor. The floors go dark on the beat, from the foot upward (the neighbours with the first). The crown's floodlights go with the last. The top floor closes in on one office. | Bbmaj9 and a felt thump on the cut. A falling e-piano note and a soft felt on each floor going dark (D, C, A on beats 9, 10, 11). A high F, alone, for the last window. |
| 11.5–11.9 (6.05–6.27) | The tower dissolves into the field, leaving the bit | The F rings on |
| 11.9–18 (6.27–9.47) | The binding opens out of the bit and the package's ledger builds, then the reveal | C6sus. Then the signature on the e-piano over Bbmaj9 and C6sus, into F6/9 on the hit |
| 18–19.5 | Still for the cut | The button |

**Why a skyline is not a chart:** the towers are silhouettes against the sky, tinted by it (the far ones the most), with crowns, setbacks and plant on their roofs. No row of rising columns, no figures and no arrows (§3.7).

**Craft rules, measured:**
- Every layer moves in whole pixels and steps 15 times a second, so a layer's x and y change on the same frame and never on two frames running. A 1 px window never lights a pixel for a single frame. This is tested at 30 and 60 fps.
- The towers' windows move under half a pixel a frame. The rooftops, the fastest layer, carry nothing thinner than 2 px.
- Sky steps are flat, with about 5 px of dither where the value changes slowly, so no edge is a wide checkerboard.
- A lit office in the close-up is drawn with the bit's own pixels: yellow, its shade on the right and the foot, a cream corner. The last one is the bit, tested on the binding's rows.

No swing, brass, bells, coins or arpeggio.

### 3.8 Music and sound

**Why story copy is silent.** The owner asked (17:05) for soft background music "for each programme and moment", without covering the presenter and only at a good moment.
- In MONEY MINUTE nearly every story sentence carries or frames a figure. Those are the moments a bed would compete with.
- So the good moments are the open, the intro, the number of the day, the sign-off and the end card, and the stories stay dry, as in WORLD NOW and TECH BYTES.
- **Owner switch** *(our rule)*: `bedUnderStories: 'off' | 'drone'`, default `'off'`. `'drone'` is one sustained pad, low-passed at 800 Hz or lower, with no rhythm, 28 LU under the voice, ducking a further 6 dB around each figure word.

**Theme and beds** (requests M1, M2)
- **Key:** F major. The colour note is D, the 6th, as in `public/js/audio/themes.js` (`COLOURS.money` 9, key 65).
- **Tempo:** 112–116 BPM, straight (swing at most 0.03), with a full-time feel. This is the free band between TECH BYTES' 100–108 and NEWS IN 60's 120–132, and clear of WORLD NOW's 84–104 and COSMOS's 72–88. With half-note bass and two chords a bar, it reads brisk, not busy.
- **Texture:**
  - short electric-piano chords on the "and" of beats 2 and 4, at velocity 0.5 or less;
  - a `tri` bass in half notes, root and fifth;
  - a filtered `pulse25` pad on the intro bed only.
- **What sets it apart from TECH BYTES:** no arpeggio, no hats, ticks, kick or snare under speech, no walking bass and no lead melody under speech.
- **Intro vamp:** Fmaj9 | Dm9 | Bbmaj9 | C6sus.
- **Tape beds** (number of the day only). They share one pitch set and move only the tonal centre, so the key never changes:

| Tape | Centre | Vamp |
|---|---|---|
| `up` | F Ionian | Fmaj9 \| Bbmaj9 |
| `down` | D Aeolian | Dm9 \| Bbmaj9 |
| `mixed` | G Dorian | Gm9 \| C9sus (unresolved) |
| `neutral` | F, no third | F–C–D drone over an F pedal, no chord change |

- **Banned:** swing, brass stabs, bells above C6, coin or register effects, and song quotes. The current open (128 BPM, swing 0.18, brass, bell arpeggios) and both music proposals (`broadcast/packages.js` `MONEY` at 128 BPM with swing, walking bass and clock ticks; `lofi/palettes.js` at 82 BPM, swing 0.52, with a story bed) must change.

**Moments**

| Moment | Music |
|---|---|
| Open | The reworked open tune, with its final chord on the lock-up (`themeFor` `hitAt`) |
| Intro | The intro vamp enters from silence: pad, then bass, then the chords. It tails out on the bar line nearest the teaser's last word and is gone before story 1. |
| Stories | Silence (see the owner switch) |
| Into the number | The motif sting at double speed, four notes plus the colour note (`motif(tonic, COLOURS.money, 0, { scale: 0.5, colourBeats: 0.5 })`, 1.5 beats = 0.79 s at 114 BPM, at most 1.0 s with its release). It sits inside the 1.2 s gap and ends at least 0.15 s before "Our number of the day". |
| Number of the day | The tape bed (§3.3) |
| Sign-off | The bed crossfades on a bar line to the intro vamp. A motif fragment plays in the gap after the last word, and a button lands on the end card's first downbeat. |
| After a grave story or a breaking story | No bed in the next segment (WORLD NOW precedent) |

**Mix**
- Under speech, the bed's short-term loudness is at least 18 LU below the voice: the channel floor in `world-now.md`, `tech-bytes.md`, `cosmos.md` and `channel-and-breaks.md`. Target 20 LU *(tunable)*. Measure with `measureLoudness()` (`public/js/audio/loudness.js`) or `tools/render-audio.mjs`.
- The broadcast conductor's duck (−9 dB, 120 ms look-ahead, held through pauses; `conductor.js` header) stays as it is. There is no swell inside segments.
- Beds reach full level only in the open and on the end card.
- The sting peaks at least 6 dB below the open.

### 3.9 Transitions

- **In:** break, channel stinger, open (4 s), then a hard cut on the downbeat to the WIDE.
- **Intro to story 1:** cut to MCU-R in the gap. The strap enters 1 s after the cut (ART_DIRECTION §5).
- **Between stories:** a cut to the other studio shot, with the strap text flipping in 0.3 s. No stinger.
- **Into the number:** the cut to the CARD at the start of the 1.2 s gap, the sting, and the kicker flipping to NUMBER OF THE DAY. This is the only graphic transition inside the show.
- **Out:** WIDE, `papers`, a 0.3 s hold, the stinger, then the end card for 3.0 s.
  - The card reads `NEXT: <title>` from `scene.schedule.upcoming[0]`, which `public/js/main.js` stores on the scene from the server's `schedule` events. The second line is the next programme's tagline.
  - Only an entry marked `ready: true` (already produced) is named. Otherwise, or with no schedule, the card keeps today's "STAY WITH US". The accent bar is green (request D4).

### 3.10 Fallbacks

| Case | What airs |
|---|---|
| No grounded figures in the episode | No cards. The wall shows the kicker, the ticker shows headlines, and there is no number of the day; the teaser drops "and our number of the day". |
| A story with no figure, image or unused map | WIDE and MCU-R alternate (§3.5, step 5) |
| MCU-R not built yet | Centred `close`; figures only on the CARD |
| Paper card variant not built yet | The existing fact card with the same timing rules |
| No word timings (browser TTS) | Cuts at the `onSentence` callbacks (sentence starts), which are still sentence boundaries |
| `tape` missing | `neutral` bed, no glyphs, and the dry line is kept only if no story is grave |

### 3.11 Do / Don't

**Do:** lead with the exact figure; one figure per card; direction by shape; green for identity only; warm room, still camera; cut on full stops; silence under story copy; one dry line at most, never on a down day.

**Don't (childish or cheap):**
- coins or dollar signs with faces, piggy banks, money rain, rockets, bull or bear mascots, sparkles;
- cha-ching, strutting brass, bells, swing;
- rolling digits, count-ups, green or red glows, blinking LIVE pills, fake candlesticks, trend lines or charts in the open;
- red/green direction colours, or the same figure on the wall, the card and the ticker at once;
- hype verbs, exclamation marks, puns in straps, advice, jokes near layoffs or losses;
- `wow`, `thumbs_up`, `fist_pump`, `count` or `point_screen`;
- a Bloomberg-style wall of numbers.

### 3.12 Format round (owner 4 Oct, built 9 Oct): longer, never one story after another

The owner's brief for every programme (`tech-bytes.md` §3.10, `cosmos.md` "Format round"): longer programmes that are more than one story after another. MONEY MINUTE is the one solo desk, so nothing here is a conversation: every new element is Penny's own line to camera or a graphic. It supersedes the one-minute structure of §3.2: the programme now runs 4–6 minutes (`targetSeconds [240, 360]`, `stories: 9`, `minStories: 4`).

**The running order:** intro (lead headline, "Coming up", "Later"), the lead, main stories, IN PLAIN ENGLISH after a story that used the jargon, STILL TO COME mid-programme, more main stories, IN BRIEF when it forms, the number of the day last, the sign-off.

**IN PLAIN ENGLISH** (`server/glossary.js`, set "money", `"terms": { "explainer": "penny", "set": "money" }`). The words of a markets page, said plainly by Penny right after the story that used them, with the definition card:
- **The phrasings:** "Levy, in plain English: a charge collected for a particular purpose." / "A quick translation: a bull market is a long stretch of rising share prices." / "If the term is new to you, ..." / "The jargon, briefly: ...".
- **The terms:** about 40 (inflation, core inflation, stagflation, interest rate, base rate, central bank, mortgage rate, bond yield, gilts, recession, GDP, budget and trade deficits, national debt, unemployment rate, cost of living, bull and bear markets, market rally, IPO, dividend, market value, valuation, annualised revenue, earnings season, tariff, sanctions, supply chain, quantitative easing, short selling, hedge fund, private equity, venture capital, windfall tax, levy, credit rating, liquidity, antitrust).
- **Never a figure in a definition** (the card never shows one the channel did not report), **never advice**, at most two a programme, never after grave news, never a definition heard lately.

**STILL TO COME for a solo presenter.** The mid-programme signpost is Penny's own line ("Still to come: contribution of high value residents discussed, and our number of the day."), with the STILL TO COME frame over the stories it names. A solo programme has no exchanges: its chat budget (`maxChats: 3`, `chats.after: ["story"]`) covers only this line and IN PLAIN ENGLISH.

**IN BRIEF** (`roundup.kind: "pictures"`, opener "Now, the rest of the business news in brief."). The business stories that would be short anyway (one whose article was read keeps its full telling), one sentence each over its own picture. It airs only when three such stories have a picture.

**The boards** (pace `shots`: `numbers`, `known`, `quoteCard`, `stillToCome`, `terms`). BY THE NUMBERS on a story's stated figures (business stories are figure-rich), WHAT WE KNOW on hard business news (`"boards": ["known"]`), IN THEIR WORDS on a sourced quote. The v2 planner counts a WHAT WE KNOW board as the story's card, and an IN BRIEF item plays over its picture from its first word. The camera still never moves.

**The desk.** MarketWatch went: its pages gave no article text (paywall) and its top stories were advice, analysis and celebrity homes. Euronews Business and France 24 Business came in, both with article text. A headline that starts an analysis or a feature ("Aging bull: Why this 4-year-old stock-market rally still packs a punch", "The new Darth Vader: how tech execs became the film villains of our age") and a gallery ("– in pictures") are not reports; an outlet's label ("Revealed:", "Exclusive:") is not said.

**The first runs on real news** (9 Oct, the fallback writer on the live business feeds; `test/realnews-oct9.test.js`):
- **Strap.** "German logistics group Rhenus plans up" (a cut inside "up to 14 terminals"). A headline is never cut inside "up to"/"down to" a figure.
- **Figures.** The number of the day said "$20 billion" while its card showed "1.25% OPENAI DOWN". The card now shows the figure said, "$20 BILLION BELOW ESTIMATES" (a comparison with a forecast is the figure's label), and what moved is the name right before the direction ("NASDAQ DOWN 1.25%"). A currency conversion in brackets ("(€17.8bn)") is not read; "UP TO 14 TERMINALS ALONG" lost its "along".
- **Page text.** The BBC's screen-reader-only ", external" after every outside link ("...residency programme, external grants residential status") never reaches a script, nor does "Exclusive:" before a sentence.
- **Cuts.** "...from processing industrial[ and commercial wastewater]" (an adjective pair is one phrase) and "...from sites such[ as...]" are refused.
- **Names.** "Water companies in England..." once became "Yorkshire Water companies...": a word the article also writes in lower case is a common word, never a surname to complete.
- **Depth.** A story whose article was read is preferred, all else equal, to a one-line summary.

**The voiced episode of 9 Oct** (4 min to the end card; the paper card, STILL TO COME with two pictures and the IN PLAIN ENGLISH card all aired as planned):
- **Two 19-second singles.** A story with no picture stayed on the MCU-R after its one cutaway, and the number of the day's card held 14 s until a later sentence, then was cut short on air into a long single. No studio shot now runs past 12 s where a sentence pause allows a cut: a long MCU-R gives way to the WIDE and comes back for the story's end. The number's card cuts in a phrase's pause when sentence 2 comes just before 4 s, and the story's own picture follows (its photo had never aired).
- **WIDE into WIDE.** A story too short to cut away stays on its opening WIDE, so the next one opens on the MCU-R, never a second WIDE (one held 16 s across two stories).
- **The plan matches the screen.** IN PLAIN ENGLISH and STILL TO COME are planned as their card and frame (the director plays them), not as a studio wide.
- **The desk.** The same name and the same figure in two headlines are one story ("What happened to OpenAI’s $20bn?" and "OpenAI projected to bring in $20bn less" once aired as a story and as the number of the day). The LATEST ticker carries news only (an advice column scrolled under the programme). A people's name keeps its capital mid-sentence ("Coming up: German logistics group...").

**Length.** On 9 Oct's real news (14 business stories on the desk, 11 with their article) the fallback wrote about 560 words, near 3 min 45 s at Penny's pace, under the 4–6 minutes the LLM writer is asked for: the business feeds give short summaries, and the fallback writes no more than the reporting supports.

## 4. Requests to other streams

This bible may not edit `CONTRACTS.md`. These entries are worded to be copied into its "Requests" section as they stand.

**Editorial** (`server/writer.js`, `server/providers/mock.js`, `server/facts.js`, `config/channel.json`; tests in `test/writer.test.js`, `test/providers.test.js`, `test/facts.test.js`)
- **E1. Number last, never the lead.**
  - Add a programme flag `numberLast: true` (money-minute only).
  - `applyFeatures`: if the number story is the first story, drop its feature. Otherwise move it to the end of the story list.
  - `mock.js`: exclude `order[0]` from `numberStory` candidates and move the number story to the end of `order`.
  - Add a prompt line under RECURRING FEATURES: "Put the number-of-the-day story last. Never make the lead story the number of the day."
- **E2. Number length.** Add `numberLength: "1 or 2 sentences, max 200 characters"` in channel.json. `buildPrompt` adds it to the `number` rule, and `normalizeBulletin` drops whole sentences beyond it, never cutting mid-sentence.
- **E3. Dry line.** The outro gets an optional `dry` string: one sentence, at most 14 words, no digits, no "!" or "?", no advice verb.
  - `normalizeBulletin` keeps at most one, and drops it when any story is `isGrave` or `tape === 'down'`.
  - The producer appends it to the outro text.
  - Prompt line: "Optionally add one dry closing sentence as `dry` on the outro; never advice, never about people in the news."
- **E4. Tape.**
  - Extend the `extractFigures` direction lexicon (§3.3).
  - Add `numbers[i].dir` (`'up' | 'down' | 'flat'`) and `numbers[i].market` (boolean).
  - Add optional `episode.tape`, computed by the table in §3.3.
- **E5. Prompt for money-minute:**
  - no advice ("never tell viewers what to do with their money");
  - the kicker names the market or topic;
  - the sign-off does not name the next programme;
  - one figure per sentence, figure in sentence 1 or 2.

**Director** (`public/js/director.js`; a DOM-free planner module, tested in `test/money-direction.test.js`)
- **D1.** The per-story shot plan of §3.5 as a pure function: `(segment, wordTimes, episodeState) → [{ shot, at, card? }]`. Map MCU-R to `close` + `frame: 'right'` and CARD to `fact` + `look: 'paper'`. Set the money gaps to 0.8 s and 1.2 s.
- **D2.** A per-programme gesture filter: an allowlist, the mappings of §3.5 and the timing limits.
- **D3.** The idle wall is a wordmark; in story the WIDE wall shows the picture or the kicker, and the MCU-R wall the figure panel (§3.4, §3.5). The 2D `set.js` `money` loses `P.yellow`, `glow` and `idle: 'chart'`.
- **D4.** The end card's `NEXT: <title>` comes from `scene.schedule.upcoming[0]` when it is `ready`, falling back to STAY WITH US.

**Studio and rig** (`public/js/v2/canvas25d/**`)
- **S1.** A `money` dressing: warm cream practicals at most 12% alpha outside the head zones, a `P.darkGreen` desk line, and a cream tint of at most 8%.
- **S2.** A fixed `cam` preset for the right-third close (§3.5 numbers), a Penny look (no glasses, pen at rest, persona `energy` 0.6), a "glance at notes" look hook for gaps, and a set-only layer option in the lab for checklist item 12.

**Cards and opens** (`public/js/scenes/cards.js`, `public/js/scenes/opens/money.js`, lab `public/lab/opens.html`)
- **C1.** The paper fact card of §3.6 (layout, colours, wipe, bars, glyphs). Lab id `kind=card&id=fact-paper`, with `variant: 'one' | 'bars' | 'number'`.
- **C2.** Replace the money open's chart emblem with "the bottom line" (§3.7).

**Graphics** (`public/js/graphics/**`)
- **G1.** The ticker shows aired-only figures with silver shape glyphs. No red or green direction colour in the money theme.

**Music and audio** (whichever music proposal is adopted, `public/js/music/proposals/{broadcast,lofi}`, plus `public/js/audio/themes.js`)
- **M1.** The money package per §3.8: tempo, key, texture, moments, tape beds, the `bedUnderStories` switch, and no bed under story copy. It reads `episode.tape` and the number story's `market` flag.
- **M2.** The `themes.js` `'money-minute'` open per §3.8: 112–116 BPM, no swing, no brass, no bells above C6.

**Voice** (`tools/voice/presets.json`, `tools/voice/measure.py`)
- **V1.** Set Penny's `TARGET_WPM` to 170 and `pauses.sentence` to 0.40, and recalibrate `speed`.

## 5. Acceptance checklist

Each item names how it is checked. "Unit" means a `node --test` file. "Capture" means a deterministic `tools/shoot.mjs --step "window.__lab.render(T)"` sheet, saved under `$SP/shots/money-minute/<name>/` and read.

| # | Rule | Check |
|---|---|---|
| 1 | Every on-screen figure is in its story's source. No trend line, axis or invented series anywhere, the open included. | Unit (writer grounding) + capture |
| 2 | Each story speaks its first grounded figure in sentence 1 or 2. No sentence holds two figures, and no story more than two. | Unit, on mock and validated scripts for the business fixtures |
| 3 | Every sentence has 8–22 words (number opener exempt), and the mean per episode is 18 or fewer. No "?" or "!". | Unit |
| 4 | Penny 165–175 wpm per segment, pauses included | `python3 tools/voice/measure.py rates` for the preset, then words ÷ duration on the recorded segments of a money-minute fixture episode (the voice `words` timings) |
| 5 | At most one dry line, only in `outro.dry`, absent if any story is grave or the tape is `down`. No digits, advice verbs, "!" or "?". | Unit (`test/writer.test.js`), with cases for grave, down, advice and two lines |
| 6 | The number story is last, never the lead, 1–2 sentences, 200 characters at most. With no qualifying story, there is no number and no teaser mention. | Unit (writer + providers) |
| 7 | Lexicon: "rose" → up, "slipped" → down, "held" → flat, "inflation rose" → not market. Tape cases from the §3.3 table, including grave → neutral and a statistic number story → neutral bed. | Unit (`test/facts.test.js`) |
| 8 | Camera parameters are constant within every shot. Every cut falls inside an inter-sentence pause (number cut: inside the 1.2 s gap). Every shot lasts 3–12 s. | Unit (`test/money-direction.test.js`) on fixture word timings |
| 9 | Preview cards: the figure is legible at least 0.3 s before its word. The wipe takes at least 0.2 s. Nothing appears in under 0.2 s except at a cut. | Unit (planner) + capture of the wipe |
| 10 | Card colours: text at least 4.5:1 and graphics at least 3:1 against `P.cream`. No green, red, fog, white, silver, yellow or tan on the panel. Frame mean L\* at full panel 58 or lower. | Unit over the card's colour constants + capture pixel count |
| 11 | No `P.red`, `P.darkRed`, `P.green` or `P.darkGreen` pixel inside any glyph or bar. Outside clothing, green appears only on the tag plate, desk line, card rule and open line. | Capture + pixel count |
| 12 | Saturated pixels (`P.red`, `darkRed`, `rust`, `orange`, `yellow`, `green`, `darkGreen`, `cyan`, `blue`, `navy`, `pink`, `magenta`, `purple`) are at most 10% of **set** pixels in the WIDE. Presenter, clothing, wall content and graphics layers are hidden, per ART_DIRECTION's definition, so Penny's green outfit does not count. | Capture of a set-only render + pixel count |
| 13 | Idle wall: no numbers, grid, line, chart or LIVE pill. Wall content changes only on a cut frame. | Capture pairs across each cut |
| 14 | Only allowed gestures. At most one per sentence and two per story. None in the first 0.6 s of a shot, no apex within ±0.4 s of a figure word, `lean_in` at most once, `papers` only after the sign-off. | Unit (planner) on the cue timeline |
| 15 | No bed under story copy (switch off). The tape bed matches `episode.tape`, neutral for a statistic. The sting is 1.0 s or less and ends before the number's first word. Beds sit at least 18 LU under the voice. No swing above 0.03, no hats, ticks, brass or bells above C6. | `tools/render-audio.mjs` + unit assertions on the package definition |
| 16 | The open's lock-up hash is identical from 3.2 s to 4.0 s. No digit, bar, arrow or trend line in any open frame. Hard cut to WIDE on the downbeat. | Capture (`/lab/opens.html`) |
| 17 | A no-figure fixture episode airs cleanly (no cards, kicker on the wall, headlines on the ticker). A story with no figure, image or map alternates WIDE and MCU-R. | Unit (planner) + offline channel capture |
| 18 | **Blocker:** a first-time adult viewer calls it business news, never a kids' show or a game show. | Panel, below |

**Viewer panel (item 18).**
- **Who:** at least three critic agents who have not worked on MONEY MINUTE, plus the owner when available.
- **What they see:** the capture sheet of the open lock-up, WIDE, MCU-R and CARD at 1x and 5x, and a 20 s recording with sound (`tools/record.mjs`).
- **The one neutral question:** "What kind of programme is this, and who is it for?"
- **Pass:** every answer names business, financial or markets news for adults.
- **Fail:** any answer mentioning children, kids, cartoon, toy, mascot or game show is a blocker.

**Capture list** (deterministic; times in seconds)
- **Open:** `/lab/opens.html?kind=open&id=money-minute`, `__lab.render(t)` for t = 0, 0.2, 0.5, 0.8, 1.2, 1.5, 2.0, 2.5, 3.2, 3.6, 4.0, and `__lab.hash(3.2) === __lab.hash(4.0)`.
- **Card:** `/lab/opens.html?kind=card&id=fact-paper`, t = 0, 0.1, 0.2, 0.25, 0.5, 1.0, 1.5, for each variant (`one`, `bars`, `number`).
- **Graphics:** `/lab/graphics.html?theme=money`: the name super on the first strap, the NUMBER OF THE DAY kicker, and the ticker with up, down and flat glyphs.
- **Studio:** the 2.5D lab (`/lab/foundation-canvas25d.html`, or a `public/lab/money.html` built on it) with Penny. WIDE and MCU-R at t = 0, 2, 4, checking the MCU-R head centre and figure-panel bounds of §3.5. A set-only WIDE for item 12. The idle wall and the kicker wall.
- **Offline channel:** a money-minute fixture episode in real time, `tools/shoot.mjs --wait 3 --frames 120 --every 0.5`, plus `tools/record.mjs` with sound for the panel.
