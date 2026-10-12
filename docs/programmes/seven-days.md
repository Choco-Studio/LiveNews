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

## 3. To build (visual identity)

SEVEN DAYS is not in the line-up yet. It goes into `config/channel.json` (kind `weekly`, Paco and Lola, the rotation's last slot, the weekday daypart skip) together with:

- **Its own look in the network studio** (`public/js/v2/canvas25d/studio/styles.js`, set dressing). It is a weekend edition of the flagship's room:
  - warmer, softer light;
  - an accent colour of its own;
  - a seven-day motif on the wall's idle content (seven tiles or a week strip);
  - distinct from every other programme's dressing (`test/set-dressing*.test.js`).
- **A pace profile** (`public/js/pace.js`): calmer than WORLD NOW, with room for the boards and the 60 seconds.
- **A title sequence and theme** as crafted as the other five (`public/js/scenes/opens/`, `public/js/audio/themes.js`). The idea is the week turning over: seven days flipping past and settling on the wordmark.
- **The graphics:**
  - the day kicker on each item of THE WEEK IN 60 SECONDS;
  - the STORY OF THE WEEK and THE WEEK IN NUMBERS kickers;
  - the timeline board titled HOW THE WEEK UNFOLDED.
