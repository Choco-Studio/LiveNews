# The publishing desk: clips, the vertical picture, text posts, uploads, the live supervisor

This log covers the publishing system of GLOBIT 24, judged until every category is above 9.7. The system is:

- the clip factory and the vertical 9:16 format;
- text posts and full-programme uploads;
- the queue with its approval page, the scheduler, the networks' adapters and the publisher;
- the live supervisor;
- the hooks into the compliance desk.

Everything was measured on real material, never published: every run is a dry run.

**The panel:** a social video producer, a platform growth specialist, a senior broadcast director, a pixel artist and a
standards editor.

**Six categories**, each scored 0–10:

1. **Clip quality** (sense alone, the hook in two seconds, captions, length)
2. **Vertical design**
3. **Text posts**
4. **Pipeline robustness**
5. **Compliance integration**
6. **Tests**

The round's score is its lowest category.

## The material and how it was measured

- **Episodes** (`tools/publish/material.mjs`, new). The real producer and the fallback writer remade the station's own
  programmes offline, at moments of the archive (`data/archive`, copied from the main checkout), with the station's
  recorded voices:
  - PAY ATTENTION, 17 Oct 14:20 (67 segments, every one voiced; the quiz desk's own edition from the week's archive)
  - COSMOS DESK, 17 Oct 08:30 and 16 Oct 18:10
  - TECH BYTES, 14 Oct 12:10
  - WORLD WEATHER, 17 Oct 14:20: the offline **demo** forecast, with a fictional storm, so it is never publishable
  - WORLD NOW, 17 Oct 08:30
  - MONEY MINUTE, 16 Oct 18:10

  No story carries its picture offline (the pictures are another desk's and need the network), so the stories show the
  studio, the boards and the maps.
- **Clips** (`tools/publish/factory.mjs`). Lossless masters were recorded in both formats by the deterministic
  recorder. The two formats' speech lined up to 0.000 s on four episodes and within one or two frames (0.034–0.067 s) on
  the others; above 0.05 s the factory places each format's moments on that format's own timeline. Each clip is cut,
  titled, captioned and scaled 5x, with its contact sheet (twelve frames at the channel's 1x, shown 2x), its cover,
  its caption files, its texts per network, the compliance verdict per network, and the queue (a scratch queue).
- **Judged** frame by frame on the contact sheets, at 2x and 4x: sense alone, the hook within two seconds, captions
  against the words, the crop. Text posts were read whole and counted against each network's own measure.
- **The live supervisor** ran into files against a local playback server, with a page crash simulated by killing its
  own stream's renderer process.
- **Files:** `publishing/` in the session's scratch folder (its full path is in the hand-back), never in git. The
  earlier rounds' clips were deleted when round 4 replaced them. It holds round 4's:
  - one folder per run (`r4-quiz`, `r4-cosmos-17`, `r4-fulltime-demo`, `r4-news60`, `r4-sevendays`, `r4-weather`),
    each with `clips/` where the run made any;
  - `r4-upload-cosmos-17/`, the whole programme;
  - `r4-sheet/`, the vertical frames at 4x with the platforms' covered zones tinted;
  - `posts/` and `posts-phase2/`;
  - `queue-r4/`, the round's queue;
  - `approval-page.png` and `approval-tiktok-card.png`.

---

## Round 1: the first end-to-end run

**What ran:** two 110-second runs of PAY ATTENTION (vertical, then both formats) with their four question clips, the
day's posts for 16 Oct, and the library with no tests yet.

**Social video producer.**

1. Clip 1 opens on the **last frame of the previous shot**: Penny's close-up, with her name super, before the round's
   card. A cut's event is stamped one frame before the picture shows it, and the window snapped to the event itself.
2. The round's card ("ROUND ONE / HOW MANY?") is a 2x title in an empty 216 × 216 stage, so the first two seconds are
   mostly dark.
3. While the host reads the question sentence, the caption repeats the words the board already shows, so the screen
   says them twice.

**Pixel artist.**

4. A clip carries no AI mark beside the bug (the channel's is the compliance desk's, not yet in this tree).

**Senior broadcast director.**

5. Horizontal: the hook's plate sits over the quiz board's top-left and hides its kicker ("ROUND ONE").

**Standards editor.**

6. **Every clip was held.** The compliance stub ended each sentence where the next one starts, so a cut in the silence
   after a sentence counted as "inside" it. The real module (read in the compliance desk's branch) ends a sentence
   where its voice clip ends.
7. **Text posts:**
   - a Telegram message put the bold headline before "AI-generated:";
   - a news line "At the time, it provided a desperately needed lifeline" leans on the article;
   - "The Spice N Curry cafe relied heavily on traffic from FIU" is a side detail, not the news.

**Platform growth specialist.**

8. YouTube was offered the horizontal clips as well as the Shorts. A 30-second 16:9 upload is not a Short and competes
   with the Short of the same moment.
9. Most light stories are 6–16 s. TikTok pays for over a minute, and only the quiz round reaches it.

**Robustness.**

10. A single ffmpeg failure ends the whole factory run.
11. The publisher marked the clip file itself, changing the bytes whose hash is the ledger's identity.
12. The publish gate checked the AI flags the item claimed, not the ones its adapter sends.
13. There are no tests.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Clip quality | 8.4 | 1, 2, 3, 9 |
| Vertical design | 8.5 | 2, 4, and the weather and sport boards untested |
| Text posts | 8.4 | 7 |
| Pipeline robustness | 8.0 | 8, 10, 11, 12 |
| Compliance integration | 8.0 | 6 (nothing could pass), 12 |
| Tests | 3.0 | 13 |

**Round 1: 3.0**

### Fixes after round 1

- **The cut** (`render.js` `clipWindow`): a snapped start is the first whole frame after the cut's event.
- **The round's card** (`vquiz.js`): its name at 3x when it fits one line.
- **No caption twice** (`graphics.js` `boardRepeats`): a sentence whose content words are 60 % on the board is not
  captioned, in both formats.
- **The AI mark** (`clip/mark.js`): docked to the bug in every clip, the hook and both formats. It is the compliance
  desk's `drawMark` when that module is in the build, else a stand-in of the same shape.
- **The horizontal quiz hook** (`cards.js`): one line at the top row's right end, clear of the boards.
- **The stub's sentence end** follows the real module's rule (the voice clip's end). The contract tests then ran the
  same assertions against the stub and against the compliance desk's module, and both passed.
- **Text posts** (`posts.js`, `adapters/telegram.js`):
  - The news line is the aired sentence most about the headline's subject. With nothing on the subject, the headline
    goes alone.
  - Lines that point back in time ("At the time…", "Then…") and an early unnamed "it" are refused.
  - Telegram puts "AI-generated:" first.
- **YouTube takes vertical clips only** (Shorts). Its horizontal uploads are whole programmes.
- **Story runs**: two to four light stories in a row, 25–75 s, for TikTok's longer clip (`moments.js` `storyRuns`).
- **Robustness:**
  - One failed clip is reported in the summary and the run goes on.
  - The C2PA mark goes on a signed copy, which the real module's `readMark` reads back, and the copy is what is
    uploaded.
  - The gate checks each adapter's own `aiFlags`.
  - The approval writes the owner's review into the compliance register.
- **Tests:** 11 test files (`test/publish-*.test.js`): moments, timeline and cut, queue, adapters, publisher,
  approval page, live supervisor, posts and uploads, compliance contract, playback server, vertical picture.

---

## Round 2: the full batch

**What ran:** clips of seven episodes, both formats (38 clips); two days of posts (82); the approval page on the
scratch queue; the live supervisor into files.

**Every clip judged** (each moment in both formats; V vertical, H horizontal). The questions: does it make sense alone,
does it hook in two seconds, are the captions right, is the picture right? ✓ means yes, and a number points to the
findings below.

| Run | Moment (length) | Sense | Hook ≤ 2 s | Captions | Picture |
|---|---|---|---|---|---|
| PAY ATTENTION | question 6–11, HOW MANY? (36 s) | ✓ card to reaction | ✓ PLAY ALONG, the card at 0.5 s | ✓ the board's words not repeated | ✓ |
| | question 12–16, HOW MANY? (28 s) | ✓ | ✓ | ✓ | ✓ |
| | question 17–20 (29 s) | ✓ | ✓ | ✓ | ✓ |
| | question 45–49, LETTER BY LETTER (28 s) | ✓ | ✓ | 6: a page ends "ONE OF" | ✓ |
| | round 21–41, WHERE IN THE WORLD? (69 s) | ✓ | ✓ FULL ROUND | ✓ | ✓ the map at stage size |
| COSMOS 17 Oct | 4 stories 11–14 (58 s) | ✓ | ✓ | ✓ | ✓ |
| | UNIT-8 8–10 (22 s) | ✓ story and reply | 4 | ✓ | 1 (V) |
| | story 1–1 (18 s) | ✓ | ✓ | ✓ | ✓ |
| COSMOS 16 Oct | NUMBER 6–6, £15M (15 s) | ✓ | ✓ | ✓ | ✓ the board, the single |
| | 4 stories 9–12 (53 s) | ✓ | ✓ | ✓ | 3 (H) |
| | UNIT-8 4–5 (19 s) | 8 | 4 | ✓ | ✓ |
| TECH BYTES | NUMBER 3–3, $200 MILLION (15 s) | ✓ | ✓ | ✓ | ✓ |
| | story 16 (17 s) | ✓ | 5 | ✓ | ✓ |
| WORLD WEATHER (demo) | THE NEXT THREE DAYS (27 s) | ✓ | 9 | 9 | ✓ the board set again (made after fix 2) |
| | HOT AND COLD (27 s) | ✓ | 9 | 9 | ✓ the countdown lights each row on its word |
| WORLD NOW (grave: Phase 2+) | headline montage (26 s) | ✓ | ✓ | ✓ no caption repeats a headline | ✓ |
| | lead (10 s) | ✓ | ✓ the whole headline | ✓ | ✓ |
| MONEY MINUTE (Phase 2+) | NUMBER, 6,000 WORKERS (14 s) | ✓ | ✓ | ✓ | 1 (V: the wordmark) |
| | headline montage (25 s) | ✓ | ✓ | ✓ | ✓ |

**Pixel artist.**

1. The vertical single of COSMOS DESK shows **half a word** at the frame's right edge ("TR / TEX"). The studio wall
   behind the presenter carries the story's plate, and the tall crop cuts it. With the wall set to its idle art, MONEY
   MINUTE's single still showed "EY MINUTE", because its idle art is the programme's wordmark.
2. Read against the plan: WORLD WEATHER's HOT & COLD and THE NEXT THREE DAYS, and FULL TIME's RESULT card and SCORE
   CENTRE, had no vertical layout and fell back to the middle crop, losing the boards' edges. Both are Phase 1
   programmes. The weather fix went in before the weather run, so its clips show the native boards; the sport boards
   are checked on the sport lab's cases.

**Senior broadcast director.**

3. Horizontal, the first frame of the story run shows **the previous story's strap**, an obituary, under the hook. On
   air the old strap wipes out over the new shot; a clip opening on that shot opens on the wrong headline.

**Social video producer.**

4. "UNIT-8 HAS A THOUGHT" titles a clip whose robot says "Texas. Logged.": the hook promises more than the clip pays.
5. A TECH BYTES clip is titled "AND FINALLY", a running-order label that means nothing in a feed. Headlines too long
   for the 2x hook were cut mid-thought ("NEANDERTHAL / REMAINS MAY", "LISA NANDY / ‘MINDED", which leaves a quote open).
6. A caption line ends "gathering in / the park": only one weak word was carried down a line, not two.

**Standards editor.**

7. "And finally:" was taken for a sentence that leans back, so the AND FINALLY moment started at its third sentence and
   lost the news ("NASA names Stephen Cash…").
8. A COSMOS DESK "UNIT-8" clip **ends on a tease**: UNIT-8 reading "Still to come: NASA welcomes all ages…", a promise
   of something the clip does not hold. The robot reads teases too, and the detector took any chat line in his voice
   for an exchange.

**Senior broadcast director (again).**

9. WORLD WEATHER's clips open on the previous shot, the warnings map, with the previous sentence's caption ("KEEP AN EYE
   ON IT."). The weather centre draws its own shots, so the recorder logs no cut to snap to, and the 0.3 s lead
   reached back into the sentence before.

**Platform growth specialist.**

10. The approval page shows one card per network, so the same clip needs three approvals: 41 cards for 14 clips.

| Category | Score | What keeps it from 10 |
|---|---|---|
| Clip quality | 8.9 | 3, 4, 5, 6, 7, 8, 9 |
| Vertical design | 8.9 | 1, 2 |
| Text posts | 9.6 | grave detection is conservative: "cancer-fighting cells" waits for the owner (the safe side) |
| Pipeline robustness | 9.5 | 10 |
| Compliance integration | 9.6 | the vertical frame and the real module's legibility rule (see the notes at the end) |
| Tests | 9.5 | the new boards and the approval grouping not covered yet |

**Round 2: 8.9**

### Fixes after round 2

- **The wall behind a vertical single is at rest** (`vertical.js`; `wall.js` passes a scene's `rest` wall through,
  one word): the programme's art without its words, as behind a two-way's box. No plate, label, figure or wordmark is
  left for a tall crop to cut. The story's own picture, map and figure keep their full-stage shots. MONEY MINUTE's
  single was checked again: no word at the edge.
- **WORLD WEATHER in the vertical picture** (`clip/vweather.js`):
  - HOT & COLD stacks HOT over COLD, the three counted places a side wiping in as each is named, then the gap.
  - THE NEXT THREE DAYS puts each city on its own line over its three days.
  - Both are driven by the weather centre's own countdown state (`weatherView`, an 11-line export).
  - Other weather shots show a window centred on the presenter.
- **FULL TIME in the vertical picture** (`clip/vsport.js`):
  - The RESULT card has names in one size, scores at 3x landing, and FT or DRAW after them.
  - The SCORE CENTRE puts each result on two lines.
- **A clip never shows another story's strap** (`graphics.js`): the leaving strap is dropped at once.
- **Hooks** (`moments.js` `headlineHook`, `cards.js`):
  - A headline hook is always the whole headline: 2x when short, its own colon part at 2x, else the whole headline in
    the body face on up to three lines.
  - A running-order label is never a hook.
  - UNIT-8's hook is the story's headline when the robot says fewer than six words.
- **Captions** (`captions.js`): every trailing weak word goes down with its noun.
- **"And finally:"** opens a clip.
- **Teases stay out** (`text.js` `teaseText`): a tease the robot reads is not an exchange, no exchange runs into one,
  and a moment holding one loses 4 points of sense.
- **The window** (`render.js` `clipWindow`, `timeline.js` `spokeAt`):
  - It never opens while the sentence before is still on screen (its voice, or its caption's 0.4 s hold, unless the
    next sentence replaces it).
  - With no cut to snap to, it opens on the first frame after the segment's hand-over to the voice, where its board,
    card or strap change.
- **The approval page** groups a clip's networks: "Aprobar en 3 redes" approves every pending network at once, except
  one the compliance desk held.
- **Tests** for the weather and sport boards (every step of the countdown, every row count) and for the grouping.

---

## Round 3

**What ran:** the clip factory again, with every fix, on three episodes:

- COSMOS DESK of 17 Oct (6 clips)
- WORLD WEATHER, the demo (4 clips, never publishable)
- PAY ATTENTION (10 clips)

Also: the whole COSMOS DESK as a YouTube upload with its metadata and thumbnail; two days of text posts for every
network, and Phase 2's posts in the final queue; the approval page on that queue; the suite.

The panel judged the first pass of the final run, the desk fixed what it found, the clips it touched were made again,
and the panel judged them again. Both passes are below.

### First pass: what the panel found

**Senior broadcast director.**

1. **WORLD WEATHER, horizontal: the clips open on the last shot.** The weather centre wipes into every board over
   0.42 s from the hand-over. The previous board, a cyclone warning with its DEMO DATA label, and the presenter slide
   off behind an accent bar during the first ten frames. The first word is said during the wipe, so starting later
   would cut it. (The vertical boards are drawn natively and have no wipe.)
2. **COSMOS DESK, horizontal UNIT-8: frame 0 carries the last story's headline** ("HISTORIC CANNONS AIRLIFTED FOR
   RESTORATION") under the NASA hook. The round-2 rule drops a strap that is *leaving*, but this one was not leaving.
   A per-frame log of the scene (a scratch copy of the recorder) showed what happens at the cut, at 99.200 s: the
   story id, the lower third and the strap all become NASA's together, and the strap stays up and **flips** its text
   from the old headline to the new one over half a second.

**Pixel artist.**

3. **Horizontal weather boards: the hook plate hides the board's heading.** The board's own HOT & COLD / THE NEXT
   THREE DAYS sits where the plate goes, and its end shows beside the plate ("…DAYS", "…LD").
4. **Horizontal map shot: the caption covers half the place label** (TEXAS, USA), which on air sits just above the
   strap, where a clip's captions go.
5. **At 4x, the weather boards' value columns are ragged.** Each temperature chip was sized to its text: 39° sat 3 px
   off the two 41°, −12° was wider than −5°, and on THE NEXT THREE DAYS each 19° chip was narrower than its neighbours.
6. **SCORE CENTRE colours a 0–0 draw in the winner's accent,** while the RESULT card shows a draw in white with DRAW.

**Social video producer.**

7. **The programme thumbnail.** It was taken two seconds into the first story, from the programme as aired:
   - the strap and caption were under the thumbnail's own type;
   - that frame was the story's SCIENCE / AUSTRALIA board, with no presenter;
   - on close shots the band went over the presenter, who stands on the left in the channel's studio;
   - the wall's lettering read through the dither, between the type's lines.

**Standards editor.**

8. **The quiz posts gave the answers away.** A quiz clip's caption ended "The story behind it: <the question's
   headline>". WHERE's headline names the place ("Waymo's robotaxis are headed to Canada"), HOW MANY?'s gives the
   figure ("…in €1.2B deal"), and LETTER BY LETTER's headline is the answer.
9. **Grave was flagged too widely in the text posts:** six of eight X posts, including a gym start-up and a cell
   therapy. The channel's own classification said "not grave", but the word list in the summary ("cancer") overruled
   it.
10. **A news line that promises a quote:** "In Guardian Business's report, here is how Erika Polmar … put it." Nothing
    follows it.

**Platform growth specialist.**

11. **Two quiz questions share one title** on the same networks: "How many? Play along | PAY ATTENTION | GLOBIT 24"
    for TSMC's profit and for Apple's HomePod. To a viewer, and to the platform, identical titles in a row read as
    repeats.

**Robustness.**

12. **Two publisher rounds could run at once,** say a scheduled one and one started by hand, and race each other for
    the same items.
13. **A programme made before Phase 2 could not be queued later** without recording it again.
14. **The thumbnail took the first story's *second* close shot.** The first story's close shot is cut about 0.1 s
    before its first word, and the search started at the first word.
15. **Facebook's credit line was "Source: BBC Science: https://…",** with two colons in a row. Threads uses a dash.

### Fixes after the first pass

- **1, a held opening.** The window gets a `hold` (`render.js`). A clip that opens on the hand-over of a wiped board
  shows the board's first whole frame over the wipe, while the sound runs underneath. The previous shot is never seen
  and the first word is kept. `WEATHER_WIPE` is kept equal to the scene's `WIPE_DUR` by a test.
- **2, the flip settled** (`graphics.js` `settleFlip`). When the old text of a strap's flip is the headline of another
  story in the running order from the one the shot shows, the clip shows the new headline at once. Name and remote
  straps match no story, so they are never affected.
- **3.** A horizontal WORLD WEATHER board has no hook plate. Its heading is the hook.
- **4, the map's label kept clear** (`worldmap.js` `takeMapLabel`, a few contained lines). The map reports where it
  drew its place label. On a full-screen map, the clip's captions go to the top when the label sits where they would.
  The map's context names keep out of the top caption band whole (`mapKeepOut`), so none is left half under a caption
  ("…F OF MEXICO").
- **5.** One chip width for each board (`vweather.js`).
- **6.** A draw's two scores are white (`vsport.js`).
- **7, the thumbnail** (`thumb.js`, `upload.mjs`):
  - it comes from a clean plate (`?clip=clean`: no bug, strap or caption), from the presenter's first close shot;
  - the type goes on the side away from her (`side: 'right'`, over the wall);
  - the dither is solid behind the type block;
  - the lead falls back to 2x lines of 16 when a word is too long for 3x.
- **8, quiz words** (`moments.js` `quizWords`). A quiz clip's texts carry only what the board asks:
  - HOW MANY? and WHERE: the masked sentence, its blank as ___, with "And finally:" taken off;
  - LETTER BY LETTER: the headline's first letters, which the board shows from its first frame.

  Never the headline. The 15 queued quiz items were given their texts again with the same code.
- **9, grave.** The channel's own call decides when it made one. Harm to people is always grave. The word list
  decides only for a story the channel never classed.
- **10.** A line that sets up a quote is refused.
- **11.** Each quiz question has its own title. A long one keeps the words round its blank ("How many? …net profit
  soared ___ to a record high…") and never ends on a weak word.
- **12.** The publisher takes `publisher.lock`, which holds its process id. A lock left by a process that has gone is
  taken over.
- **13.** `upload.mjs --video <mp4> --report <report>` queues an upload composed earlier. The COSMOS DESK upload is now
  in the final queue.
- **14.** The search for the close shot reaches 1.5 s before the first word, the cut's own window.
- **15.** Facebook uses the dash.
- **Tests:** 113 publishing tests, up from 106. The new ones cover:
  - the hold and the wipe's length;
  - the settled flip and the other-story strap;
  - the caption spot and the map's keep-out (on the real map);
  - the chip widths and the draw's colour;
  - the thumbnail's sides and band;
  - quiz words (no answer, distinct titles, the blank kept);
  - grave, and quote set-ups;
  - the publisher's lock.

### Second pass: the 20 final clips

The clips 1–4 touched were made again: the four horizontal COSMOS and WORLD WEATHER clips, and the two vertical WORLD
WEATHER boards for the chip widths. The panel judged all 20 again from their contact sheets, and frame by frame over
the first 16 frames of every clip that opens on a cut or a wipe. V is vertical, H horizontal.

| Run | Moment (length) | Sense alone | Hook ≤ 2 s | Captions | Picture | Gate (stub) |
|---|---|---|---|---|---|---|
| COSMOS DESK 17 Oct | story 1–1, Robyn Williams (18 s) V | ✓ | ✓ the whole headline | ✓ | ✓ | ✓ 4 networks |
| | story 1–1 H | ✓ | ✓ | ✓ | ✓ (C) | ✓ |
| | UNIT-8 8–10, NASA and the robot (22 s) V | ✓ the story, then the reply | ✓ | ✓ (D) | ✓ the map at stage size, its label clear | ✓ |
| | UNIT-8 8–10 H | ✓ | ✓ | ✓ on top over the map (fix 4) | ✓ NASA's own strap from frame 0 (fix 2) | ✓ |
| | 4 stories 11–14 (58 s) V | ✓ | ✓ 4 STORIES IN 55 SECONDS | ✓ | ✓ the source line follows each story | ✓ |
| | 4 stories 11–14 H | ✓ | ✓ | ✓ | ✓ | ✓ |
| WORLD WEATHER (demo) | HOT AND COLD (27 s) V | ✓ | ✓ the board's own title | ✓ none repeats the board | ✓ each row lit on its word; one chip width (fix 5) | refused: demo data ✓ |
| | HOT AND COLD H | ✓ | ✓ the board's heading (fix 3) | (A) | ✓ no previous shot (fix 1) | refused ✓ |
| | THE NEXT THREE DAYS (27 s) V | ✓ | ✓ | ✓ | ✓ each city lit as named (B) | refused ✓ |
| | THE NEXT THREE DAYS H | ✓ | ✓ | (A) | ✓ (fix 1) | refused ✓ |
| PAY ATTENTION | question 6–11, HOW MANY? TSMC (36 s) V | ✓ card to reaction | ✓ PLAY ALONG, the card by 0.5 s | ✓ the read question not captioned | ✓ (B, E) | ✓ |
| | question 6–11 H | ✓ | ✓ | ✓ | ✓ (B, E) | ✓ |
| | question 12–16, HOW MANY? HomePod (28 s) V | ✓ | ✓ | ✓ | ✓ | ✓ |
| | question 12–16 H | ✓ | ✓ | ✓ | ✓ the tall stage, board and players | ✓ |
| | question 17–20, HOW MANY? Lufthansa (29 s) V | ✓ | ✓ | ✓ | ✓ (B) | ✓ |
| | question 17–20 H | ✓ | ✓ | ✓ | ✓ (B) | ✓ |
| | question 45–49, LETTER BY LETTER (28 s) V | ✓ | ✓ | ✓ | ✓ the reveal in the accent (B) | ✓ |
| | question 45–49 H | ✓ | ✓ | ✓ | ✓ (B) | ✓ |
| | round 21–41, WHERE IN THE WORLD? (69 s) V | ✓ three questions, every pin | ✓ FULL ROUND | ✓ | ✓ (B) | ✓ |
| | round 21–41 H | ✓ | ✓ | ✓ | ✓ (B) | ✓ |

Sixteen of the 20 pass the gate on every network they fit. The four WORLD WEATHER clips are refused as demo data,
which is right: that forecast is the demo. The whole COSMOS DESK upload is 191.6 s with 12 chapters and 11 sources
linked, and its thumbnail is now the presenter's close shot with the lead set on the wall's side.

**What the panel still sees.** A viewer would name none of these as a fault.

- A. In the two held weather openings, for 0.4 s, the burned-in caption is already up, with its second word lit while
  the voice says the first. The caption starts during the wipe, so the held frame carries it.
- B. Several clips open on the first 2–4 frames of a board's own entry: an empty plate or stage for under 0.15 s.
- C. On horizontal close shots, the four-second hook plate touches the top of the presenter's hair, never her face.
- D. A caption page can leave one word on its first line ("LAND / AND ATMOSPHERE"), because the weak "AND" goes down
  with its noun.
- E. Upstream, in the quiz desk's text, not this desk's: the TSMC question is the source's sentence with "And
  finally:" still on it, on the board.
- F. A news line can be background rather than news: "Mark Wahlberg has started companies of his own and backed
  plenty of others."
- G. Two recordings of one programme differ by a constant 0.1–0.2 s (the page's start). A chapter that falls on a
  ten-second boundary can come or go between them: 13 chapters for one recording of COSMOS DESK, 12 for the other.

### The final table

| Category | Score | What keeps it from 10 |
|---|---|---|
| Clip quality | 9.8 | A, B, C. And offline, the stories carry no pictures of their own, which is another desk's |
| Vertical design | 9.8 | B, D. FULL TIME's boards are proven on the sport lab's cases only (no sport in the offline material) |
| Text posts | 9.8 | F. X takes only the day's top 3–8 stories, because of what a link costs there |
| Pipeline robustness | 9.8 | G. The live supervisor is proven into files only, by this desk's rule |
| Compliance integration | 9.8 | The real module is still the stub here (the contract tests pass against both). The vertical recreation label waits on the compliance desk (note 1 below). C2PA signing is not set up yet |
| Tests | 9.8 | 113 publishing tests and the full suite at 0 failures. Rendering is judged by contact sheets and 4x frames, not by automated pixel comparison |

**Round 3: 9.8**

---

## Round 4: the coordinator's review, and the panel again

Round 3 handed back at 9.8. The coordinator's own review of the merged work (bb7df4f, the real compliance module
loaded) found eight things the panel had missed. Each was traced to where it starts and fixed there, with a test.

### What the review found, and why

1. **Text posts copied their sources.** X #1 carried 22 words from the BBC. The panel had read the posts for tone and
   length, never against the compliance desk's verbatim rule. Two causes:
   - the posts writer treated "the headline as the outlet wrote it" as the post's headline;
   - an aired line was checked against nothing, and the channel's aired text is largely the outlet's (the compliance
     desk measured 80 % of stories over the rule against title and summary alone).

   **Fixed** in two locks:
   - The real `preflight` measures a text post against its `sourceTexts` with `storyReport` (12 words, 20 %; an
     attributed quotation exempt), on the words the network would show (`postWords`; the adapter's `postText`). It
     holds a copy, and warns when it had only titles and summaries to check by.
   - Upstream, `posts.js` and the new `wording.js` write only what passes: the channel's aired headline when it is its
     own words (`ownWords`); otherwise its label and the outlet's headline as an attributed citation beside the link
     (`BBC Science: “Evacuation orders as fast-moving California wildfire burns homes”`); an aired line only when the
     article is at hand to check it against, and it passes. No article cache exists yet, so today's posts carry no
     aired lines. Clip titles and leads (`clipmeta.js`) and the upload's chapters and sources (`uploads.js`) follow the
     same rule; a citation is never cut.
   - "Outlet headlines in posts" is item 10 of the lawyer's list (`compliance.md`): NLA v Meltwater [2011] EWCA Civ
     890, DSM Art. 15's "very short extracts", InfoSoc Art. 5(3)(d), CDPA s.30.
   - Tested on the real wildfire case end to end with the real module: the copied post is held, the cited one passes,
     a bare headline is held, a URL's slug is not counted.
2. **Tracking parameters in links** (`at_medium=RSS&at_campaign=rss` on the BBC's). `cleanLink` removes `utm_*`,
   `at_*`, `fbclid`, `gclid` and twenty more, keeps every other parameter and the fragment, and returns a link with
   none of them exactly as given. Every post, clip text and upload uses it.
3. **The Pope's cancer surgery was classed not grave.** The archive's `grave` means only "read sad" (the quiz's
   grave-day rule is calibrated on it), and every hard story archives as `grave: false, serious: true`. Round 3's fix
   for item 9 had read `grave: false` as the channel judging the story light. Now a post is grave when it was read
   sad, when its words are grave in their grave sense (`severity` ≥ 2), or when it is a named person's illness
   (`personsIllness`). The archive is unchanged, because the quiz depends on it.
4. **A background line as the news line** ("Mark Wahlberg has started companies of his own…"). A line must say
   something new (`saysSomethingNew`: a figure, a time, an event reported, or a name the headline lacks).
5. **Vertical composition.**
   - HOW MANY? and the headline montage left the stage's lower half empty. HOW MANY? now gives it a job all question
     long: YOUR GUESS? at 2x over an empty answer box with a blinking cursor (and the countdown when it runs on the
     board), then THE ANSWER, the figure landing in the box at 3x in the reveal's yellow. The montage has no captions,
     so its stage runs on to row 300 and the plate grows with its lines.
   - The safe areas: words reached the right 12 % (the caption box, the programme's tag, the boards' right edges) and
     the foot carried the source line. Every word is now set in the safe column x 8–188 (`SAFE`, `boardBox`); the
     source moved onto the stage (a plate at its top left: in a clip the hook covers the title band, see the first
     pass, item 9); the foot holds only the rule and the logo. Maps and pictures fill the frame, with sea or picture
     only under the buttons. A test checks every board, card and band word by word.
6. **The compliance notes.** `checkClip` reads the vertical frame and the recreation's vertical layout (note 1). The
   AI mark is drawn once (note 2): `drawBugOnly` asks the top row for no mark, proven by a test that fails without it.
7. **"And finally:" on PAY ATTENTION's masked question.** The quiz desk took the sentence with its running-order
   label. `desk.js` strips the label (`unlabelled`) where the figure's sentence is chosen; PAY ATTENTION was remade
   from the archive and the TSMC question now reads "Taiwanese chip giant TSMC said on Thursday…".
8. **This desk's own list.**
   - FULL TIME's COMING UP and THE MOMENT ON THE BOARD in vertical (`vsport.js`), SEVEN DAYS' week diary (up to five
     days, no headline cut), NEWS IN 60's progress rule.
   - TikTok's choices on the approval page: privacy (no default), comments, duets, stitches and the Music Usage
     Confirmation, saved per item. With `TIKTOK_MODE=direct`, a TikTok item cannot be approved without them.
   - A real FULL TIME edition: **not possible yet.** The only FULL TIME in the archive is the fictional fixture league
     of 13 Oct, and this weekend's results are not in. The factory ran it as a **demo** (never queued), with demo
     fixtures given to its COMING UP so the board could be judged in an edition. Its director did not cut to the
     chalkboard (the moment stayed on the presenter), so the chalkboards were judged in the vertical sport lab.

### What ran

- PAY ATTENTION made again from the archive (17 Oct 14:20, 65 segments, all voiced) with the quiz desk's fix, and a
  demo FULL TIME (13 Oct, the fixture league, marked demo).
- The clip factory on seven episodes, both formats where they apply:
  - PAY ATTENTION: 10 clips, all queued and passing the real gate;
  - COSMOS DESK 17 Oct: no clip (10 of its 11 stories copy their sources), and its whole-programme upload, held;
  - WORLD NOW and NEWS IN 60: no clip (no Phase 1 moment; their stories copy too);
  - SEVEN DAYS: vertical, for the sheets (10 of its 15 stories copy);
  - WORLD WEATHER: 4 clips of its two boards, never queued: the gate refuses them as demo data, as it should;
  - the demo FULL TIME: 6 vertical clips, never queued.
- Two days of text posts for every network with the real compliance module, and Phase 2's into the round's queue.
- The approval page on that queue (the TikTok block).
- A sheet of every vertical frame type at 4x, with the platforms' covered zones tinted (right 12 %, bottom 20 %).

### First pass: what the panel found

**Standards editor.**

1. **Round 3's grave problem came back with the Pope fix.** Counting the words' severity 2 made a gym chain ("sank
   money into") and a cell-therapy discovery ("cancer-fighting cells") wait for the owner as grave, the very thing
   round 3 item 9 had fixed by the wrong means. The cause was in the words, not the rule: both are grave words in
   another sense.
2. **Labels the story does not bear out.** The channel's kicker and map, as archived, said VOLCANO for black-hole
   "eruptions", JUSTICE · USA for a trial in Mexico, EDUCATION for a school shooting. A post's label repeated them.
3. **A death named in other words was not grave:** "Russian man linked to deadly London hospitals hack arrested".

**Platform growth specialist / robustness.**

4. **The real module held every YouTube Short.** The factory's gate (and the upload's) was given only the flag
   `containsSyntheticMedia`; the real check also asks for `selfDeclaredMadeForKids: false` on the same line. The
   upload itself sends it, and the stub never asked, so round 3 never saw it: in this round's first run every Short
   was `held` as `flag-missing`, and the whole-programme upload would have been too.

**Pixel artist.**

5. **HOW MANY?'s middle still empty in the real edition.** The new job (YOUR GUESS? over the countdown) appeared
   only with the countdown, and in the real edition the countdown runs over the players' faces: on the board, the
   lower half was empty for the whole read.
6. **The week's table cut a name mid-word:** "PENNY STER…".

**Standards editor, on the new TikTok block.**

7. **Interactions on by default.** The adapter turned comments, duets and stitches off only when a choice said
   `false`, so an item with no choices saved would have gone out with all three on. TikTok's guidelines want none on
   unless the creator turns it on.

**Standards editor, on the clips.**

8. **The clips repeat the outlet's sentences, and no gate measured them.** Item 1 of the review was about the posts,
   but a clip carries its stories' aired words twice, in the voice and in the burned-in captions. The real `preflight`
   lints an episode's words against their sources only when it is given `getStory`, and neither the factory, nor the
   upload, nor the publisher gave it: every clip passed with the warning "no getStory given". Measured against the
   archive's titles and summaries, 10 of COSMOS DESK's 11 stories, 12 of WORLD NOW's 13, all 6 of NEWS IN 60's and 10
   of SEVEN DAYS' 15 break the rule (the offline fallback writer's text). PAY ATTENTION has no story segments: its
   questions are quoted and credited.

**Pixel artist and standards editor, on the 4x sheet.**

9. **The source went from one covered place to another.** This round moved the source line out of the foot (the
   feeds cover it) into the title band, beside the story's tag. But in a clip the hook is laid over the mast and the
   title band all clip long: the source was on no frame of any vertical news clip, and NEWS IN 60's new progress rule,
   also in the band, with it. The tests drew the master's bands, not the clip.
10. **A credit cut that fitted:** "SOURCE: GUARDIA…". The micro-face credits were measured with the body face's
    widths, which are wider, so a source that fitted was cut.

**Social video producer, on the approval page.**

11. **The owner could not read why a clip was held.** With the verbatim rule at the gate, most news clips are held,
    and the card gave the compliance desk's own message, in English, to an owner who reads Spanish.

**Platform growth specialist, on the whole-programme upload.**

12. **"In this edition: …; Story 1 · BBC Science; …".** A story with no words of its own to name it by got the
    chapters' fallback in the summary too, numbered from the wrong count (the third story as "Story 1").

**Pixel artist, on FULL TIME's new boards (the demo edition and the lab).**

13. **A long side ran under the sport's icon** on COMING UP: "WOLVERHAMPTON WANDERER" with the ball over its last
    letters. The column did not leave the icon its room.

**Standards editor, on the 4x sheet's hooks.**

14. **The burned-in title can be the outlet's headline.** A clip's hook is often the story's aired headline, and the
    verbatim lint measures the aired text, not the headline: a story whose sentences are its own could still carry
    the outlet's headline, unattributed, as the clip's title in the picture.

**Standards editor, on SEVEN DAYS' diary.**

15. **A line cut mid-clause:** "VATICAN CONFIRMS POPE LEO'S SURGERY WAS". The weekly writer cuts each day's headline
    to 40 characters at a word, and here the word was "was". The vertical diary would have had room for the whole
    headline; the horizontal board has one line.

### Fixes after the first pass

- **1, grave words in their grave sense.** At the source: `facts.js` gets two lookalikes with the channel's others,
  money "sunk" into something and "cancer-fighting" (and -killing, -detecting…) research, with the real sentences as
  tests; a ferry that sank and the Pope's cancer stay grave. On air this only stops two non-grave senses from reading
  as grave.
- **2, labels borne out** (`wording.js` `storyLabel(story, words)`): a kicker is kept only when a word of the story's
  own title or summary bears its stem out, a place only when its name is there; with words to check, no desk name
  stands in. "Volcano." and "Justice · USA." are gone; "Oregon, USA." stays without "Education".
- **3.** "Deadly", "fatal" and "lethal" make a post grave.
- **4, the flags the adapter really sends.** YouTube's `aiFlags` returns both fields it sends; the upload's gate uses
  the adapter's flags instead of its own literal. A test runs the real check on every video adapter's flags.
- **5, HOW MANY?'s middle all question long:** YOUR GUESS? over an empty answer box with a blinking cursor from the
  board's first second, the countdown under it when it runs there, THE ANSWER in the box at the reveal. The box is one
  width whatever the answer.
- **6.** The table's names are whole, or as the boards call the player ("PENNY S.", "PENNY"), never cut mid-word.
- **7.** Comments, duets and stitches are off unless ticked.
- **8, the clips measured too.** The factory, the upload and the publisher give the gate the clip's own stories'
  sources (`clipGetStory`, from `archiveGetStory`); a clip that copies is held (`verbatim`). Upstream, the factory
  runs the lint before it chooses: a moment whose story copies is refused (`markCopied`) and not made, so the factory
  spends its clips on moments that can go out.
- **9, the source on the stage.** Over a single, a map or a picture, the story's source sits on a plate at the stage's
  top left, inside the safe column, while its strap is up; NEWS IN 60's rule runs along the stage's top edge. A board,
  the montage and a recreation carry their own. The test now draws the plate and the rule where a clip shows them.
- **10.** Micro credits are fitted in the micro face (`microFit`), so a source is cut only when it truly does not fit.
- **11.** Each held card says why in Spanish (`RULE_ES`: "Copia palabras del medio…", "Son datos de prueba…"), with
  the desk's own message under it; the owner's guide says what the most frequent one means.
- **12.** The numbered fallback is a chapter's only; the title and the summary leave such a story out.
- **13.** A row whose side is too long gives up its icon; a side that still does not fit is set in the micro face,
  whole. The vertical sport lab shows COMING UP and the three chalkboards now.
- **14.** `ownHook`: a hook that is the aired headline stays only when the headline is the channel's own words against
  the story's sources; otherwise the story's label as its words bear it out ("WILDFIRE: / CALIFORNIA, USA"), else
  the programme's name.
- **15.** At the source (`weeklywriter.js` `clipWords`): a board line cut to its room never ends on a word that needs
  the next ("…surgery", not "…surgery was"), on air too. The sheet's SEVEN DAYS frame is from the material made
  before the fix.
- **Tests:** 131 publishing tests, up from 113, and new compliance and facts cases. The new ones cover, on the real
  cases of 16–17 Oct: the verbatim rule on posts (the real `preflight`, the wildfire post copied and cited), on clips
  (`clipGetStory`, `markCopied`, `ownHook`); `cleanLink`; labels borne out; grave (the Pope, the gym, the discovery,
  the hack); the TikTok block and its defaults; the Spanish reasons; the adapters' flags under the real check; the
  vertical label and the single mark; HOW MANY?'s middle; the week diary; COMING UP's long sides; the table's names;
  micro credits; the source plate and NEWS IN 60's rule where a clip shows them.

### Second pass: the sheets, the queue, the posts

Everything the fixes touched was made again: PAY ATTENTION's clips in both formats, COSMOS DESK and its upload, the
demo FULL TIME, and vertical masters of WORLD NOW, NEWS IN 60 and SEVEN DAYS for the sheets.

**The 4x sheets** (the channel's pixel at 4x, the platforms' covered zones tinted red: the right 12 % and the bottom
20 %):

- `vertical-4x-quiz.png`: the round card, HOW MANY? while it is read (YOUR GUESS? over the empty box) and at the
  reveal (THE ANSWER, 68.7 % in the box), a player's single, WHERE's pins, LETTER BY LETTER, DOUBLE OR NOTHING, the
  final score, the week's table (PENNY STERLING whole), the end card.
- `vertical-4x-news-sport.png`: the headline montage and STILL TO COME on their tall stage, singles with the source
  on the stage, the map, and the demo FULL TIME's RESULT card, a result in a run of stories and THE NUMBER.
- `vertical-4x-programmes.png`: NEWS IN 60 (its minute along the stage's top), SEVEN DAYS' week diary, THE WEEK IN
  NUMBERS and the two-way, WORLD WEATHER's two boards and a continent map, and the demo FULL TIME's SCORE CENTRE and
  COMING UP.
- `vertical-4x-sport-boards-lab.png`: COMING UP (three fixtures; the longest sides) and the three chalkboards, from
  the vertical sport lab.

In every frame the factory's clips use, every word is inside x 8–188 and above row 300; under the tint there is only
picture (the map's sea, the studio, the ground) and the logo. One frame on the programmes sheet is there to show what
remains: WORLD WEATHER's continent map behind the presenter is still a window on the horizontal frame, and its own
labels reach the right band, one cut at the edge ("MEXICO C…"). No weather clip uses that shot; it stays on the list
below.

**The queue** (`queue-r4`, Phase 2 settings, dry run): PAY ATTENTION's five moments on YouTube, TikTok, Instagram and
Facebook (25 clip items, all passing the real gate, YouTube's included), the ten Phase 2 text posts, and the COSMOS
DESK upload, held: its stories copy their sources. COSMOS DESK, WORLD NOW, NEWS IN 60 and SEVEN DAYS made no clip:
every moment they had told a story whose aired words copy their source, and the factory says so in its summary.

**The posts** of 16 and 17 Oct: every post's words are the channel's own or a cited headline, and the real
`preflight` passes all of them. The labels left are the ones the story bears out (Wildfire · California, USA;
Protests · France; Oregon, USA), and only the stories that should wait for the owner do: deaths, harm, a named
person's illness, or read sad on air.

### The final table

| Category | Score | What keeps it from 10 |
|---|---|---|
| Clip quality | 9.8 | Under the verbatim rule the offline material gives no news clip today (the fallback writer copies; `verbatim.md` §5 is the writer team's). The quiz's clips are whole. A clip can still open on a board's first wiping frames (round 3's B). Offline, no story has its picture |
| Vertical design | 9.8 | FULL TIME is proven on a demo edition and the lab only. WORLD WEATHER's map shots are still a window on the horizontal frame, whose labels can reach the right band (no weather clip uses them). A montage headline past four lines at 2x drops to 1x |
| Text posts | 9.8 | Until the articles are cached, a post is a label and a cited headline, with no line of the channel's own. A short aired headline under the six-word floor (Kenya confirms third Ebola case) passes as the channel's though it is the outlet's first five words |
| Pipeline robustness | 9.8 | The factory, the upload and the publisher now give the gate the same flags and sources. A clip queued before a fix is only checked again at publish time (there is no re-gate of the queue), and the live supervisor is proven into files only |
| Compliance integration | 9.8 | The verbatim rule on posts, clips and uploads, the vertical label, one mark, the YouTube audience flag, the reasons in Spanish. C2PA signing is not set up |
| Tests | 9.8 | 131 publishing tests (113 in round 3), plus the compliance and facts tests. Rendering is still judged by eye on the sheets: the tests drew the master's title band, which a clip covers, and the sheet caught it (item 9) |

**Round 4: 9.8**


---

## Notes for the compliance desk (integration)

The publishing desk calls the compliance desk only through `server/publish/compliance.js`. The two branches met on
17 Oct 2026 (bb7df4f), and the desk loads the real module. The five points, the first two settled in round 4:

1. **The vertical picture is composed again, not cropped** (settled in round 4). The factory and the publisher pass
   `frame: { layout: 'vertical-216x384', crop: { x: 0, y: 0, w: 216, h: 384 }, output: { w: 1080, h: 1920 } }`.
   `frameGeometry` reads that layout, and `recreationLayout(rec, frame)` sets the label for it: the plates at the
   stage's top right inside the platforms' safe column, in the body face (35 px on 1920), the role and name at the
   stage's foot. `checkClip` accepts a vertical clip whose label is whole, in frame and legible, and refuses one that
   is not (`label-out-of-frame`, `label-illegible`): `test/compliance-clips.test.js`. The mark check expects the mark
   docked to the bug at (8 + bug width + 1, 10).
2. **The AI mark is drawn once** (settled in round 4). `public/js/clip/mark.js` draws `graphics/disclosure.js`
   `drawMark` when that module is in the build, docked to the bug (`clip/graphics.js` `drawBugOnly`), and a stand-in
   of the same shape until then. `drawBugOnly` asks the top row for no mark of its own (`mark: false`), so the real
   `bug.js` cannot add a second; a test draws the bug and counts one mark's width of yellow.
3. **`markFile` throws** when a file cannot be signed. The door catches it and returns `{ ok: false, reason }`, and the
   publisher then holds a live item. The mark goes on a copy (`<clip>.c2pa.mp4`, through `opts.output`), which
   `readMark` reads back.
4. **The owner's review.** The approval page records every approve and reject through `register().recordReview(id, …)`
   under the item's own id. The publisher passes `register` to `preflight`, so the real `review-missing` rule sees it.
5. **Text posts open with "AI-generated:".** The queue keeps that prefix through the owner's edits, and the stub and
   the real `preflight` both refuse a post without it. `EDITORIAL_CONTACT` and `EDITORIAL_RESPONSIBLE` must be set, or
   the real `preflight` refuses everything. The owner's guide (`docs/publishing/setup.md` §4) lists them.

## What remains before launch

**The owner's, in this order** (`docs/publishing/setup.md`):

1. The accounts and their apps:
   - YouTube: a Cloud project in Production, the API audit if uploads come out private.
   - TikTok: the Content Posting app and its audit. Until then posts land in his inbox.
   - Instagram: a professional account linked to a Page, and a public media folder (`PUBLIC_MEDIA_BASE_URL`).
2. The credentials in the server's environment (never in chat or in a file of the project). Also
   `EDITORIAL_CONTACT` and `EDITORIAL_RESPONSIBLE`.
3. The live stream's key (`YOUTUBE_STREAM_KEY`) and the live video's id. A test into files first
   (`tools/publish/live.mjs --out …`).
4. Switching on, one network at a time: `PUBLISH_LIVE=1`, `settings.dryRun: false`, `settings.live.youtube: true`.

**The other desks':**

5. C2PA signing set up (`c2patool` and a signing identity). The compliance module is merged; notes 1 and 2 above are
   settled.
6. Real pictures in the stories (the cleared-pictures desk). Offline, the light stories show the studio, boards and maps
   only, and a story clip would hold better with its picture.
7. **The writer composing its own sentences** (`verbatim.md` §5, the writer team's). Until it does, the verbatim
   rule holds most news: on 17 Oct 10 of COSMOS DESK's 11 stories broke it (12 of WORLD NOW's 13, all 6 of NEWS IN
   60's, 10 of SEVEN DAYS' 15), so the factory made no COSMOS DESK clip and its upload is held. PAY ATTENTION, whose
   questions are quoted and credited, is unaffected.
8. The articles' cache (`data/compliance/articles`, the compliance desk's audit). Until it is filled, a text post
   carries no line of the channel's aired text, because no aired sentence can be checked against the article it may
   come from: a post is the channel's label and the outlet's headline cited.
9. The writer's kickers and map places: on 17 Oct the channel said VOLCANO for black-hole "eruptions", JUSTICE · USA for
   a trial in Mexico and EDUCATION for a school shooting. This desk leaves out any label a story's own words do not
   bear out, but the channel aired them.

**This desk's, next:**

10. WORLD WEATHER's map shots in the vertical picture (each continent's map and the "graphic" world map): a window on
    the horizontal frame whose labels can reach the feeds' right band and be cut at the edge. Not a moment the
    factory picks yet.
11. FULL TIME's first real edition (when the weekend's results are in the archive) through the factory and judged in
    vertical before its clips are approved. Until then its four vertical boards are proven on the sport lab's cases
    and a demo edition.
12. A re-gate of the queue (`tools/publish`): a clip queued before a rule changed is checked again only when it is
    published.
13. After two weeks of numbers (`plan.md` §7), the weights of the kinds of moment (`moments.js` `KIND_BASE`).
