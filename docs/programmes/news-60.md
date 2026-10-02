# NEWS IN 60 — style bible

Rapid headline round-up, about one minute, Sam Night solo. Builds on `docs/ART_DIRECTION.md`; only the differences are stated here.

Research note (2026-10-02): the egress proxy blocked every page fetch I tried (Wikipedia, YouTube and its thumbnails, BBC, Press Gazette, Typito, 1News, ABC), so I could not view any frames. All claims come from search-engine summaries of the linked pages. Set, lighting and camera details for these references could not be checked, so none are claimed; the rules in section 3 are derived from what the sources do say plus `docs/ART_DIRECTION.md`.

## 1. Identity

The image is a stopwatch on a dark desk. A calm adult gives you five things that matter in the time it takes a kettle to boil, and you leave briefed, not rushed. The speed comes from the editing (one idea per item, hard cuts, a strap that never leaves the screen), never from fast talk. It is for viewers dipping in between longer shows, and for anyone watching on mute. WORLD NOW is the warm red-and-navy two-shot. NEWS IN 60 is darker, sharper, single-voiced, with yellow used like the markings on an instrument.

## 2. Real references

**BBC Three "60 Seconds" (2001–2016)**
- Format: hourly from 7pm, five stories of about 10 s each, with pictures under each story. A countdown sat in the corner, and a line crossed the screen counting down the seconds ([Wikipedia](https://en.wikipedia.org/wiki/60_Seconds), [IMDb](https://www.imdb.com/title/tt0300707/plotsummary/)).
- It began in a "colourful studio" with a Faithless soundtrack. It was then given "a more serious look": the presenter stood in a newsroom with a screen behind, and the rave music was dropped ([Wikipedia](https://en.wikipedia.org/wiki/60_Seconds)).
- The 2008 refresh brought new graphics and a Music 4 theme remix ([Music 4](http://www.music4.com/music/catalogue/540/bbc-three/bbc-three-60-seconds.html)).
- **Take:** five items of about 10 s, a picture under each, a visible progress line, and none of the youth look.

**90-second bulletins: BBC One, Sky, ABC, 1News**
- BBC One's "News Summary" (1986–2018) was 90 s with one newsreader: a minute of national and world news, then 30 s of regional news ([Wikipedia](https://en.wikipedia.org/wiki/BBC_News_Summary)).
- I found no Sky News-branded 90-second bulletin. The nearest are "SSN in 60 Seconds" on Sky Sports News ([Sky Sports](https://www.skysports.com/football/news/11095/11500246/sky-sports-news-in-60-seconds-all-the-latest-headlines)) and IRN's overnight "IRN90" for younger radio stations, which was dropped when Sky News Radio took over in 2009 ([Wikipedia](https://en.wikipedia.org/wiki/Independent_Radio_News)).
- ABC Australia's "News in 90 Seconds" runs 1:53 in one listed edition ([ABC](https://www.abc.net.au/news/newschannel/news-in-90-seconds)). 1News (New Zealand) has a reporter-made morning edition ([1News](https://www.1news.co.nz/2026/10/02/news-in-90-seconds-october-2/)).
- **Take:** the title promises brevity, not a stopwatch. Accept 55–65 s rather than cut a sentence.

**NowThis**
- It moved to 15 s videos and replaced the anchor with on-screen text: "We were wasting time with people on camera" ([Digiday](https://digiday.com/media/nowthis-news-rebrands-mobile-social-world/)).
- One typeface (Calibre) in black, white and "a dash of yellow", with key words larger and bold ([Typito](https://typito.com/blog/how-to-design-videos-like-nowthis/)).
- 85% of Facebook video is watched without sound ([Digiday](https://digiday.com/media/silent-world-facebook-video/)).
- **Take:** the strap must tell each story alone, and Sam is in vision less than in other shows.

**CBS: the "60 Minutes" stopwatch, not "Up to the Minute"**
- "Up to the Minute" was a multi-hour overnight show (1992–2015) with a single anchor from 1993 ([Wikipedia](https://en.wikipedia.org/wiki/Up_to_the_Minute)). We borrow only that lone late-night register.
- The useful CBS asset is the 60 Minutes tick on the open and the break bumpers. Edd Kalehoff notch-filtered it on a Moog because amplified ticking sounded like "rattling garbage can lids" ([Network News Music](https://www.networknewsmusic.com/60-minutes/), [Smithsonian](https://americanhistory.si.edu/collections/object/nmah_1211921)).
- **Take:** a tick reads as premium only when filtered soft. Our open already uses a dial (`public/js/scenes/opens/flash.js`).

**Euronews "No Comment"**
- Launched in 1993 without presenters. "No Comment" runs pictures with no voice-over ([Wikipedia](https://en.wikipedia.org/wiki/Euronews), [Euronews](https://www.euronews.com/nocomment)).
- **Take:** one 2–3 s picture with no voice before the sign-off, an adult kind of restraint.

**Radio pacing**
- Newsbeat cut its breakfast headlines from 3 to 2 minutes in 2024 ([Deadline](https://deadline.com/2024/04/bbc-butchers-radio-1-breakfast-news-bulletins-greg-james-1235882812/)). Its presenters were reportedly told to use short words and talk as if to a friend ([Wikipedia](https://en.wikipedia.org/wiki/Newsbeat)).
- British radio favours 3 words per second, 180 wpm ([Boyd, *Broadcast Journalism*](https://www.oreilly.com/library/view/broadcast-journalism-6th/9780240810249/xhtml/ch17.xhtml)). Listeners rate 170–190 wpm as "normal", and faster than that overloads them ([Journalist's Resource](https://journalistsresource.org/media/radio-news-pace-words/)).
- ITV bulletins have a median shot of 6.3 s (minimum 2.7 s) within a fixed structure ([Redfern](https://www.researchgate.net/publication/263129239_The_structure_of_ITV_news_bulletins)).

**Counter-references**
- Headline News' 2001 multi-box screen was called a "jumbled mess" and was scaled back in 2005 ([CNN](https://edition.cnn.com/2002/US/08/02/hln.behind.intro/index.html), [HLN summary](https://kids.kiddle.co/HLN_(TV_network))).
- MSNBC stopped scrolling its ticker in 2018 ([Variety](https://variety.com/2018/tv/news/msnbc-removes-news-ticker-1202754729/)).

## 3. Our style

### Delivery and writing (writer prompt and prosody)
- **Pace:** 175 wpm (range 165–185), measured from word timings; set Sam's voice rate to hit it. Never above 190: the urgency comes from the cuts, not the voice.
- **Word budget** (120–145 words in total):
  - Intro: 12 words or fewer.
  - Each item: 18–28 words.
  - Lead: up to 32 words, in 2 sentences.
  - Sign-off: 10 words or fewer.
  - Config `storyLength`: "1 sentence (lead up to 2), 18–28 words, max 170 characters".
- **Sentences:** subject or place first, then an active verb in the present or present perfect.
  - One fact per item.
  - Attribution goes at the end ("…, Reuters reports").
  - No clause before the verb, no parentheses, no lists.
  - Short, plain words. No slang, no "huge".
- **Humour:** at most one dry line per episode: the last clause of a non-grave final item, or the sign-off.
  - Deadpan only.
  - No puns, no "!", no "wow".
  - Never next to a grave item.
  - No banter.
- **Signposts:** nothing between items ("meanwhile" and "next up" are banned); the cut and the tick do the job.
  - A round-up opens with "Around the world."
  - Intro: "This is NEWS IN 60. I'm Sam Night."
  - Sign-off: "That's the minute. [Next programme] is next."
- **Numbers and places:** at most one figure per item, in digits with its unit ("40 percent").
  - At most one decimal place.
  - Keep the precision the summary gives.
  - Say the city first; add the country only when needed.
  - On map items the place comes in the first 1–3 words, so the pin lands on it.
- **Prosody:** falling sentence ends, never upspeak, and stress on each item's first content word.
  - Pauses: 0.25 s at commas, 0.45 s between sentences, and 0.7 s between items (the cut and the tick sit in that gap).
  - Emotion: `neutral` or `serious`; `happy` only for a light last item.

### Structure (built live from feeds)
1. **Open** (4 s), then a hard cut on the downbeat.
2. **`intro`** (3–4 s).
3. **Lead `story`** (9–13 s). A `breaking` item always goes here.
4. **3–4 `story` items** (7–10 s each), from mixed categories.
   - If 2–3 candidates have a validated gazetteer location, they become a `roundup` (`shot: map`, ≤ 16 words each).
   - Otherwise there is no round-up.
5. **Optional picture beat** (2–3 s): the episode's best-scored image, under the music bed only, with a place caption. Skip it if the episode is already over 60 s or has no image.
6. **`outro`** (3 s), then the **end card** (2 s): "NEXT · PROGRAMME · HH:MM".

Target 55–65 s from the downbeat to the last word. If production is late, drop items from the tail; 4 items is fine. Never speed up the voice.

### Set and light (`flash` theme, `public/js/set.js`)
- **Background:** one step darker than WORLD NOW. Black and ink, with a Bayer falloff to slate behind the head. No bokeh, no windows.
- **Light:** neutral-white key (5000 K in feel), slightly camera-left.
  - Faces untinted (`P.skin` / `P.skinShade`).
  - 1 px `P.silver` rim.
  - The face is the brightest area.
- **Accent:** `P.yellow` only, on the dial ticks and one steady desk LED line.
  - Drop `P.white` and `P.orange` from `led`.
  - Remove the `glow` spill.
  - `P.cream` tint ≤ 4%.
  - Saturated pixels ≤ 6%, excluding pictures.
- **Wall:**
  - Idle: the open's stopwatch dial. One tick lights per 1/60 of the planned duration, as steady steps with no blink.
  - During stories: the item picture with a 1 px `P.steel` bezel, and the dial hidden, so only one counter is ever visible.

### Camera and directing (runtime rules, seeded)
- **Shot types:**
  - MCU-L: Sam in the left third, picture on the wall at right.
  - MCU: centred.
  - FULL: picture full frame, Sam in voice-over.
  - MAP.
  - No wide shots.
- **Intro and outro:** MCU. Hold 1 s after the last word.
- **Lead:** MCU-L until the first sentence ends (≥ 3 s), then FULL if there is an image.
- **Other items:** cut on the first word (±2 frames).
  - Alternate MCU-L and FULL by item index + seed.
  - Never more than 2 items in a row without Sam in vision.
  - No image: MCU-L, with the category plate on the wall.
- **Shot rules:**
  - Cut mid-item only at a sentence boundary, and only if the item runs over 7 s.
  - Shots last 2.5–9 s. Cut, never dissolve.
  - Round-up: one MAP shot. Pans take 0.7 s (ease-in-out, integer pixels); each pin holds ≥ 2.5 s.
  - The studio camera stays locked. Pictures may push or pan at ≤ 4 px/s, ≤ 3% zoom.
- **Gestures:** at most 2: `nod`, `lean_in` (lead only), `papers` (sign-off). Never `wave`, `wow`, `thumbs_up`, `fist_pump`, `laugh` or `facepalm`.

### Graphics
- **Strap:** in at 0.6 s into the lead, and stays as one block until the outro.
  - Tag row (11 px): `P.yellow` with `P.black` 5x7 text ("2/5  BUSINESS"), and the source in 3x5 micro type on the right. On a breaking item: `P.red` with `P.white` "BREAKING".
  - Headline bar (17 px): `P.ink` with `P.white` 5x7 caps, ≤ 36 characters, present tense, no articles.
- **Progress rule:** a 1 px `P.yellow` line on a `P.slate` track along the bar's bottom edge (x 19–365).
  - It grows linearly with the planned duration.
  - It lands on the sign-off and never reverses.
- **Motion:**
  - Wipe in: 0.35 s ease-out.
  - Item change: text pushes up in 0.2 s; the bar stays.
  - Exit: 0.25 s.
  - No overshoot.
- **Top row:** the standard bug and clock, with the programme tag up for the whole minute.
- **Ticker:** frozen on one static item, "NEXT: PROGRAMME HH:MM".
- **Map:** 3x3 `P.yellow` pin with a 1 px `P.black` outline; the place in `P.white` on a `P.ink` plate.
- **Fact card:** at most one, on the lead only. A 2x `P.white` figure with a micro `P.fog` label. Enters in 0.25 s, holds ≥ 2.5 s, cuts out.

### Music and sound
- **Bed:** one continuous bed (the existing `FLASH` package).
  - 120–132 BPM, E minor / G major.
  - Muted `pulse25` eighth-note bass, a square pad low-passed at ≤ 1.2 kHz, and a soft filtered noise tick on the off-beats.
  - No melody under speech.
  - Level: 20–24 dB under the voice RMS, with a 3 dB duck on speech onsets.
- **Item change:** one low-passed tick (≤ 120 ms) on each item cut. This is the only sting between items.
- **Grave items:** ticks and bass drop out; the pad stays alone.
- **Picture beat:** bed only, no voice.
- **Signature:** the 4-note signature plays only in the open. It resolves on the sign-off with a `Gadd9` bell chord as the dial and the rule complete.

### Transitions
- **Ident → open:** hard cut on the downbeat.
- **Items:** cut + text push + tick. Never a stinger, whoosh or wipe.
- **Into the round-up:** cut to MAP on "Around the world."
- **Ending:** outro → cut to the end card → break. The only stinger (0.8 s) is the one into the break.

### Do / Don't
**Do:**
- Make the strap readable on mute.
- One idea per item.
- The face is the brightest thing in frame.
- Yellow is a dial colour, not a theme.
- Steady voice, low bed.

**Don't (childish or cheap):**
- A bouncing stopwatch, or a stopwatch with a face.
- "TICK!" captions or exclamation marks.
- Rainbow item colours, flashing digits, or counting seconds aloud.
- A sped-up voice.
- Whooshes or sirens. A ticking bed under deaths.
- A screen full of boxes, or ticker, strap and dial all moving at once.
- Waves or thumbs-ups. Camera drift.

## 4. Acceptance checklist
1. Across 10 seeded offline episodes: downbeat to last word 55–65 s; end card ≤ 2.5 s.
2. Pace 165–185 wpm. Items ≤ 11 s; lead ≤ 13 s.
3. 4–6 items of one sentence each (lead up to two). At most one dry line, no "!", no humour next to a grave item.
4. Every item change is a straight cut within 2 frames of the item's first word. No stingers.
5. Shots run 2.5–9 s. Sam is in vision at least every other item, and in the intro and outro.
6. The strap stays up throughout. Headlines ≤ 36 characters and never truncated; text pushes ≤ 0.25 s.
7. The progress rule and the dial finish on the sign-off (±0.2 s) and never reverse.
8. Yellow ≤ 6% of studio pixels. Red only in the bug or BREAKING. Accent text is black on yellow.
9. 0 px drift in studio shots. Picture moves ≤ 4 px/s.
10. Bed 20–24 dB under the voice, no ticks under grave items, and it resolves on the sign-off.
11. At most 2 gestures, none from the light set.
12. Map items show a pin and the place name. Pans take 0.6–0.9 s; each place holds ≥ 2.5 s.
13. No easing overshoot (curve never above 1.0). Static ticker. At most three moving zones per frame.
14. Faces are the brightest warm area; the background is at least two palette steps darker.
15. Kids' test: show a critic 6 random frames. If they would call it a children's show, it fails; any cute or bouncy element is a BLOCKER.
