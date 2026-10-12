# SEVEN DAYS — style bible

The week on GLOBIT 24, retold by Paco Pixel and Lola Lumen at the weekend. Owner, 12 Oct: "Resumen semanal: sí, pero cúrratelo". Programmes must entertain, not only inform. This file builds on `docs/ART_DIRECTION.md` and `docs/programmes/world-now.md` and states only the differences.

## 1. Editorial: only what the channel already told

- **The archive** (`server/archive.js`) keeps every story that went to air for 14 days in `data/archive/<date>.jsonl`, so a restart forgets nothing. For each story it keeps:
  - the presenter's aired words, checked against the sources when they were made;
  - the programme and the time;
  - its picture, place, figures (BY THE NUMBERS), points (WHAT WE KNOW) and quote;
  - the expert's first answer, when an expert analysed it.
- **The week** (`archive.week()`) groups a story's tellings across days with the news desk's `sameStory`. Each story is scored by how much the channel told it: tellings, programmes, days, and twice for a lead.
- **The script** (`server/weeklywriter.js`) needs no AI. It retells the aired words, and nothing new can be invented.
  - "Today" becomes the day it aired ("on Tuesday"); "yesterday" becomes "the day before"; "tomorrow" becomes "the next day".
  - The programmes' furniture is never retold: the number of the day's opener, "And finally", round-up openers, hand-overs and thanks, an expert's introduction, and questions.
  - No sentence is said twice.
- **When it airs:** weekends only, through the clock's dayparts (`{ from: 0, to: 24, days: [1..5], skip: ['seven-days'] }`).
  - At most every 3 hours (`minGapHours`).
  - Only with a week in hand: at least six stories told on at least three days.

## 2. Running order (≈ 5–7 min)

| Part | Who | What |
|---|---|---|
| Intro | Paco | The week's three biggest stories as a headline montage (their aired headlines), then the greeting |
| STORY OF THE WEEK | Paco | The most told story in its fullest telling. HOW THE WEEK UNFOLDED: a timeline board with one point for each day its headline moved on |
| Coverage | Lola | "We came back to that story on four days this week." This is a fact from the archive |
| THE LATEST | Lola | When the story moved on after its fullest telling: the latest day's words |
| Expert's view | Paco or Lola → the expert | When an expert analysed it this week: "On Tuesday, our health correspondent, Dr Amara Pulse, took us through it", then their first answer again, from their studio |
| THE WEEK IN 60 SECONDS | Lola | One story a day, Monday to Sunday, each on its picture: "Tuesday: Tokyo's main index closed at a record high…" |
| The week's desks | Paco and Lola in turn | Up to five more big stories, each led by its section ("On the money pages this week…", "In science this week…"), with their boards |
| THE WEEK IN NUMBERS | Paco | Three figures the channel reported, each in the sentence it aired in, on one board |
| WORDS OF THE WEEK | Paco | A public figure's quote that aired. IN THEIR WORDS re-stages it (the person says it) where the rules allow |
| AND FINALLY | Lola | The week's lighter story |
| Outro | Paco | "That was the week." |

## 3. Look and sound (built)

SEVEN DAYS is in the line-up (`config/channel.json`): kind `weekly`, Paco and Lola, theme `week`, the rotation's last slot, and the clock's daypart `{ from: 0, to: 24, days: [1..5], skip: ['seven-days'] }`, so it airs on Saturdays and Sundays only. A fresh offline desk has no week on air to retell, so the station skips the slot there (`test/offline-rotation.test.js`).

### The set: the flagship's room at the weekend

`studio/styles.js` `'seven-days'` and `studio/dressing.js` `sevenDays`. The architecture is WORLD NOW's (`glassRoom`: the glass, the mullions, the screen's mount and stem, the soffit, the pillars, the black glass desk and its red plate). What changes reads as the weekend at a glance:

