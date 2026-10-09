# NEWS IN 60 — style bible

A headline round-up of about one minute, presented by Sam Night alone. This file builds on `docs/ART_DIRECTION.md` and states only the differences. Line numbers are as of 2026-10-02. Some of these files are being edited right now, so the symbol names are the stable pointer.

**Research note (revision 2, 2026-10-02)**
- **No source could be re-checked in this pass.**
  - WebSearch refused because the session's 200-search budget is spent.
  - WebFetch returned EGRESS_BLOCKED for en.wikipedia.org, img.youtube.com, networknewsmusic.com and journalistsresource.org, and could not fetch web.archive.org.
  - Direct HTTPS probes to bbc.co.uk, youtube.com, i.ytimg.com, variety.com, researchgate.net, archive.org, newscaststudio.com, tvbeurope.com, jagodesign.co.uk and abc.net.au all failed. Only github.com and the package registries answered.
- **Each link says how it was seen:**
  - **[summary]**: known only from a search-engine summary in the first pass. Unverified.
  - **[AD-viewed]**: read or viewed directly by the `docs/ART_DIRECTION.md` study earlier today (agency pages, and frames from official YouTube uploads). Not viewed again here.
- **Repo facts** (file:line) were checked against the code in this pass.
- **Every rule in section 3 carries a tag:**
  - **[R#]** means the rule follows reference R# in section 2.
  - **[AD §n]** means it follows ART_DIRECTION.
  - *(our rule)* means it is our own decision, with no source.

**Claims the reviewer flagged, and what changed**

| Revision 1 said | Revision 2 |
| --- | --- |
| MSNBC "stopped scrolling" its ticker in 2018 | "Removed its ticker". That is what the cited Variety URL slug says (`msnbc-removes-news-ticker`); the article text was not read |
| Journalist's Resource: "faster than that overloads them" | Removed. Only the Rodero figures remain, which money-minute.md cites too |
| 60 Seconds "2001–2016", Faithless soundtrack | Removed. Only format facts remain, marked [summary] |
| ITV "median 6.3 s (minimum 2.7 s)" | 2.7 s is the shortest shot in a range of 2.7–40.8 s, the same figures world-now.md cites. [summary] |
| HLN "scaled back in 2005" | The year is removed. The kiddle mirror and the IMDb plot summary are dropped |

**Still owed, when egress works:** view official uploads of 60 Seconds and NowThis, and log strap height, counter position and shot lengths. Then replace *(our rule)* tags with measured values, or fix the numbers.

## 1. Identity

The image is a stopwatch on a dark desk. A calm adult gives you five things that matter in the time it takes a kettle to boil, and you leave briefed, not rushed.

The speed comes from the editing: one idea per item, a cut on every sentence, and a strap that never leaves the screen. It never comes from fast talk. The show is for viewers dipping in between longer programmes, and for anyone watching on mute.

**How it differs from its siblings:**
- WORLD NOW is the red-and-navy two-shot, with banter at the end.
- MONEY MINUTE has silence under its stories and warm paper cards.
- NEWS IN 60 is darker and has one voice. It is the only show with a continuous ticking bed, a picture on every item and a strap that stays up for the whole minute.
- Yellow is used like the markings on an instrument: a small chip, a hairline rule and the dial ticks.

## 2. Real references

**R1. BBC Three "60 Seconds"** [summary]
- **Format:** five stories of about 10 s each, with pictures under each story. A countdown sat in the corner, and a line crossed the screen counting down the seconds ([Wikipedia](https://en.wikipedia.org/wiki/60_Seconds)).
- **Look:** it began with a youthful look and was later given "a more serious look", with the presenter standing in a newsroom in front of a screen (same source).
- **Refresh:** a later refresh brought new graphics and a Music 4 remix of the theme ([Music 4](http://www.music4.com/music/catalogue/540/bbc-three/bbc-three-60-seconds.html)).
- **Take:** about 10 s and one picture per story, with one visible progress device. The format grew up by getting plainer, which is our tone correction too.

**R2. 90-second bulletins** [summary]
- **BBC One:** the "News Summary" ran 90 s with one newsreader: a minute of national and world news, then 30 s of regional news ([Wikipedia](https://en.wikipedia.org/wiki/BBC_News_Summary)).
- **Others:**
  - ABC Australia's "News in 90 Seconds" runs 1:53 in one listed edition ([ABC](https://www.abc.net.au/news/newschannel/news-in-90-seconds)).
  - Sky Sports News publishes "SSN in 60 Seconds" ([Sky Sports](https://www.skysports.com/football/news/11095/11500246/sky-sports-news-in-60-seconds-all-the-latest-headlines)).
- **Take:** the title promises brevity, not a stopwatch, so we accept 55–65 s rather than cut a sentence.

**R3. NowThis** [summary]
- **No anchor:** it moved to short videos with on-screen text instead of a presenter: "We were wasting time with people on camera" ([Digiday](https://digiday.com/media/nowthis-news-rebrands-mobile-social-world/)).
- **Type and colour:** a design blog describes one typeface in black, white and "a dash of yellow", with key words larger and bold ([Typito](https://typito.com/blog/how-to-design-videos-like-nowthis/), a secondary source).
- **Sound off:** Digiday reported in 2016 that 85% of Facebook video was watched without sound ([Digiday](https://digiday.com/media/silent-world-facebook-video/)). It is a 2016 platform figure, not a TV one, so we use it only as a reason to test the strap on mute.
- **Take:** the strap must tell each story on its own, and yellow can be a news colour without being cute.

**R4. CBS "60 Minutes" stopwatch** [summary]
- **The tick:** it plays on the open and the break bumpers. Edd Kalehoff notch-filtered it on a Moog, because the amplified ticking sounded like "rattling garbage can lids" ([Network News Music](https://www.networknewsmusic.com/60-minutes/), [Smithsonian](https://americanhistory.si.edu/collections/object/nmah_1211921)).
- **Take:** a tick sounds premium only when it is filtered soft and low.

**R5. Euronews: "No Comment" and its bulletins**
- **No Comment:** pictures run with no voice-over ([Euronews](https://www.euronews.com/nocomment)). [summary]
- **Bulletin frames:** a small bug at top right, a small blue topic tag, and a big white headline over the picture ([frames](https://www.youtube.com/watch?v=apiaIgKLobQ)). [AD-viewed]
- **Take:** pictures carry the story, with a small tag over a big headline, and a picture may hold for a moment with no voice.

**R6. Pace** [summary]
- **Rodero (2015):** 150 wpm felt slow and 170–190 felt normal. The ideal for dense news was 170 wpm ([Journalist's Resource](https://journalistsresource.org/media/radio-news-pace-words/), also cited by money-minute.md).
- **British radio** favours about 3 words per second, or 180 wpm ([Boyd, *Broadcast Journalism*](https://www.oreilly.com/library/view/broadcast-journalism-6th/9780240810249/xhtml/ch17.xhtml)).
- **Newsbeat** on Radio 1 cut its breakfast headlines from 3 minutes to 2 in 2024 ([Deadline](https://deadline.com/2024/04/bbc-butchers-radio-1-breakfast-news-bulletins-greg-james-1235882812/)).
- **Take:** 170 wpm is the sourced figure. A shorter bulletin means fewer words, not faster ones.

**R7. Shot length** [summary]
- **The study:** ITV news bulletins have a median shot of 6.3 s, and shots range from 2.7 to 40.8 s ([Redfern](https://www.researchgate.net/publication/263129239_The_structure_of_ITV_news_bulletins)).
- **Take:** our 3–8 s picture shots sit around that median, and no shot is shorter than 3 s (as AD §5 also says).

**R8. One person, one box** [AD-viewed]
- **BBC and ITN, 1988:** the presenter sits left of centre on a graded blue backdrop, with one bevelled picture box at top right and nothing else ([frames](https://www.youtube.com/watch?v=ox-i25kSdHw), [frames](https://www.youtube.com/watch?v=PFWT2oPhf1w)).
- **NBC Nightly News, 2026:** the anchor is in one third, and a white condensed headline sits on the wall in the other ([frames](https://www.youtube.com/watch?v=ZMJtrc0Sf0g)).
- **Take:** our MCU-L (Sam on the left, one picture box on the right) is the most proven solo layout, and the easiest to draw in pixels.

**R9. Straps and tickers**
- **BBC News, 2019:** high-contrast straps arrived, and headlines shown one at a time replaced the scrolling ticker. Breaking news turns the strap red ([Wikipedia](https://en.wikipedia.org/wiki/BBC_News_presentation)). [AD-viewed]
- **Sky News:** in some frames the ticker runs yellow with black text ([frames](https://www.youtube.com/watch?v=JnmYgbYazV0)). [AD-viewed]
- **ABC World News Tonight:** a small red tag sits over a big white caps line on navy. The whole block takes about 16% of the frame height ([frames](https://www.youtube.com/watch?v=X-Ez_cARboo)). [AD-viewed]
- **CNN:** its thin strap type in 2023 was criticised and thickened weeks later ([NCS](https://www.newscaststudio.com/2023/08/15/cnn-graphics-update-august-2023/)). [summary]
- **MSNBC** removed its ticker in 2018, according to the headline of [Variety's report](https://variety.com/2018/tv/news/msnbc-removes-news-ticker-1202754729/). [summary; URL slug only]
- **Take:**
  - Black on yellow is a real news pairing.
  - Use one small tag over one big line.
  - One item at a time beats scrolling.
  - Legibility beats elegance.

**R10. Light**
- **CNN London:** soft, "relatively flat" light at about 5000 K, with colour used only as "pools" on the architecture ([TM Broadcast](https://tmbroadcast.com/cnn-london-lighting-workflow/)). [AD-viewed]
- **Sky News Studio 21:** the light keeps the set "as white as possible whilst retaining warmth in the skin tones" ([NCS](https://www.newscaststudio.com/2016/12/06/sky-news-glass-box-studio-21-design/)). [summary]
- **Take:** a neutral white key on the faces, with colour only on the scenery.

**R11. A programme named by a number** [AD-viewed]
- **BBC:** bulletins are identified by a numeral on the wall ("6", "10") ([Jago](https://jagodesign.co.uk/projects/bbc-national-news-2)).
- **Take:** the "60" on the dial is the programme's whole identity. No mascot, no extra emblem.

**Counter-reference: CNN Headline News, 2001** [summary]
- **What happened:** the 2001 relaunch stacked boxes of text around the anchor ([CNN, 2002](https://edition.cnn.com/2002/US/08/02/hln.behind.intro/index.html), [Wikipedia](https://en.wikipedia.org/wiki/HLN_(TV_network))). The first-pass summary called it a "jumbled mess" (unverified).
- **Take:** never fill the screen with boxes, and allow at most three moving zones (AD §3).

## 3. Our style

### Delivery and writing (writer prompt and voice)

- **Pace: 170 wpm** [R6].
  - The accepted range is 165–175 wpm.
  - It is measured the way `tools/voice/measure.py` does it: words ÷ segment duration, with planned pauses included.
  - `TARGET_WPM['sam']` in measure.py is 185 today and must become 170. Calibrate the `sam` preset's `speed` in `tools/voice/presets.json` with `measure.py rates`.
  - Never speed the voice up to fit. The fit step (see Structure) drops items instead *(our rule)*.
- **Pauses** *(our rule)*:
  - Inside a segment: the engine defaults, 0.15 s at a comma and 0.35 s at a full stop (`DEFAULT_PAUSES` in `tools/voice/textnorm.py`).
  - Between segments: 0.7 s. This is a director gap, and the cut and the tick sit in it.
- **Word budget:** 150–163 words from greeting to sign-off, aiming at 157 *(our rule, from R1's ~10 s per story and R6's 170 wpm; derived under Structure)*.

  | Part | Words | Sentences |
  | --- | --- | --- |
  | Intro (templated) | 8 | 2 |
  | Lead | 32–38 | 2–3 |
  | Each other item | 25–28 | 2 |
  | Round-up item | 14–18 (the first one adds "Around the world.") | 1 |
  | Dry line (optional, last item only) | 3–8, counted in that item | +1 |
  | Sign-off (templated) | 6–8 | 2 |

  - No sentence may run over 18 words *(our rule; world-now.md uses 20)*.
  - The writer gets these figures through `storyLength` (writer.js:148). The new text is under "Runtime hooks".
  - The part ranges are set so that 5 stories always land inside 55–65 s at 170 wpm: all minimums give 146 words and 56.0 s, all maximums 166 words and 63.1 s. The fit step then picks the story count.
- **Sentences** *(our rule; writer.js already asks for one idea per sentence)*:
  - Subject or place first, then an active verb in the present or present perfect.
  - Sentence 1 is the fact. Sentence 2 adds one detail and ends with the attribution ("…, Reuters reports").
  - No clause before the verb, no parentheses, no lists, no "huge".
- **Humour** *(our rule; tone from the BRIEF)*:
  - At most one dry line per episode, as a separate final sentence of the last item.
  - It runs 3–8 words, with no new fact, no number and no name.
  - Deadpan only: no puns, no "!" and no "wow".
  - Never on a grave item or right after one.
  - The segment carries `wry: true` (a new field), so the line can be counted and dropped cleanly (see "Runtime hooks").
- **Signposts** *(our rule)*:
  - Nothing between items: "meanwhile" and "next up" are banned. The cut and the tick do that job.
  - Intro (templated): "This is NEWS IN 60. I'm Sam Night."
  - Round-up opener: "Around the world." Not "in 30 seconds": a round-up of 2–3 items runs about 12–22 s here, so that phrase would be false.
  - Sign-off (templated): "That's the minute. COSMOS DESK is next." The next title comes from the rotation.
- **Numbers and places** *(our rule)*:
  - One figure per item, in digits with its unit ("40 percent"), as precise as the summary is.
  - City first; add the country only when it is needed.
  - On map items, the place comes within the first three words, so the pin lands with it.
- **Emotion:** `neutral` or `serious`; `happy` only on a light last item. "Grave" means the story's new `grave` flag (see "Runtime hooks").
- **Presenter config** *(our rule)*:
  - Sam's personality in channel.json reads "relaxed rolling-news anchor, concise, friendly, gets straight to the point".
  - Suggested: "calm late-shift anchor, concise and exact, dry when it fits, gets straight to the point".
  - The `style` string should drop "rapid-fire" (proposed text under "Runtime hooks").

### Structure (built live by the producer)

**Running order:** normally 5 stories, or 6 when 2–3 of them form a round-up; the fit step decides. Round-up items count toward `stories`.
1. **Open** (4 s), then a hard cut on the downbeat [AD §4].
2. **Intro**, templated, about 3 s.
3. **Lead story.** A `breaking` item always goes here.
4. **Items** from mixed categories.
   - If 2–3 candidates have a validated gazetteer location, they form one round-up on the map, after the first item.
   - Otherwise there is no round-up.
5. **Picture hold** (optional, 2.5 s): the last item's FULL picture stays on screen after its last word, with the bed only. No voice and no strap [R5].
6. **Outro** (templated), then the **end card** (2 s): "NEXT · COSMOS DESK".
   - No clock time on it: breaks are elastic (`server/station.js`), so a printed time could be wrong.

**Timing model:** T runs from the downbeat to the last word of the sign-off.

T = 0.3 s (first word after the cut) + words ÷ 2.83 words/s (170 wpm, pauses included) + 0.7 s × (segments − 1), plus 2.5 s if there is a picture hold.

| Running order | Words | T at 165 / 170 / 175 wpm |
| --- | --- | --- |
| Lead + 4 items (8, 36, 4×27, 7) | 159 | 62.3 / 60.6 / 59.0 s |
| The same at 150 words | 150 | 59.0 / 57.4 / 55.9 s |
| The same at 163 words | 163 | 63.8 / 62.0 / 60.4 s |
| Lead, item, 3-item round-up (3 + 3×15 words), item | 153 | 60.8 / 59.2 / 57.7 s |
| Lead + 3 items (fallback) | 132 | 51.8 / 50.4 / 49.1 s |
| 6 ordinary items, before the fit step | 186 | 72.8 / 70.8 / 69.0 s |

What this means:
- **Budget:** 150–163 words.
- **Minimum for a full-length episode:** 5 stories, either lead + 4 items or lead + item + round-up + item.
- **4 stories reach 55 s only at the edge:** 52.9 s with typical parts and the picture hold, and 55.0 s with every part at its maximum and the hold. So they are a fallback, not a format.

**Fit step:** a new producer stage after `review` and before `assets`. It is deterministic. It works from word counts, or from voice timings when the voice is already rendered.
1. The writer is asked for 6 stories (`stories: 6`).
2. **Candidates:** the full script, then the script with one droppable story removed, then two, down to 5 stories.
   - A droppable story is not the lead, not a round-up item and not breaking.
   - Drop from the tail. If the last story carries `wry: true`, drop the one before it instead.
3. **Pick:** compute T for each candidate, with and without the picture hold. The hold is only possible if the last item has an image.
   - Pick the T closest to 60 s.
   - If two are within 1 s of each other, keep the one with more stories.
   - Example: a 6-story episode with a 2-item round-up (8, 36, 27, 18, 15, 27, 27, 7 words) has 165 words and lands at 63.4 s. Without one item it is 53.2 s, or 55.7 s with the hold. 63.4 s is nearer to 60, so all 6 are kept.
4. **Too short:** if the best T is under 55 s, air it anyway and log `short: true`. Never pad with words, and never slow the voice below 165 wpm.
5. **Dropped stories** leave `episode.storyIds`. So producer.js:56–57 marks them offered rather than covered, and they can air in the next hour.
6. **Late production:** if a tail item's voice is still missing at air time, drop that item, even if the episode becomes short.

### Set and light (`flash` theme, `public/js/set.js:267`)
- **Background:** one step darker than WORLD NOW: black and ink, with a Bayer 4x4 falloff to slate behind the head. No bokeh, no windows [AD §3; "one step darker" is our rule].
- **Key:** neutral white, 5000 K in feel, slightly camera-left [R10, AD §3].
  - Faces are untinted (`P.skin` and `P.skinShade`).
  - A 1 px `P.silver` rim.
- **Face first:** measured on the studio layer, meaning the set and the presenter. The graphics overlay and pictures are excluded.
  - The face's mean L\* is at least 60 (`P.skin` is L\* 72.9).
  - The head zone is a 12 px ring around the head. Its mean L\* is at most 35, and its brightest pixel at most 45.
  - So the face is at least 25 L\* brighter than the head zone. This replaces "two palette steps darker" [AD §3 values].
  - No studio patch of 4×4 px or more is brighter than the face mean, except eye glints and collars.
  - Graphics are exempt, because real straps carry white and yellow text that is brighter than faces [R9]. Instead, the yellow is kept small (see Graphics).
- **Accent** *(our rule)*: `P.yellow` (L\* 77) only, and only as thin or small marks: the dial ticks and one steady 1 px desk LED line. In set.js:
  - `led`: [P.orange, P.yellow, P.white] becomes [P.slate, P.yellow, P.yellow].
  - `glow`: P.yellow becomes none, so the wall throws no spill.
  - `tint`: P.cream at 4% or less. This overrides ART_DIRECTION's "orange ≤ 8%", because orange next to yellow reads as candy.
- **Budgets** *(our rule)*: yellow at most 1.5%, and saturated colours at most 6%, of studio-layer pixels, excluding pictures. AD caps saturation at 10%; we go lower.
- **The wall dial** is seen only in the WIDE intro and outro. It has two static states, with no ticking and no blinking:
  - **Intro:** 60 ticks in `P.slate`, with the 12 o'clock tick and the numeral "60" in `P.yellow`.
  - **Outro:** all 60 ticks in `P.yellow`, because the minute is done.
  - **Position:** in the wall's upper half, or in the third away from Sam's head [AD §3 solo rule].
  - **Override:** this replaces ART_DIRECTION's "60 s ring ticking once per second".
    - During stories, the strap's rule is the counter.
    - A ring ticking real seconds would disagree with a show that runs 57 or 63 s.
    - Today set.js:920–924 counts down every second in orange with a "SEC" label. That goes.
- **Picture box in MCU-L** [R8; the colours are our rule]:
  - A 1 px `P.steel` frame instead of studio.js's white one. White is L\* 100, brighter than the face.
  - No accent bar under the box (studio.js:199–205).

### Camera and directing (runtime, seeded per episode)

**Shot names and the code behind them.** The seed is a hash of the programme id plus the story ids. It replaces `Math.random` for the pan direction in director.js:63, for every programme.

| Name here | `setShot` value | Produced by |
| --- | --- | --- |
| WIDE | `wide` | set.js solo layout; intro and outro only |
| MCU-L | `close`, when the story has an image | studio.js:190–206: close-up on the left, picture box at x 248 |
| MCU | `close`, with no image | The same code, centred |
| FULL | `full` | studio.js full-screen picture |
| MAP | `map` | The world-map scene |
| FACT | The director's `fact` beat | A card |

- For news-60, the director ignores the writer's `shot` field, except `map` on round-up items.
- The writer prompt's "wide otherwise" default (writer.js:151) never reaches the screen, because `wide` falls back to `close` for a solo cast (director.js:335).

**The plan**
- **Intro:** WIDE, with the dial in its start state [AD §5].
- **Outro:** WIDE, with the dial complete. Hold 1 s after the last word, then cut to the end card.
- **Lead:**
  - One shot per sentence, alternating MCU-L and FULL and starting on MCU-L. Never cut away during sentence 1 [AD §5].
  - With no image: MCU for sentence 1. Then FACT if the lead has a `fact`, or else stay on MCU.
- **Other items:** one shot per sentence, cut on the first word of each sentence (±2 frames).
  - **With an image,** the two sentences get MCU-L and FULL. The seed picks the order per item.
    - The item after the round-up opens on MCU-L.
    - When the picture hold is planned, the last item ends on FULL.
  - **With no image:** MCU for the whole item.
- **Round-up:** one MAP shot. Each pin is its own framing.
  - The pan to the next pin takes 0.7 s (ease in-out, whole pixels).
  - It fills the 0.7 s gap between items, so it starts on the last word and lands on the next first word.
- **Shot lengths** [R7, AD §5]:
  - Studio shots (WIDE, MCU, MCU-L): 3–12 s.
  - FULL: 3–8 s, or up to 10.5 s with the final picture hold.
  - MAP: 3–8 s per pin.
  - A sentence shorter than 3 s shares the next sentence's shot.
  - Cut, never dissolve.
- **Sam in vision:** in at least one shot of every item except round-up items. The round-up (at most 22 s) is the only stretch without him *(our rule; NowThis [R3] shows less presenter can work, and AD §5 keeps the single)*.
- **Camera:** the studio camera is locked, with 0 px drift [AD §3].
  - FULL pictures may pan at no more than 4 px/s at peak, and zoom no more than 3% *(our rule)*.
  - studio.js:181–186 pans a 32×18 px margin with an ease-out over 16 s, which peaks near 7 px/s right after the cut.
  - news-60 needs a gentler curve, for example a sine in-out, which peaks at about 3.6 px/s.
- **Gestures** *(our rule)*:
  - At most 2 per episode, from `nod`, `lean_in` (lead only) and `papers` (outro only).
  - None from the cues.js `light: true` set, and no `wave`, `point_screen` or `raise_hand`.
  - Enforced on the server and in the director's defaults (see "Runtime hooks").
- **Breaking lead:** only a colour change: the chip and the bar turn red [AD §4, R9].
  - No `breakingCard` and no stinger in this programme. director.js:353–357 shows one today *(our rule: a 3 s card is 5% of the show)*.

### Graphics
- **The strap is the shared lower third** (`public/js/graphics/strap.js`). It is one block from the lead to the last item, never off in between [R9, AD §4].
  - **Tag chip:** `P.yellow`, with `P.black` 5x7 text: the kicker or category ("BUSINESS", or "AROUND THE WORLD" on round-up items via writer.js `applyFeatures`).
    - Its width is the text plus 10 px, as strap.js already draws it.
    - That is 0.4–1.6% of the frame: "TECH" is 363 px, "AROUND THE WORLD" 1,089 px and an 18-character kicker 1,287 px.
    - The full-width yellow row in revision 1 took 4.6%.
  - **Plate:** the source in 3x5 micro type, `P.silver` on `P.black`, as strap.js already does. No item counter ("2/5"): the rule is the one counter.
  - **Headline bar:** `P.ink`, with `P.white` 5x7 caps, present tense, no articles, at most 36 characters. AD §4 allows 45 *(36 is our rule)*. The mechanism is under "Runtime hooks".
  - **Breaking:** the chip turns `P.red` with `P.white` "BREAKING", and the bar turns red, as strap.js does [R9].
  - **Motion:** the shared timings, with no overshoot [AD §4]:
    - In: 0.35 s, ease-out. The text follows 0.1 s later.
    - Flip on each item: 0.3 s.
    - Out: 0.25 s.
  - **On and off:** the strap enters 1 s after the lead's first cut (director.js:386). It starts its exit 0.4 s after the last item's last word, so the full rule is seen. There is no strap during the picture hold or the outro.
- **Progress rule** [R1; the mechanics are our rule]:
  - The strap's 1 px top line (strap.js:194–197, drawn in the tag colour today) becomes a track with a fill: a `P.slate` track and a `P.yellow` fill, from x 19 to x 365 (346 px).
  - It starts at 0 on the lead's first word and reaches 346 px on the last item's last word, ±0.2 s.
  - Width = floor(346 × progress), in whole pixels with no anti-aliasing.
  - It is the one sanctioned linear motion in the channel, like a clock hand. The BRIEF's "no linear moves" is about eased moves, and a rule that eased would lie about time.
  - At each item cut, the remaining time is re-estimated so the rule lands on the last word. If speech runs long, it waits at 345 px. If speech ends early, the last pixels fill within 0.2 s after the last word.
  - It never shrinks.
- **Graphics yellow budget:** the chip plus the rule cover at most 2.0% of the frame on story shots. Cards are excluded.
- **Top row:** the standard bug and clock.
  - The programme tag stays up for the whole episode. director.js:276 hides it after 15 s today.
  - This overrides AD §4's "about 8 s", because the show is only a minute long *(our rule)*.
- **Ticker band:** a static next plate that reads "UP NEXT  COSMOS DESK" for the whole episode. No scrolling and no flipping [R9].
- **Map:** a 3x3 `P.yellow` pin with a 1 px `P.black` outline. The place name is `P.white` on a `P.ink` plate *(our rule)*.
- **Fact card:** at most one, on the lead only [AD §5].
  - A 2x `P.white` figure with a micro `P.fog` label.
  - It enters in 0.25 s, holds at least 3 s, then cuts out.
- **The open:** the hand in `public/js/scenes/opens/flash.js` is red (in the header and the drawing code). Request to the opens owner: a `P.silver` hand with a `P.white` hub, so that red stays in the bug, LIVE and BREAKING *(our rule)*.

### Music and sound

Three different things share the name "flash" or "FLASH":
- **`public/js/scenes/opens/flash.js` `FLASH`** (line 122) is the open's visual style object, not audio.
- **`public/js/audio/themes.js` `'news-60'`** (line 195) is the 4 s open cue that is live today.
- **`public/js/music/proposals/broadcast/packages.js` `FLASH`** ("Countdown") is a bed proposal that is not live yet. The live client has no programme beds: `audio.js` plays only the open tune, stingers and sound effects.

**Rework the open cue, themes.js `'news-60'`** (audio/opens owner)
- **Today:**
  - 150 BPM in G.
  - A `pulse50` lead plays the signature up to the octave.
  - `pluck` ticks fall on every eighth note, over a `pulse25` bass.
  - An `X` drum hit lands on every beat, then hats, kick and snare run into the hit.
  - A G-major bell chord (G B D G) closes it.
  - The file header calls the colour note "done, next!" (line 9).
- **Replace with** *(our rule, from the tone correction and R4)*:
  - 120 BPM, with H still on the lock-up.
  - The lead on a low-passed `pulse25` or triangle, at lower gain. Keep the octave colour note.
  - Ticks low-passed to 2 kHz or less, on off-beats only.
  - Drop the `X` hit on every beat, the hat run and the snare. Keep one soft kick on the hit.
  - A Gadd9 bell chord (G B D A) instead of the octave triad.
  - Header comment: "the minute starts", not "next!".

**Bed:** whichever music proposal is adopted; the broadcast `FLASH` is the closest.
- **Tempo and key:** 120 BPM, E minor / G major *(our rule)*.
  - The broadcast `FLASH` now runs at 150 BPM, the same as the open; it was 132 BPM earlier today. With the open at 120, both come down together.
  - At 120 BPM the tock (beats 1 and 3) and the tick (beats 2 and 4) fall on whole and half seconds: a clock rather than a race.
  - Its header ("urgent but light", "done - next story") needs the same tone change.
- **What plays:** from the downbeat to the sign-off, only `FLASH`'s `story` bed: a pad, a staccato bass on each beat and a soft tick-tock.
  - Not its `headlines` bed (pulse ostinato, timpani, motif).
  - Not the `osti`, `timp` and `motif` layers of its `outro` bed under speech.
  - No melody under speech.
- **If the lofi proposal wins:** use its `'news-60'` palette (palettes.js, 92 BPM today) at 120 BPM, with the `story` arrangement and the news-60 override that keeps the tick.
- **Levels** *(our rule)*: relative to the voice's speech level, the bed sits at −24 dB under speech (ducked) and −20 dB in gaps with no voice. Attack 50 ms, release 300 ms. The live synth's `DUCK_LEVEL` (−10 dB) is a duck depth, not this target.
- **Ticks:** filtered soft, low-passed to 2 kHz or less, never a click [R4].
- **Item change:** the bed's own tick sound, triggered once on the cut frame, 4 dB above the bed's regular ticks. It is the only sound between items: no stinger, no whoosh *(our rule)*.
- **Grave items (`grave: true`)** *(our rule)*:
  - The tick, the tock and the bass drop out on the cut, and the pad stays alone.
  - In lofi that is the `gravePad` path (cuesheet.js:32). Broadcast needs a pad-only arrangement.
  - We want the pad rather than lofi's default silence, so that a fast show does not lurch into dead air.
- **Picture hold:** the bed only.
- **Signature and bell are separate cues:**
  - The 4-note signature (themes.js `MOTIF`) plays only in the open.
  - The **sign-off bell** is one Gadd9 bell chord (`FLASH`'s `final` chord) on the last word of the sign-off, while the dial shows complete. It is not the motif.

### The title sequence (owner, 9 Oct: as crafted as WORLD NOW's)

6.8 s at 120 BPM on the cue sheet in `public/js/scenes/opens/cues.js`, short for a one-minute show. The pictures (`opens/newstitles.js`) and the theme (`themes.js` `newsTitles`) read the same beats. The minute starts.

| Beats (s) | Pictures | Music |
|---|---|---|
| 0–1 (0–0.5) | Locked off close on the top of the stopwatch: the knurled pusher over the polished bezel, the twelve o'clock tick, the needle's tip. The pusher goes down on beat 1. | G add9 from silence on the pad; one soft click as the pusher goes down |
| 1–7 (0.5–3.5) | The hand sets off and makes one turn at an even pace: a five-minute tick passes on every eighth, and each tick lights as the hand passes. The camera pulls back from the pusher to the whole dial at centre stage. The hand stops dead at twelve. | The bed's tick-tock: a staccato tri on each beat, a low-passed tick off it. Each is the passing of a five-minute tick. The last tock is the stop. |
| 7.5 (3.75) | "60" lights, as on the emblem (slate, orange, yellow) | Silence: the minute is done |
| 8–12 (4–6) | The package's reveal (from 4.35 s) | The signature on the low-passed pulse with its octave ("the minute starts"), over the tick-tock, C/G and G sus2 |
| 12–13.6 | Still for the cut | A Gadd9 bell chord and one soft kick on the hit, then the button |

**The stopwatch is the emblem's own.** Every band of it (face, inner wall, bezel, ticks, hand, crown) is the emblem's pixels at centre stage and grows in proportion beyond it. Close up, it is a machined object:
- a polished convex bezel with its glint;
- a knurled pusher, modelled as a cylinder;
- printed ticks with a lit edge and a shaded one;
- the minute track's rules and fifths.

The finest of that detail (rules, fifths, knurling) goes while the camera moves fast. Within two pixels of centre stage, the renderer uses the emblem's own rasterisation: midpoint rings, rounded tick points, and the hand walked with Bresenham. From the settle on, it is the emblem's drawing (`flash.js` `drawDial`), tested pixel for pixel.

**Motion rules:**
- The close-up holds still until the pusher goes down.
- The pull-back never moves detail more than a few pixels a frame.
- The hand's blur is the wedge it swept over two frames, thinned to its width, so it never lights a pixel for a single frame. It thins away before the dial reaches the emblem's size.

No whooshes, sirens or counting digits; the only digits are the emblem's "60".

### Transitions
- **Into the show:** the ident and open run as the channel does, then a hard cut on the downbeat into the intro [AD §4].
- **Between items:** a cut, the strap text flip and the tick. Never a stinger, whoosh or wipe [AD §4].
- **Into the round-up:** cut to MAP on "Around the world."
- **Ending:**
  1. The last item ends, then the picture hold (if planned) while the strap exits.
  2. Cut to the WIDE outro.
  3. Cut to the end card, with no stinger (director.js:296 uses one today).
  4. The break's own stinger (0.8 s) [AD §4].

### Do / Don't
**Do:**
- Make the strap readable on mute.
- Keep one idea per item.
- Make the face the brightest thing in the studio.
- Use yellow as small instrument marks.
- Keep a steady voice and a low bed.

**Don't (childish or cheap):**
- A bouncing stopwatch, or a stopwatch with a face.
- "TICK!" captions, or "!" anywhere.
- Rainbow item colours, flashing digits, or counting seconds aloud or on the wall.
- A sped-up voice.
- Whooshes or sirens. Ticks under deaths.
- A screen full of boxes (the HLN counter-reference).
- Ticker, strap and dial all moving at once.
- Waves or thumbs-ups. Camera drift.

### Runtime hooks and required changes

**Proposed config** (`config/channel.json`, `programs["news-60"]`)

| Key | Today | Proposed |
| --- | --- | --- |
| `stories` | 5 | 6 (the fit step trims to 5 when there is no round-up) |
| `style` | "Rapid-fire headline round-up by a single presenter. …" | "The headlines in one minute, read by one calm presenter. One idea per story: the fact, then one detail and the attribution. No teasers, no signposts between stories, no banter. At most one dry closing sentence on a light final story, never near grave news." |
| `storyLength` | "1 or 2 short sentences, max 200 characters" | "lead story 2 or 3 sentences, 32 to 38 words; every other story exactly 2 sentences, 25 to 28 words; round-up items exactly 1 sentence, 14 to 18 words; no sentence over 18 words". There is no character cap, because time depends on words, and writer.js clips text at 520 characters anyway |
| `headlineMax` (new) | — | 36 |
| `roundup` (new) | — | `{ "opener": "Around the world.", "min": 2, "max": 3 }` |
| `frame` (new) | — | `{ "intro": "This is {title}. I'm {presenter}.", "outro": "That's the minute. {next} is next." }` |
| `gestures` (new) | — | `{ "allow": ["nod", "lean_in", "papers"], "max": 2 }` |
| `timing` (new) | — | `{ "target": 60, "accept": [55, 65], "wpm": 170, "minStories": 5, "pictureHold": 2.5 }` |
| `wry` (new) | — | 1 (the maximum number of dry lines per episode) |

`validateChannel` in channel.js checks only title, tagline, style and storyLength (line 43). It must validate the new optional keys the way it validates `features`: their types and ranges.

**Code changes, by owner area**
1. **writer.js** (editorial)
   - **Round-up:** when `program.roundup` exists, `buildPrompt` uses its opener and its min and max instead of the global `FEATURE_RULES.roundup` text ("around the world in 30 seconds", "two to four", writer.js:28). `MAX_ROUNDUP` (writer.js:22, set to 4) becomes `program.roundup.max`.
   - **Headline:** the prompt's "max 48 characters" (writer.js:38) and `LIMITS.headline` 56 (writer.js:19) become `program.headlineMax` in the prompt.
     - The standards review is asked to rewrite any longer headline.
     - The validator removes articles ("the", "a", "an").
     - If the headline is still too long, keep it whole up to 56 characters (the strap has room for about 56) rather than cutting it at an arbitrary word.
   - **New story fields:**
     - `grave` equals the existing `heavy` (writer.js:370): emotion `serious` or `sad`, or facts.js `isGrave`.
     - `wry` is true only on the last story, when neither it nor the story before it is grave. Otherwise the validator drops the last sentence and the flag.
     - Add both fields to `SEGMENT_SCHEMA`, and to the review prompt's "keep the same JSON structure" list.
   - **Cue policy:** after `parseCues` (writer.js:351), keep only actions in `program.gestures.allow`, at most `max` per episode, with `lean_in` only on the first story and `papers` only on the outro. The global prompt line (writer.js:142: "1 to 3 cues per segment … wave when greeting") stays for the other programmes.
   - **Frame:** replace the writer's intro and outro text with the templates, with emotion `neutral` and cues from the policy. `{next}` comes from the producer.
2. **producer.js and station.js** (editorial/server)
   - Pass the next programme in the rotation into `produce()`. station.js:68 knows the rotation index, and `upNext()` (line 103) already computes the next one.
   - Add the `fit` stage after `review` (producer.js:17–20).
   - Write `episode.plan = { seed, estimate, pictureHold, next }` for the client.
3. **providers/mock.js** (editorial)
   - For news-60, combine and pick summary sentences so that each part lands within ±3 words of the ranges above (it may only reuse the feed's own words, so exact ranges are not required).
   - Use the templated intro and outro, and "Around the world." instead of "Now, around the world in 30 seconds." (mock.js:282).
   - No `[wave]` (`GREETINGS` and `SIGNOFFS_SOLO`, mock.js:61–73).
   - Acceptance #1 runs on mock output after the fit step.
4. **director.js** (a hub file, so surgical edits only)
   - Build the shot plan from `episode.plan` (table above).
   - Seed the pan direction (line 63).
   - `defaultCues` (lines 207–215) must not add `wave`, `point_screen` or `raise_hand` when the programme has a gesture policy. Treat the server's cue list as final, even when it is empty.
   - No `breakingCard` and no stinger for news-60 (lines 353–357).
   - Keep the programme tag up for the whole episode (line 276).
   - Strap exit after the last item, and the picture hold.
   - A cut, not a stinger, to the end card (line 296).
   - Feed the progress value to the strap.
5. **graphics** (strap.js, ticker.js): the progress track and fill on the strap's top line; the static next plate in ticker.js.
6. **set.js and studio.js** (studio): the flash theme values, the two dial states and the picture-box frame.
7. **audio/themes.js** (audio) and the chosen music proposal (music): as described under "Music and sound".
8. **tools/voice/measure.py** (voice): `TARGET_WPM` for sam goes from 185 to 170.

## 4. Acceptance checklist

1. **Duration.** Take 10 seeded offline episodes (mock provider, fixtures with at least 6 usable candidates). After the fit step, every episode with 5 or more stories runs 55–65 s from the downbeat to the last word of the sign-off. The end card lasts at most 2.5 s. Any 4-story fallback runs at least 48 s and is logged `short: true`.
   - Measure on the fit step's estimate, and on rendered neural-voice word timings for at least 3 of the episodes.
   - Browser mute mode (`MUTE_CPS` of 15 characters per second in audio.js) is not a timing reference.
2. **Pace and words.**
   - Pace is 165–175 wpm per segment, measured with measure.py's method.
   - No sentence runs over 18 words.
   - With the AI writer, at least 90% of parts are in range: the lead 32–38 words, other items 25–28, round-up items 14–18. With the mock provider, every part is within ±3 words of those ranges.
   - The script totals 141–167 words after the fit step, intro and sign-off included (the range the part limits allow), and at least 8 of 10 episodes sit in the 150–163 target. The mock: 138–170.
3. **Stories and tone.**
   - 5 or 6 stories, as chosen by the fit step; 6 normally only with a round-up of 2–3 items.
   - At most one segment has `wry: true`. It is on the last story, and neither that story nor the one before it has `grave: true`.
   - No "!" anywhere in the text or the headlines.
4. **Cuts.** Every item change is a straight cut within 2 frames of the item's first word. Every other cut inside an item lands within 2 frames of a sentence's first word (pans between map pins are not cuts). No stinger plays between the open and the end card, breaking news included.
5. **Shots.**
   - Studio shots run 3–12 s; FULL 3–8 s (up to 10.5 s for the final hold); MAP 3–8 s per pin.
   - Sam is in vision in every item that is not in the round-up.
   - The round-up block lasts at most 22 s.
6. **Strap.**
   - It is on screen from the lead to the last item's last word, never off in between.
   - At least 90% of headlines are 36 characters or less. All of them are 56 or less, and none ends in an article, preposition or conjunction.
   - **Mute test (machine):** for every item, `wordsGrounded(headline, item text)` from facts.js is at least 0.5.
   - **Mute test (human):** show 5 strap frames with the sound off. A reviewer must state the gist of at least 4 of them.
7. **Progress rule and dial.**
   - The rule moves in whole-pixel steps only and never shrinks.
   - It reaches 346 px within ±0.2 s of the last item's last word, and stays full for at least 0.2 s before the strap starts its exit.
   - The dial shows its start state in the intro and its complete state in the outro, and never animates on screen.
8. **Colour.**
   - Graphics yellow covers at most 2.0% of the frame on story shots.
   - On the studio layer, yellow covers at most 1.5% and saturated colours at most 6%, pictures excluded.
   - Red appears only in the bug, LIVE and BREAKING.
   - Text on yellow is `P.black`.
   - Measure the graphics share by capturing the same frames with the overlay on and off.
9. **Camera.** 0 px drift in studio shots. Picture pans peak at 4 px/s or less.
10. **Sound.**
    - The bed sits at −24 dB ±2 relative to the voice under speech, and −20 dB ±2 in gaps.
    - Under `grave: true` items the music has no tick or bass energy (pad only).
    - Exactly one accent tick on each item cut, and no other sting between items.
    - The bell lands within 0.2 s of the end of the sign-off's last word.
    - No motif notes under speech.
11. **Gestures.** At most 2 per episode, counting the director's defaults: only `nod`, `lean_in` (lead only) and `papers` (outro only). None from the `light: true` set.
12. **Map.** Each round-up item shows a pin and a place label. Pans take 0.6–0.9 s, and each pin holds at least 3 s.
13. **Motion.**
    - No easing curve goes above 1.0 (no overshoot).
    - The progress rule is the only linear motion.
    - At most three zones move in any frame.
    - The next plate never moves.
14. **Face.** On the studio layer:
    - The face's mean L\* is at least 60.
    - The head zone's mean L\* is at most 35, and its brightest pixel at most 45, so the difference is at least 25.
    - No studio patch of 4×4 px or more is brighter than the face mean, except eye glints and collars.
15. **Kids' test.** Show a critic 6 random frames. If they would call it a children's show, it fails. Any cute or bouncy element is a BLOCKER.
