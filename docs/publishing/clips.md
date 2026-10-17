# The clip factory

One aired episode goes in. Its best moments come out as finished clips, each one with:

- the vertical picture (Shorts, Reels, TikTok) and the horizontal one (Facebook, X);
- burned-in captions in the channel's own type;
- a hook title and an end card;
- a caption file (`.srt` and `.vtt`), a contact sheet and a cover frame;
- the text for every network;
- the compliance desk's verdict.

The publishable clips go to the queue, waiting for the owner. Everything is a dry run: nothing is uploaded.

    node tools/publish/factory.mjs --episode <episode.json> --out <dir> [--formats vertical,horizontal] [--max 6]
         [--moments <id,id>] [--all] [--queue data/publish] [--keep-masters] [--parallel] [--seconds n]

`tools/publish/material.mjs` makes episodes from the archive offline, with recorded voices, for measuring and
rehearsing. `tools/publish/playback-server.mjs` serves one saved episode to the recorder.

## 1. The steps

1. **Masters.** A playback server (`server/publish/playback.js`) serves the page and the saved episode, nothing else.
   The deterministic recorder makes one lossless master per format in clip mode, at 1x, with its report:

       tools/record.mjs --lossless --progressive --seed 1 --time <aired> --report

   The same seed, item and clock give both formats the same timeline. The factory checks the drift between them; it
   measured 0.000 s on every episode.
2. **The timeline** (§3) from the report.
3. **The moments** (§2), found and scored. In Phase 1 only the light, sensible ones are chosen. Choosing takes the
   best of each kind first, so a programme yields variety; it never takes two clips of the same words, and a moment
   must have aired whole in the recording.
4. **The cards.** The hook PNG and the end card are drawn by the channel's own code in a browser (`/lab/clip.html`).
   The end card is recorded once per programme and format, with its sting.
5. **Each clip** (§4) is cut, titled, scaled and captioned. Then come its contact sheet, its cover, the label check,
   its texts, the compliance verdict per network, and the queue.
6. **The summary** (`summary.json`): every moment with its scores and every clip with its verdicts. The masters are
   deleted unless kept.

## 2. Moments (`server/publish/moments.js`)

Moments are found from the episode's own structure (its segments, boards, speakers and the quiz's parts), never from a
guess at the words.

| Kind | What it is | Base interest |
|---|---|---|
| quiz-question | PAY ATTENTION: a question from its frame to its reveal, opening on the round's card when it is the round's first, with the player's one-line reaction when it follows | 7.5 |
| quiz-round | a whole round, its card to its last reveal: the longer clip TikTok rewards | 7 |
| weather-board | WORLD WEATHER's HOT AND COLD and THE NEXT THREE DAYS | 6.5 |
| weather-story | the weather warning (usually grave) | 6.5 |
| sport-result | FULL TIME: a result with its score card, the SCORE CENTRE | 7 |
| lead | a programme's lead, told with its board | 6 |
| known | a story told over WHAT WE KNOW | 6.5 |
| number | NUMBER OF THE DAY, its figure on the board | 6.5 |
| expert | the expert's answer: the story that asks, the answer, the follow-up (not the thanks) | 6.5 |
| unit8 | COSMOS DESK's UNIT-8: the exchange **with the story it answers** ("Texas. Logged." means nothing alone) | 6.5 |
| montage | the headline montage that opens a programme | 5.5 |
| week60 | SEVEN DAYS's THE WEEK IN 60 SECONDS | 7 |
| stories | two to four light stories in a row, each whole, 25–75 s | 5.5 |
| story | any other light story, whole | 4.5 |

**Sense** starts at 10. Points come off for:

- opening on a sentence that leans on an earlier one ("But…", "He said…", a hand-over; −4);
- pointing back at the programme ("as we reported earlier"; −3);
- not ending on a whole sentence (−2);
- a quote cut open (−5);
- lasting under 10 s (−2).

A moment never starts on such a sentence: its start moves to the first sentence that stands alone. "This is…",
"Here's…" and "And finally:" introduce, so they may open a clip.

**Interest** is the kind's base, plus cues in the words (a number, a superlative, a first, a question), plus a board
on screen, plus a length of 20–75 s, minus 1.5 for a moment that is not light.

**Total** = 0.55 × sense + 0.45 × interest.