- **The light is warm.** The city behind the glass is held at the golden hour whatever the clock says (`sky: 3`, `city.js` phase 3): purple over dark red over rust, the sun going down on the right, the first windows lit. WORLD NOW's city follows the hour, so even at its own golden hour the two rooms differ in the bar, the wall, the lamps and the colour (tested: over 3,500 pixels).
- **Coral, not red.** The cove under the soffit, the pillars' inlays, the desk line, its slits and its foot light are coral (`RAMPS.coral`: the palette's pink, its halo dark red, its outer glow maroon): the flagship's red, softened. The plate stays the network's red. The desk line's sweep of light passes every 28 s.
- **Softer light.** A pair of brass pendant lamps hangs from the soffit in the outer panes, clear of the heads (hand-pixelled domes lit from camera-left, a warm opening under each). Out of focus they are warm bokeh discs.
- **The week bar.** Over the screen, in place of WORLD NOW's world clocks: MON TUE WED THU FRI SAT SUN in micro type, the weekdays steel, the weekend coral.
- **The idle wall.** A week of calendar tiles (seven slate pages with steel caps, M T W T F S S, the weekend's caps coral) over the programme's name, on a field that warms from ink to maroon at its foot (`wall.js` `drawWeek`).
- What moves is the flagship's: a plane crossing the sky, cars on the avenues.

### The title sequence: the week turning over

10.1 s at 90 BPM on the cue sheet in `scenes/opens/cues.js`. The pictures (`opens/weektitles.js`) and the theme (`audio/themes.js` `weekTitles`) read the same beats.

| Beats (s) | Pictures | Music |
|---|---|---|
| 0–1 (0–0.7) | The picture comes up on a row of blank split-flap cards (the emblem's own card: a slate upper flap over an ink lower one, a black hinge gap, the axle's steel pins), the camera already travelling along it. Monday's card flutters through two letters. | A pickup on the bass |
| 1–7 (0.7–4.7) | Each card lands on its day on the beat as the camera brings it to the centre: a big initial, its name under it (MON to SUN). Saturday and Sunday are coral. A soft light round the board (brightest in the gaps between the flaps) warms from a weekday navy to the weekend's dark red as the week goes by. | A mallet climbs the week up the scale, one degree a day (B-flat to A); a clack on each landing, two light ticks for the flutters before it; Rhodes on every landing (Bb add9, Gm7, Cm7, Eb add9, Eb6/9, F6) over a walking tri bass; a soft kick, swung brushes |
| 7–9.5 (4.7–6.3) | The camera drifts past Sunday, stops and pulls back over the whole week, M T W T F S S. A glint runs along the cards' top edges on beat 9. The week's light dissolves into the open's warm field. | The octave B-flat as the whole week comes into view; the strings and an air swell rise under the pull-back; two bells on the glint |
| 9.5–10.5 (6.3–7.0) | The days gather into one stack behind Thursday, closing in to the emblem's size, the outer pairs lowest. | Soft clacks as the pairs land; Eb/Bb (IV over the pedal); the signature begins on beat 10 |
| 11–11.5 (7.3–7.7) | Thursday's card turns over to the coral 7: the emblem. The bit pops from its top-right corner. | A clack and a felt thump as the 7 lands |
| 11.5–14 (7.7–9.3) | The package's reveal: the card glides to its slot, the plate, SEVEN DAYS, the tagline, the credits, the bit hops onto the plate, the top row | The signature on a mellow flugelhorn over Bb add9 and Eb/Bb, its colour (E-flat) over the B-flat pedal, falling 4 → 3 on the hit (Bb6/9) |
| 14–15.2 (9.3–10.1) | Still for the cut | The chord rings; the button on the cut |

**The emblem** (`opens/week.js`): the 7 card with the other days stacked under it (three layers, their edges showing). Every card is drawn pixel by pixel from its true shape at any centre and size (`paintCard`), and the flap's turn is the classic split-flap one: the upper flap falls toward the hinge, darkening as it turns edge-on, then its back opens down over the lower half. The sequence draws its cards with the same function, so at the hand-over the stack and the 7 are the emblem's own pixels (tested: 0 pixels differ).

**Motion rules:**
- While the camera travels, its position is whole pixels: 80 px a beat, 4 px a frame at 30 fps (5 at most as it eases off). The cards slide; they never re-sample.
- The row holds still at a pitch of whole pixels (42 px), and the stack gathers into whole pixels, so neither ever shimmers.
- Each half of a flap's turn stays on screen at least two frames at 30 fps. A turn never goes back.
- The field's dither is fixed on the screen, and its warmth only grows: a pixel turns warm once.

### Theme and sonic signature

- **Key and colour.** B-flat major, the 4th its colour (`COLOURS.week`): the plagal "amen" of a Sunday, heard over the B-flat pedal and falling to the 3rd on the hit. Its breaking, promo and sign-off cues are in B-flat too; the sign-off's colour falls 4 → 3 → 1.
- **Voice.** A mellow flugelhorn (`LEAD.flugel`) carries the signature, over Rhodes, strings and a mallet.
- **The bed** (`music/proposals/lofi/palettes.js` `'seven-days'`): 84 BPM, Sunday soul. Long Rhodes chords that lean on IV (Bbmaj9, Ebmaj9/Bb, Gm9, Cm9 | Ebmaj9, Dm7, Cm9, F9sus), a triangle bass on root and fifth, a warm pad. Brushes in half time play only under the week in sixty seconds.
- **Cue sheet** (`cuesheet.js` `WEEK`):
  - the bed plays under the headlines and the greeting;
  - story copy is dry (the owner's soft switch gives the song's barely-there moment);
  - the week in sixty seconds is a little brighter;
  - And finally and its chat are light;
  - the keys play under the sign-off, and the end card is silent;
  - never under grave news, nor in the segment after it.

### Pace

`pace.js` `'seven-days'`: unhurried and warm, calmer than WORLD NOW.
- More air between stories (story 1.15 s, hand-over 0.95 s, block 1.5 s, 1.4 s before And finally).
- A longer median shot (5.5–8 s), fewer cuts (7 a minute at most) and moves (3).
- The round-up's days keep a brisk 0.7 s step, so the seven days fit their minute; a picture holds up to 9 s.
- The boards are read twice: up to 10 s, and HOW THE WEEK UNFOLDED carries up to five days (`shots.timelineSteps`).
- The sign-off lingers 1.8 s on the wide.

### Graphics

- **Coral is the programme's accent** (`THEME_ACCENT.week`), with dark type on it. The strap's tag carries the weekly's kickers: STORY OF THE WEEK, THE LATEST, THE WEEK IN NUMBERS and WORDS OF THE WEEK, and the day on each item of the week in sixty seconds (MONDAY to SUNDAY).
- **HOW THE WEEK UNFOLDED** (`scenes/cards.js` `drawWeekTimeline`, `boardTitle`): the story of the week as a diary. Each row is a day its headline moved on: the day at 2x, a coral node on a rail that draws down the days, and the day's headline at 1x. There is no source line (the strap carries it), so five rows fit between the top row and the captions.
- **THE WEEK IN NUMBERS** keeps its name on the figures board.
- **The week in sixty seconds** reads each day over its own picture from its first word (`direction/shots.js` `sevenDays`, and the default director's `storyBeats`). The reader is in vision only when a picture failed, never a run of maps.
- The planner plays the flagship's grammar at the weekly's own pace (`SHOT_STYLES['seven-days']`). The expert's re-aired answer joins from their own studio, after the presenter's one-line introduction.

Fixed along the way:
- The full-screen fact card now receives a story's timeline and FROM → TO boards (`studio.js`). Until now it dropped them, so HOW WE GOT HERE and FROM → TO aired as an empty KEY FACT card in every programme.
- The weekly writer never retells "Breaking news" a week later.
- It lowers a few more common openers after a day ("Saturday: biologists have described...").

### Still owed

- The flagship's gestures and listener behaviour are used as they are: no rules of SEVEN DAYS's own.
- The idle wall's week is fixed (the weekend lit). It does not mark the day the programme airs.
- The presenter reading an item of the week in sixty seconds is never in vision while its picture holds. The bed's brushes and the strap's day carry the rhythm.
