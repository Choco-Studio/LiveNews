# The clip factory

One aired episode goes in. Its best moments come out as finished clips, each one with:

- the vertical picture (Shorts, Reels, TikTok) and the horizontal one (Facebook, X);
- burned-in captions in the channel's own type;
- an intro before the vertical clip, the programme's own spectacle in under three seconds, with its theme
  (`shorts-v2.md` §6; COSMOS DESK's first), a hook title and an end card;
- a caption file (`.srt` and `.vtt`), a contact sheet and a cover frame;
- the text for every network;
- the compliance desk's verdict.

The publishable clips go to the queue, waiting for the owner. Everything is a dry run: nothing is uploaded.

    node tools/publish/factory.mjs --episode <episode.json> --out <dir> [--formats vertical,horizontal] [--max 6]
         [--moments <id,id>] [--all] [--queue data/publish] [--keep-masters] [--parallel] [--seconds n]
         [--pictures <dir>] [--sources <dataDir>]

`--pictures` serves the episode's pictures (`<storyId>.jpg|png|webp`) to the recorder, so its clips show them as they
aired, with their credits.

`--sources` reads the stories' sources (the archive and its article cache) from another data folder, for an edition
the station's own archive never kept, such as one replayed from a sport snapshot. Without its sources a story's words
cannot be measured under the verbatim rule: its moments are not chosen, and the gate refuses its clips
(`sources-missing`, since round 6; before, such a story passed as "unverified").

`tools/publish/material.mjs` makes episodes from the archive offline, with recorded voices, for measuring and
rehearsing. `tools/publish/playback-server.mjs` serves one saved episode to the recorder.

## 1. The steps

1. **Masters.** A playback server (`server/publish/playback.js`) serves the page and the saved episode, nothing else.
   The deterministic recorder makes one lossless master per format in clip mode, at 1x, with its report:

       tools/record.mjs --lossless --progressive --seed 1 --time <aired> --report

   The same seed, item and clock give both formats the same timeline. The factory checks the drift between them; it
   measured 0.000 s on every episode. A master already in the masters folder (`<prog>-<format>.mkv` with its
   `.report.json`) is kept, not recorded again: that is where `beta.mjs` puts a programme the pre-rendered playout has
   already rendered (`server/publish/masters.js`).
2. **The timeline** (§3) from the report.
3. **The moments** (§2), found and scored. In Phase 1 only the light, sensible ones are chosen. Choosing takes the
   best of each kind first, so a programme yields variety; it never takes two clips of the same words, and a moment
   must have aired whole in the recording.
4. **The cards.** The hook PNG and the end card are drawn by the channel's own code in a browser (`/lab/clip.html`).
   The hook is clear but for its plate, so the programme's set shows round it (`vertical.md` §5). The end card is
   recorded once per programme and format, with its sting; the vertical one on the programme's own set behind glass,
   saying where to watch only when there is a stream (`vertical.md` §5).
5. **Each clip** (§4) is cut, titled, scaled and captioned. Then come its contact sheet, its cover, the label check,
   its texts, the compliance verdict per network, and the queue.
6. **The summary** (`summary.json`): every moment with its scores and every clip with its verdicts. The masters are
   deleted unless kept.

## 2. Moments (`server/publish/moments.js`)

Moments are found from the episode's own structure (its segments, boards, speakers and the quiz's parts), never from a
guess at the words.