**The hook** is the clip's title (`vertical.md` §5). It comes from the kind: the quiz's question type ("HOW MANY? /
PLAY ALONG"), the count of a story run ("4 STORIES / IN 55 SECONDS"), the figure of NUMBER OF THE DAY, otherwise the
story's headline. The headline is always whole (`headlineHook`): 2x when it fits two lines of 16, its own colon part
when that fits, else the whole headline in the body face. A running-order label (AND FINALLY) is never a hook.

**Light or grave.**

- A moment is **grave** when a segment is read sad, is grave by the channel's own measure (`facts.js` `severity` ≥ 2),
  has a grave headline, or is breaking.
- It is **light** when its programme is a Phase 1 programme, nothing in it is grave, and (outside the quiz and the
  weather, which choose their own stories) no story is of a kind the quiz desk refuses as a game (`quiz/desk.js`
  `excludedKind`).
- `publishable(moments, { phase })`: in Phase 1 only light moments, in Phase 2 nothing grave, in Phase 3 all. In
  every phase the sense must be at least 7, and demo data is never published.

## 3. The timeline (`server/publish/timeline.js`)

The recorder logs:

- every **speak** (a segment handed to the voice, its first 60 characters);
- every **sentence** (as its caption goes up);
- every recorded **voice clip** that starts (its exact audio time and length);
- every **cut** (shot), each with its video time.

Each speak is matched to the next segment whose words begin with it, and its sound starts at the voice clip that starts
with it. Each segment's recorded voice carries the time and character of every word and phrase. Together they give an
exact transcript in recording time: every segment, sentence and word.

## 4. The cut (`server/publish/render.js`)

- **Window.**
  - The start is 0.3 s before the first word, but never while the sentence before is still on screen: its voice, or
    its caption, which holds 0.4 s after it unless the next sentence replaces it.
  - When the picture changes in the 1.5 s before the first word, the clip opens on **the first whole frame of the
    change** instead. The change is either the director's cut, or the segment's hand-over to the voice, where its
    strap, card or board change (WORLD WEATHER draws its own shots, so it has only hand-overs). Both are stamped one
    frame before the picture shows them. The start is never after the first word.
  - **A wipe is never seen.** WORLD WEATHER's horizontal picture wipes into each board over 0.42 s from the
    hand-over: the old shot's last frame slides off behind an accent bar, with the previous board or the presenter on
    it. Its first word is said during the wipe, so starting after it would cut the word. Instead the clip **holds the
    board's first whole frame over the wipe** (`hold`), with the sound running underneath. `WEATHER_WIPE` is kept equal
    to the scene's `WIPE_DUR` by a test.
  - The end is 0.55 s after the last word, or one frame before the next cut when that comes within 1.2 s.
  - Both ends fall on whole frames.
- **Compose.** One ffmpeg graph does all of it:
  - the master's window (with its `hold`: the frame at `hold` cloned over the frames before it);
  - the hook laid over it (vertical: the whole clip; horizontal: the first four seconds; never on a horizontal WORLD
    WEATHER board, whose own heading is the hook and sits where the plate would);
  - the end card concatenated (its own picture and sting);
  - a 5x nearest-neighbour scale;
  - H.264 High (yuv420p, CRF 18, a keyframe a second), AAC 160k, faststart;
  - the sound faded in over 0.12 s and out over 0.35 s.
- **Captions.** The `.srt` and `.vtt` files come from the voice's own word times, in pages of two lines of 42
  characters, never overlapping.
- **Contact sheet.** Twelve frames: the first four (the hook in two seconds), evenly through the clip, and the end card.
  Each frame is brought back to the channel's 1x and shown at 2x with its time.
- **Cover.** The frame at 1 s (`thumb.jpg`, `coverAt: 1`).
- **Label check.** Where the clip holds a recreation, every frame of it is checked for the yellow label in its place,
  and the count goes to the compliance gate.

## 5. Lengths per network (`platforms.js`)

| Network | Takes | Ideal |
|---|---|---|
| YouTube Shorts | vertical, 10 s – 3 min | 25–59 s |
| TikTok | vertical, 10 s – 10 min | 61–150 s (the rewards programme pays over a minute: the whole quiz round, the story runs) |
| Instagram Reels | vertical, 5–90 s | 20–60 s |
| Facebook Reels | 3–90 s | 20–60 s |
| X | horizontal or vertical, up to 140 s | 20–60 s |

A YouTube clip is a Short (vertical only). Its horizontal uploads are whole programmes.

## 6. The texts of a clip (`server/publish/clipmeta.js`)

Each network gets a title (the hook or the headline, within its limit), a text, the outlet credited with its
article's link where links work (YouTube's description, Facebook, X; TikTok and Instagram carry the credit without a
live link), hashtags (the programme and the subject), and the AI disclosure field. A light clip's caption may open with one emoji naming its
programme, on every network but YouTube. A grave clip never has one.

**A quiz clip never gives its answer away** (`moments.js` `quizWords`). The question's headline is often the answer:
WHERE's place, HOW MANY?'s figure, or the whole headline in LETTER BY LETTER. So a quiz clip's texts carry only what
the board itself asks:

- HOW MANY? and WHERE: the masked sentence, with its blank as ___ and any running-order label left out.
- LETTER BY LETTER: the headline's first letters, which the board shows from its first frame.

Each question also gets its own title, so two questions never share one: "How many? The new ___ HomePod mini…",
"Name the headline: I. D. O. A. A. D. I. 2027". When the question is too long for the title, the title keeps the
words round the blank ("…net profit soared ___ to a record high…"), never ending on a weak word.