| Kind | What it is | Base interest |
|---|---|---|
| quiz-question | PAY ATTENTION: a question from its frame to its reveal, with the player's one-line reaction when it follows; never from the round's card (until 25 Oct a round's first question opened on it: four seconds of its name and its rules before anything was asked, `shorts-v2.md` A2) | 7.5 |
| quiz-round | a whole round, its card to its last reveal: the longer clip TikTok rewards | 7 |
| weather-board | WORLD WEATHER's HOT AND COLD and THE NEXT THREE DAYS | 6.5 |
| weather-story | the weather warning (usually grave) | 6.5 |
| weather-map | WORLD WEATHER's world: the next 24 hours as a time-lapse, the highs, lows and places named (THE NEXT 24 HOURS) | 6.5 |
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
  every phase the sense must be at least 7, the moment must last at least 10 s (`CLIP_MIN_SECONDS`, YouTube's and
  TikTok's own minimum, the end card on top; round 7: a 3-second story passed every other rule), and demo data is
  never published.
- **Never a story that copies its source** (`markCopied`). The factory runs the compliance desk's verbatim lint over
  the episode first (`lintEpisode` against the archive's titles and summaries, and the articles when cached): a moment
  that tells a story whose aired words copy their source is refused (`verbatim`) and not chosen, because the gate
  would hold its clip. `--all` and `--moments` still make it, to look at.
- **Never a picture that is not cleared** (`markUncleared`, round 5). Some moments show a picture without a cleared
  rights record (the compliance desk's `auditItem`): their own segments, the stories their cold open's montage or a
  STILL TO COME shows, or PAY ATTENTION's PICTURE THIS, whose question carries the archived picture's record. Such a moment is refused (`pictures: …`), and so is every moment of an episode made as a private
  preview (`PICTURE_RIGHTS=preview`). It is never chosen, even with `--all`, and never queued, even with `--moments`
  (which makes it only to look at). The upload of a whole programme with such a picture is never queued either.

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
  - the end card concatenated (its own picture and sting), and before the clip its intro (vertical, a programme that
    has one: its picture, its theme to the cut, the theme's tail 6 dB down under the clip's first words; `shorts-v2.md` §6);
  - a 5x nearest-neighbour scale;
  - H.264 High (yuv420p, CRF 18, a keyframe a second), AAC 160k, faststart;
  - the sound faded in over 0.12 s and out over 0.35 s;
  - **the feeds' loudness** (`shorts-v2.md` A1, 25 Oct): the clip's sound is measured first as the graph will mix it
    (the window, its fades and the end card: `loudnessArgs`, EBU R128), and one linear gain on the whole brings it to
    −14 LUFS integrated, never past −1.5 dBTP true peak (`loudnessGain`, `LOUDNESS`): no compressor and no limiter, so
    the mix keeps its dynamics. YouTube plays a video at about −14 and turns a louder one down, never a quieter one up;
    the house mixes its voices at −16, and the clips measured −15.7 to −17.1. The made file is measured again and the
    clip's JSON keeps both (`loudness: { target, gain, before, lufs, truePeak }`); a true peak over −1 dBTP is logged.
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

Each network gets a title, a text, the outlet credited with its article's link where links work (YouTube's
description, Facebook, X; TikTok and Instagram carry the credit without a live link), hashtags (the programme and the
subject), and the AI disclosure field.

**Whose words** (`server/publish/wording.js`; `plan.md` §4; `verbatim.md`). A clip's title and lead are the channel's
own words or a credited citation, never an outlet's headline passed off as ours:

- the channel's own headline, when the words it aired pass the verbatim check against the story's sources (`ownWords`:
  no run of 12 copied words, no more than 20 % copied);
- otherwise the story's label ("Wildfire · California, USA") and the outlet's headline as an attributed citation,
  `BBC Science: “Evacuation orders as fast-moving California wildfire burns homes”`. A citation is never cut: when the
  title is short of room, its tail (`| programme | GLOBIT 24`) goes first, then the label stands alone;
- the quiz's own title (below), which never carries the headline;
- the hook burned into the picture follows the same rule (`moments.js` `ownHook`): a hook that is the story's aired
  headline stays only when the headline is the channel's own words, else it is the story's label as its words bear
  it out ("WILDFIRE: / CALIFORNIA, USA"), else the programme's name. A burned-in title cannot carry a citation.

Every link is cleaned of tracking parameters (`cleanLink`: `utm_*`, `at_*`, `fbclid`, `gclid` and the like; every other
parameter and the fragment kept). A caption's first line opens with the AI disclosure's words and the clip's hook
("AI-produced news: Kenya reports a third Ebola case."), the disclosure's whole sentence right under it, what a viewer
reads before "more" (`compliance.md` §1, §2.10, §3.5); YouTube's description opens with the compliance desk's own, the
clip's lead as its second line. A light clip's first line may close with one emoji naming its programme, on every network
but YouTube. A grave clip never has one. The titles, hooks, covers and hashtags: `thumbnails-titles.md`.

**A quiz clip never gives its answer away** (`moments.js` `quizWords`). The question's headline is often the answer:
WHERE's place, HOW MANY?'s figure, or the whole headline in LETTER BY LETTER. So a quiz clip's texts carry only what
the board itself asks:

- HOW MANY? and WHERE: the masked sentence, with its blank as ___ and any running-order label left out.
- LETTER BY LETTER: the headline's first letters, which the board shows from its first frame.

Each question also gets its own title, so two questions never share one: "How many? The new ___ HomePod mini…",
"Name the headline: I. D. O. A. A. D. I. 2027". When the question is too long for the title, the title keeps the
words round the blank ("…net profit soared ___ to a record high…"), never ending on a weak word.
