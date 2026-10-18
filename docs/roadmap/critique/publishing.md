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

## Round 5: the desk's own list, and the panel again

Round 4 was merged at 9.8 (ad18e7c). Since then main gained the cleared-pictures desk (ca5155c): a compact rights
record on every picture (`imageRights`), the locator and topic boards for a story without a picture, and outlet photos
only in a private preview. The coordinator's round 5 came from this desk's own list. The verbatim limit stays the
writer team's and is not counted against this desk, but it is reported where it bites.

### What was asked, and what was done

1. **WORLD WEATHER's map shots in vertical** (they were a window on the horizontal frame, and "MEXICO C…" was cut).
   - They are now composed again for the stage by the weather centre's own code (`drawWeatherVertical`, `vertical.md`
     §3.6): the world, each zone and the warning.
   - Every word is inside x 8–188 and the stage, checked word by word on the world, three zones and the warning, frame
     by frame.
   - The world camera follows the voice. It opens on the first place named and pans to each place, high or low named
     next, and the one being named is lit in the column.
   - The cause of the crop was found too. `weatherView` read `ST.shot.shot` (the shot is a string), so it always
     reported no shot. The world graphic fell through to a window at the wall presenter's mark, and the close-up's
     window was centred on the wall presenter, not the close-up's.
   - The world time-lapse is a clip moment of its own (`weather-map`, THE NEXT 24 HOURS).
2. **The article cache** (`server/articlecache.js`, `verbatim.md` §4).
   - The archive keeps, beside each story it records, the text the news desk already read: the article (at most
     2,400 characters), or else the feed's full text (`content:encoded`).
   - Text only, at most 6,000 characters, expired after 14 days, written when the episode telling the story is made.
     Nothing is fetched for it.
   - `archiveGetStory` reads it, so the factory, the upload, the publisher, the re-check and the posts writer all
     measure against it.
   - **Reported plainly:** the news desk's article reader does not consult robots.txt or terms. The cache adds no
     reading, but it keeps what was read. `ARTICLE_CACHE=off` and a feed's `"cache": false` switch it off, and keeping
     the extracts is item 11 of the lawyer's list (`compliance.md` §9).
3. **The re-check of what waits** (`recheck.js`, `tools/publish/recheck.mjs`, `pipeline.md` §4.1).
   - Each publisher round first runs the gate again on everything pending, approved or scheduled. It runs against the
     current rules, the register, the archive and articles as they are now, and each picture's record judged again
     under today's licence terms (`rights.js` `rejudge`, which never clears what was not cleared).
   - What no longer passes is held, its slot given back. The approval page says *Retenido al revisarlo otra vez antes
     de publicar*, with each reason in Spanish.
   - An item the re-check held that passes again goes back to the owner, never straight out.
4. **Pictures in clips** (`vertical.md` §3.7).
   - The credit is drawn in the tall frame wherever a picture or a link's file footage is on the stage. Before this
     round a vertical clip carried **no credit at all**, because the horizontal graphics draw the credits and a
     vertical master does not draw them.
   - A story with no picture gets its locator or topic board, prepared for the tall backdrop.
   - A moment that shows a picture not cleared, or any moment of a private preview, is never chosen or queued
     (`markUncleared`), even with `--all`. A whole-programme upload with one is not queued either.
5. **The first real FULL TIME edition:** see the end of this round.

### What ran

- WORLD WEATHER (13:20, demo data) in vertical, every moment, the master kept: four clips, including the new world
  time-lapse. They are never queued: the gate refuses demo data, as it should.
- COSMOS DESK (17 Oct, 07:30) made into a **demo edition with pictures**, because the offline material carries none.
  The pictures are the repository's own fixture art (`config/fixtures/img`), served by the factory's new `--pictures`,
  with DEMO credits. It was recorded three ways, so that every case reaches the stage:
  - the montage's teased stories without pictures (a place, and a story without a place);
  - a cleared FILE picture on a teased story (the headline frame's credit);
  - a cleared picture with a credit long enough to wrap, on the story the director shows full frame, and an outlet
    photo not cleared on a teased story, as a private preview would carry.

  In each run the factory refused the two moments that show the uncleared photo. It queued none of the others,
  because they copy their sources (the writer team's limit) or are not light.

  COSMOS DESK's director showed a full-frame picture for only one story in each run. Most of its stories stay on
  their map or their reader, whatever the picture, so the full-frame credit was judged on that one story.
- The re-check on a copy of round 4's queue (35 items, the real module), then again with a demo copyright takedown in a
  scratch register.
- The 4x sheets, with the platforms' covered zones tinted.

### First pass: what the panel found

**Standards editor.**

1. **A takedown did not hold the clips made from the story.** The re-check's first run with a demo copyright takedown
   on one of PAY ATTENTION's question stories checked 35 items, and all 35 passed. The gate read the register only for
   the episode's story list, and a quiz episode has none: its questions carry their stories. Also, the factory, the
   posts and the upload never gave the gate the register at all.
2. **No credit on any vertical clip.** The cleared-pictures desk draws each picture's credit in the horizontal graphics,
   and a vertical master draws no horizontal graphics.
3. **The article reader does not honour robots.txt.** Item 2 asked the cache to respect it "exactly as the existing
   readers do". They do not consult it. Nothing new is read for the cache, but keeping the text is a new copy.

**Pixel artist.**

4. **The first vertical credit was in the micro face**, below the compliance desk's own floor for a vertical label (the
   body face, 35 px on 1920).
5. **The locator's name covered its own dot.** At 216 px there is no room either side of a place at the column's
   middle for "CALIFORNIA, USA". The name was pushed back over the dot.
6. **A white tick on the world's clock plate.** The named city's bracket corner was drawn over the clock (after HOURS).

**Senior broadcast director.**

7. **The close-up's window was centred on the wrong man** (the wall presenter's mark, not the close-up's), the same
   `weatherView` fault as item 1 of the brief.

**Platform growth specialist.**

8. **The world time-lapse, the weather's most watchable minute, was never a clip.**

**Standards editor, on robustness.**

9. **A long-running publisher measured against a stale archive.** It read the archive's stories once per process.

**Standards editor, on PAY ATTENTION.**

10. **PICTURE THIS's pictures were never checked.** The gate counts a picture only on a segment flagged `hasImage`. A
    quiz question's picture comes from the archive and carried no rights record at all, so no check ever saw it. In a
    private preview, where the archive offers outlet photos, an outlet's photo could have gone out in a quiz clip.

### Fixes after the first pass

- **1.** `preflight` reads the register on the item's own stories (`storyIds`: a clip's, a post's), once per story.
  The publisher's gate view, the factory, the posts and the upload all pass it, with the register. The same takedown
  now holds five items: the question on four networks, and its round. A test covers a quiz clip, a post, and a news
  clip counted once.
- **2, 4.** `drawVerticalCredit`: FILE (FILE 2023, PHOTO) and the credit in the body face, white and silver on black.
  It sits under the source plate inside the safe column, wrapped at whole parts and words and never cut, with PREVIEW ·
  NOT CLEARED in yellow under it in a preview. A test checks the column, the face, the plates, and every letter of a
  long credit at three widths.
- **3.** Reported, not hidden. The switches are added, and the lawyer's list has the question. Whether the reader
  should honour robots.txt is the news desk's and the lawyer's call.
- **5.** `locator.js` `placeLayout`: with no room either side, the name goes under the dot. A test checks that the dot
  is never under its name.
- **6.** The vertical maps reserve their plates first and draw them again last, so nothing lands on them.
- **7.** `weatherView` reports the shot, and the close-up's own presenter for the close-up.
- **8.** `weather-map`: THE NEXT 24 HOURS / AROUND THE WORLD.
- **9.** The archive is rebuilt at each round's start (`Publisher.recheck()`).
- **10.** The quiz desk carries the archived picture's rights record onto the question (`desk.js`, `rounds.js`). The
  compliance audit counts a PICTURE THIS picture like any other (`credits.js` `auditItem`), and the factory refuses a
  moment that shows one without a cleared record. A local fixture's own file is the operator's, as before.

### Second pass: the sheets, the re-check, the queue

**The 4x sheets** (the channel's pixel at 4x; the platforms' covered zones tinted red):

- `vertical-4x-weather-maps.png` shows:
  - the world opening on the low near Greenland and panning to the high over Siberia, lit in the column;
  - the weather-map clip as delivered, its hook (THE NEXT 24 HOURS / AROUND THE WORLD) over the title band;
  - North America with MEXICO CITY whole; South America; Europe; Africa and the Middle East; Asia; Oceania;
  - the warning panel centred under the storm;
  - the close-up's window for comparison.
- `vertical-4x-pictures.png` shows:
  - the locator (CALIFORNIA, USA, its name under the dot) and the topic board (HEALTH) behind the montage's headline;
  - a cleared FILE picture in the headline frame with its credit (FILE · DEMO PHOTOGRAPHER · CC BY-SA 4.0 ·
    PIXELATED, on two lines);
  - the same frame with an outlet photo: PHOTO · BBC SCIENCE and PREVIEW · NOT CLEARED;
  - a full-frame picture with the long credit wrapped in three lines under the source, whole.
- `approval-recheck-held.png`: a card the re-check held, with its reason in Spanish and the register's own message
  under it.

In every frame, every word is inside x 8–188 and above row 300. Under the tint there is only map, picture or ground.

**The re-check** on round 4's queue (the real module): 35 checked and 35 still pass, as nothing had changed. With the
demo takedown: 5 held, each with "Hay un aviso en el registro…". Nothing was scheduled or sent.

### The final table

| Category | Score | What keeps it from 10 |
|---|---|---|
| Clip quality | 9.8 | Under the verbatim rule the offline material still gives no news clip (the writer team's: `verbatim.md` §5). The weather's clips are demo data, never queued. A clip can still open on a board's first wiping frames |
| Vertical design | 9.8 | The weather's maps are composed natively, without the presenter (the close-up keeps him). Pictures and their credits are proven on a demo edition (fixture art, DEMO credits), not on real cleared pictures. A montage headline past four lines drops to 1x |
| Text posts | 9.8 | The article cache is in place and tested, but it fills only as the channel airs with this code: today's posts still carry no aired line. A five-word aired headline under the six-word floor still passes as the channel's |
| Pipeline robustness | 9.8 | The re-check holds what changed while waiting, and takedowns reach quiz clips. The gate audits pictures across the whole episode, so one uncleared picture holds every clip of its episode (on the safe side). The live supervisor is proven into files only |
| Compliance integration | 9.8 | Credits in vertical, the register on every item, licences judged again, uncleared pictures never queued. The article reader does not honour robots.txt (the lawyer's list, item 11). C2PA signing is not set up |
| Tests | 9.8 | 136 publishing tests (131 in round 4), plus the article cache, the register on an item's stories and the config switch. Rendering is still judged by eye on the sheets: the stray bracket on the clock and the name over the dot were seen there first |

**Round 5: 9.8**

### After the merge with the pictures desk's round 8

The coordinator's branch gained the pictures desk's round 8 during this round (984cadf). Its topic board shows the
story's own figure, quote, actor or topic, where round 7 showed a glyph, and its geometry is the horizontal frame's
(right-aligned to x 365, rows 74–123). The merge keeps that board as it is on air. It adds a `frame` option, so the
vertical headline frame sets the same board in the safe column: right-aligned to x 184, between rows 30 and 112 of
the backdrop, above the tallest headline plate. A description that does not fit the narrow box is left out rather than
cut. The vertical test now draws a figure, a quote, an actor and a section tile in the tall frame. It checks that every word
is in the column and that the board stays above the headline. `vertical-3x-topic-boards-round8.png` shows the four
in the headline frame (the topic board on `vertical-4x-pictures.png` is round 7's, drawn before the merge).

### FULL TIME's first real edition: not yet

The real weekend results reach the archive with the sport snapshots of 17 Oct at 18:40 UTC and 18 Oct at 17:50 UTC.
When this round ended (17 Oct, before 18:40 UTC), neither was in. `data/sport-snapshots` held only the three of 13 Oct,
and today's archive held no FULL TIME story. So no real FULL TIME edition went through the factory this round. Its
vertical boards are proven on the sport lab's cases and round 4's demo edition only. When a snapshot lands, the
edition is made from it (`tools/sport/edition.mjs <snapshot> <air time> <out>`). It then goes through the factory in
vertical with every moment and the master kept (`--formats vertical --all --keep-masters --no-queue`), and is judged
on a 4x sheet before any of its clips is approved.

## Round 6: the outlets' robots.txt, and FULL TIME's first real edition

Round 5 was merged at 9.8 (5c81261). Round 5 had reported plainly that the news desk's article reader did not consult
robots.txt. Round 6's main job was to make it do so. Its second job was the first real FULL TIME edition, from the
Saturday sport snapshot due at 18:40 UTC.

### What was asked, and what was done

1. **The news reader respects robots.txt** (`server/robots.js`, `compliance.md` §6.1).
   - Every page the desk opens goes through one door, `NewsDesk.fetchText`: the article for the writer
     (`readArticle`), the page and its AMP page for a picture (`pagePictures`, `resolveImage`, other outlets' pages of
     the same event too), and every redirect hop of each (`guardedFetch`'s new `beforeHop`). The feeds go through it
     with `robots: false`, as asked.
   - RFC 9309: our token's groups combined, else `*`; exact tokens, never substrings; the longest match, an Allow
     winning a tie, `*` and `$`, on the path and the query. A file is kept 24 hours in memory and in `data/robots/`
     (only our rules, about 1 KB per origin). A 4xx allows everything; a 5xx, a 429, a network failure, a timeout or a
     sixth redirect disallows everything until the next try (30 minutes). Crawl-delay spaces our requests per origin.
   - A refused page is never requested. The story keeps its feed's text and pictures (`pageRefused: 'robots'`, in the
     desk view and the pipeline log), and the article cache keeps only the feed's text for it, replacing or removing an
     article text kept before.
   - The user-agent is now `Mozilla/5.0 (compatible; GLOBIT24/1.0; +https://github.com/choco-studio/livenews)` in the
     news desk, the picture downloads and the tools. `LiveNewsBot` is gone from the repository.
   - The tools that open pages use the same door: the sport snapshot, the length tools, and the verbatim audit (which
     fetched with its own user-agent and no robots.txt until now).
   - The outlets' terms are item 12 of the lawyer's list.
2. **FULL TIME's first real edition:** see the end of this round.

### What ran

- `tools/compliance/robots-report.mjs --sample 2` on today's 31 feeds through the proxy, twice (before and after the
  fixes below), and every article link of the archive (1,430, 14 days) against the same files.
- The feed pictures' hosts against their own files (for the record: the desk does not gate pictures).
- The 13 Oct sport snapshot's saved pages against today's files: 28 pages, none refused.
- `test/robots.test.js` (25 tests, six fixture files), and the desk's existing tests with the robots.txt read in
  front of every page.

### First pass: what the panel found

**Standards editor.** The first live reading, on the first version of the door:

1. **Al Jazeera lost every article.** Its feed tags each link `?traffic_source=rss`, and its robots.txt keeps the
   tagged copies of its pages from every crawler (`Disallow: /*?traffic_source=`, and the same for `fbclid`, `gb`, `q`
   and `playlist`). All 25 of today's stories were refused, and 238 of the archive's 1,430 links. The writer would
   have had a 100-character summary for each, as the feed gives no full text. The file keeps the duplicates, not the
   articles: the article addresses themselves are open.
2. **A passing 4xx counted as "no file" for a day.** Euronews answered the first read with a 406 and the next with its
   file (29 rules). The RFC allows everything on a 4xx; holding that for 24 hours would have let a bot shield's
   refusal or a hiccup stand for a day.
3. **Sky News's bot shield.** Its robots.txt and its pages answer our user-agent with a 403 (Akamai). The RFC reads the
   403 as "allowed", so the desk would knock on every new story's page and be refused every time.
4. **The verbatim audit** fetched pages with its own user-agent, followed redirects blindly and never read robots.txt.
   Its cached article texts shared the article cache's folder.
5. **The old user-agent** (`LiveNewsBot/0.1`) was still in the picture downloads, the play desk's snapshot and the
   pictures desk's sheet tool.
6. **Pictures.** A picture is downloaded without its host's robots.txt. As asked, a story keeps its feed's pictures,
   and a picture is not a page; but the record should show whether any host minds.

**Director (the snapshot tools).** The sport snapshots key each saved page by the feed's link. Dropping the tracking
tags before the desk's replay hooks would have made every BBC page of the old snapshots "missing", and a replay would
have gone to the network for them.

### Fixes after the first pass

1. Pages are opened at their own address, without the feed's tracking tags (`news.js` `pageUrl`: `utm_*`, `at_*`,
   `traffic_source`, `maca`, click ids), and robots.txt is checked for that address. Al Jazeera: 25 of 25 open. The
   story keeps the feed's link for its credit. The reading is the lawyer's to confirm (item 12).
2. A 404 or 410 is kept for the day; any other 4xx for an hour, then the file is read again.
3. An origin whose page answers 401, 403 or 429 is not asked for another page for six hours (30 minutes after a 429).
   Sky News: one try per six hours instead of one per story. The desk never poses as a browser.
4. The audit opens pages through the same rules and user-agent, on every hop, and drops a cached article text whose
   page robots.txt now keeps from us.
5. One user-agent everywhere, from `server/robots.js`.
6. Read for the record: 15 picture hosts, none keeps a picture from us (`compliance.md` §6.1).
7. The tags are dropped inside `fetchText`, behind the replay hooks: the old snapshots still find every page.

### Second pass

- 17 hosts; every file read; none names `GLOBIT24` or `GLOBIT`; 458 named tokens, none ours or near a word of our
  user-agent; no host keeps an article address from us; no `*` group of theirs sets a Crawl-delay (ESA's does, 2 s, but
  its feed gave no story today; CBC's file timed out from here, so its pages wait).
- **What the writer loses: nothing today**, 0 of 393 stories. An article page gives the writer about 1,900 characters
  where it is read (34 pages sampled).

### FULL TIME's first real edition

The 17 Oct 18:40 UTC sport snapshot landed during the round, and the edition was made from it and put through the
factory in vertical. The session stopped before this part of the log was written; what follows is what its commits
and its last, uncommitted edits establish (carried into round 7, below), not a judged sheet.

1. **Copied words passed as "unverified".** The edition told stories the station's archive never kept (a replay from
   a snapshot), and the compliance lint counts a story without sources as `unverified` and lets it pass unless asked
   to be strict. The factory found nothing copied in an edition whose lead was an outlet's sentence word for word.
   Fixed in the door (964885d): `sources-missing` for every story an item tells whose sources are not at hand, in the
   factory, the upload, the publisher and the re-check; `--sources <dataDir>` reads another data folder's archive.
   Until the station airs FULL TIME itself (its stories then reach the archive), a replayed edition's clips are held.
2. **An empty stage in the montage.** The sport theme draws no topic board, so a result with neither a picture nor a
   place opened the vertical headline frame on bare ground. The story's sport (its strap's kicker, the horizontal
   frame's chip) is now set as an ink tab with the programme's accent bar in the field, at 2x when it fits the safe
   column, above the tallest headline plate, wiping in after the cut (`vertical.js` `sportTag`); the test draws
   FOOTBALL, RUGBY UNION (2x) and WINTER OLYMPICS (1x) and checks the tab and its word inside the column.
3. **The source before its headline.** "SOURCE: …" stood on the bare field before the plate wiped in; it now waits for
   the headline's first line.

The edition's 4x sheet was not judged in round 6; FULL TIME's clips stay unapproved until it is (item 10 below).

## Round 7: the beta, published by hand

The owner wants a usable beta on Sunday 18 Oct. It has **no live stream** (the 24/7 live waits for the pre-rendered
playout another desk is building) and is **published by hand**, because the networks' API audits take days or weeks:
an unaudited YouTube API project's uploads are locked private, and TikTok's Content Posting API posts privately until
the app is audited. Round 6's last, uncommitted edits (the FULL TIME tag in the vertical headline frame, the source line
timed with the plate, and this log's round 6) were a finished fix with a passing test and are carried into this round.

### What was asked, and what was done

1. **Hand publishing on the approval page** (`server/publish/manual.js`, `approval.js`; `pipeline.md` §8). For each
   approved item: **Preparar para publicar** signs the clip and its cover into copies beside them (C2PA,
   `compliance.markFile`) and runs the gate again on what will go out: the signed files (read back), the exact words to
   paste, the flags the owner will set, the register and the stories' sources as they are now. What fails is held by
   `recheck`, with its reasons in Spanish. Then **Descargar** (the signed vertical clip, or a programme's horizontal
   one, and the cover), **Copiar** per field (YouTube: the title, the description with the disclosure first, the
   credits and who answers for the channel; TikTok and Instagram: the caption, its first line the AI disclosure, then
   a line of credits; the hashtags; a text post's text and its article's link), **the network's own switches** ticked
   one by one (YouTube "altered or synthetic content" yes and "made for kids" no; TikTok's "AI-generated content" label,
   the privacy, no branded content; Instagram's "AI info"), and **Ya lo he publicado**, with the post's address on the
   network's own host. That records the publication in the queue (`published`, `result.manual`), the real ledger
   (nothing twice) and the compliance register (`recordPublication`: a takedown finds it). The networks' wording is
   quoted only as `compliance.md` §2.5–2.7 read it; the apps' Spanish labels were not read, so each switch is
   described by what it does.
2. **The beta profile** (`PUBLISH_MODE=manual`, `mode.js`): `Adapter.request()`, the one door of every live call (the
   live title's too), refuses, and `publish()` only describes; the publisher's round only re-checks (no schedule, no
   dry run, which would have marked items published and taken them off the page); `live.mjs` refuses to stream; the
   page offers **the day's pick** (`dailyPick`: Phase 1's lower ends, 3 Shorts, 3 TikToks, 2 Reels, a text network 2;
   never held, grave or already published) and no "Programar". `tools/publish/beta.mjs` runs the day (`hacer`: the
   Phase 1 programmes remade from the archive with their voices, their clips in vertical, the day's posts for the
   networks set to Manual; `estado`; no argument: the page). The owner's one-page guide, in Spanish, is
   `docs/publishing/beta.md`, with two screenshots of the page.
3. **The launch check for the beta** (`tools/compliance/cli.mjs launch`; nothing weakened; `beta.md`, `compliance.md`
   §9): it blocks on five things. **For the beta:** `EDITORIAL_CONTACT` (the gate refuses every item without it), and a
   working C2PA SDK on the server that signs the files (present here; not yet in the owner's server's install steps:
   added to `server-setup.md` §2). **Only for the full launch:** the trusted C2PA certificate (the development chain is
   what `compliance.md` §4 expects before it; validators show "signing certificate untrusted", so the networks' own
   labels are set by hand), `RIGHTS_GATE` (on-air pictures; there is no air), the Open-Meteo plan (no weather clip is
   offered) and the verbatim rate of what aired (97 % of the last 300 stories; it holds the live stream, while each
   beta item is measured on its own). Found on the way: `weather.js` calls the free API with no key, so setting
   `OPEN_METEO_API_KEY` clears that blocker without changing what the code calls.
4. **A beta day on today's material**: below.

Also: a clip's caption now opens with its AI disclosure (`clipmeta.js`), where it was the last line; `compliance.md` §1
asks for "the caption's first line".

### What ran

- `tools/publish/material.mjs` on today's archive (17 Oct, with the station's voices), the code as merged at the start
  of the round: COSMOS DESK and TECH BYTES at 22:00 UTC; PAY ATTENTION from 13:00 UTC; FULL TIME (nothing made: no
  sport story reached today's archive); WORLD WEATHER left out (offline it is the demo forecast, never published).
- `tools/publish/beta.mjs hacer` into a scratch queue, with every text network set to Manual and a placeholder
  `EDITORIAL_CONTACT` (without one, everything is held: that is today's state on the server).
- The page in hand publishing, driven in a browser: approve, prepare (real C2PA signing with the development chain,
  the real gate), download, the switches, "Ya lo he publicado".
- `test/publish-manual.test.js` (13 tests) and the full suite.

### The beta day, 17 Oct

What `beta.mjs hacer` gives for a beta day on 17 Oct (cleared pictures only, the verbatim gate, the sources gate):

| Programme | Moments | Offered | Why the rest is held |
|---|---|---|---|
| PAY ATTENTION (remade from 13:00 UTC; the quiz desk planned an edition from 14:00, 15:55 and 17:50 London, none from 19:45 or 21:30) | 13, all light | **5 clips** (four questions, 25–32 s; a whole round, 53 s), each for YouTube, TikTok and Instagram: 15 items, all passing the gate | the factory's own choice (at most four questions and one round an edition) |
| TECH BYTES (22:00 UTC) | 17 | 0 (1 before the AI writer's merge: a 3.2-second story, a 6.5 s clip with its end card, under YouTube's and TikTok's 10 s, so for Instagram only) | 10 light moments copy their sources (`verbatim`); 6 are not light (crime, politics, conflict, harm); since the merge, the whole edition is the offline writer's (`offline-writer`) |
| COSMOS DESK (22:00 UTC) | 19 | 0 | 13 light moments copy their sources; 6 are grave or not light; and `offline-writer` |
| FULL TIME | — | 0 | no sport story reached today's archive (the station did not air FULL TIME); the 18:40 snapshot's edition would be `sources-missing` |
| WORLD WEATHER | — | 0 | offline it is the demo forecast, never published |

- **Text posts** (only when the owner switches a text network to Manual; Phase 1 has none): 12 stories, 41 posts, 36
  queued for X, Threads, Bluesky and Telegram (Facebook off), all passing the gate; 22 are grave and stay out in Phase 1.
  The 14 light ones are each the outlet's headline cited with its link: no aired line, since no article was cached for
  them.
- **The day's pick**, with `EDITORIAL_CONTACT` set: **8 clip uploads**, 3 YouTube Shorts, 3 TikToks and 2 Reels, all
  PAY ATTENTION, plus 8 posts (2 a network) if the text networks are on. Re-checked after merging the AI writer
  (0b6910c): the same 8; the TECH BYTES Reel, which ranked under them anyway, is held (`offline-writer`).
  **Without `EDITORIAL_CONTACT`, as the server stands today: 0.** The re-check holds all 52 items
  (`editorial-contact-missing`).
- The writer is the limit, as expected: 23 of COSMOS DESK's and TECH BYTES' 25 light moments copy their sources. Since
  the AI writer's merge the gate holds every item of an offline-written episode (`offline-writer`), and
  `material.mjs`, which remakes the news programmes offline, writes them with the offline writer: the beta's news clips
  need the remake to use the AI writer (its episodes, voiced, through the factory). `beta.mjs` no longer records an
  offline-written edition.
- One clip went through the page in a browser: prepared (C2PA signed with the development chain, the real gate),
  downloaded (3.97 MB; its manifest reads back as AI-made, `signingCredential.untrusted` its only status), its title
  copied, every switch ticked, "Ya lo he publicado" with a YouTube address: published in the queue, the ledger and the
  register.

### What remains for the beta

- **The owner's:** `EDITORIAL_CONTACT` and `EDITORIAL_RESPONSIBLE`; the C2PA SDK on his server and `PUBLISH_MODE=manual`;
  a daily timer for `beta.mjs hacer` (`server-setup.md` §6); his three accounts.
- **The writer** (merged at the end of this round, 0b6910c): the station airs it with the owner's key, but the beta's
  remake (`material.mjs`) still writes the news programmes with the offline writer, whose items are never published.
  The remake with the AI writer (or the station keeping its own aired episodes for the factory) is this desk's next
  step; until then only PAY ATTENTION gives clips.
- **Very short clips.** A 3-second story passes every rule (sense 8 even with the −2 for "under 10 s"); a Reel of 6.5 s
  is not worth the owner's minute. A floor for publication (10 s, YouTube's and TikTok's own) is this desk's next call.
- **PAY ATTENTION's own gate** is not passed (9.6, `pay-attention-desk.md`): its clips are offered by the rules, but the
  owner should know its desk is still reading editions by hand.
- The PAY ATTENTION material is remade with a fresh week (`material.mjs`), so it can ask a story the station's own quiz
  asked this week; on the beta, with no live stream, nothing else aired.

---

## Notes for the compliance desk (integration)

The publishing desk calls the compliance desk only through `server/publish/compliance.js`. The two branches met on
17 Oct 2026 (bb7df4f), and the desk loads the real module. The first two points below were settled in round 4, and
the last two were added in round 5:

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
6. **The register on an item's own stories** (round 5, in `server/compliance/index.js` `preflight`). An item may carry
   `storyIds`, the stories it tells, and each is checked with `isBlocked({ storyId })`. A story the episode also lists
   is skipped, since `checkClip` reads it there. Without this, a takedown of a story never reached a quiz clip (its
   episode lists no stories) or a text post. The publishing desk passes `storyIds` and the register from the factory,
   the posts, the upload, the publisher and the re-check.
7. **Picture records judged again** (round 5, `server/rights.js` `rejudge`). The re-check rebuilds each cleared compact
   record with `rightsRecord` under today's `LICENCES` and keeps the stricter verdict. A record that was not cleared is
   never cleared again. `credits.js` `pictureRecord` then reads the result as before. `auditItem` now also counts a
   PICTURE THIS question's picture (`seg.quiz.question`, with the `imageRights` the quiz desk copies from the archive).
8. **A story without sources is not "unverified" but refused** (round 6, in the publishing door,
   `server/publish/compliance.js` `preflight`). `lintEpisode` counts a story whose sources are not at hand as
   `unverified` and lets it pass unless `strict` is set, and `preflight` never sets it. The door adds
   `sources-missing` for the item's own stories (every story of a whole programme), so nothing published escapes the
   verbatim rule by absence. The compliance desk may want its own `preflight` to be strict by default; the door's
   check would then simply find nothing more.
9. **The article cache and robots.txt** (round 6, `server/articlecache.js`). A story whose page the outlet's
   robots.txt keeps from us (`story.pageRefused === 'robots'`) gives only its feed's text, and an article text kept for
   that link before is replaced or removed. `tools/compliance/verbatim-audit.mjs` opens pages through the same rules
   and drops such a cached text too. `archiveGetStory` reads the files as before.

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
6. Real cleared pictures through the factory (the cleared-pictures desk's are merged; the offline material carries
   none). The vertical credit, the boards and the never-queued rule are proven on a demo edition only.
7. **The writer composing its own sentences** (`verbatim.md` §5, the writer team's). Until it does, the verbatim
   rule holds most news: on 17 Oct 10 of COSMOS DESK's 11 stories broke it (12 of WORLD NOW's 13, all 6 of NEWS IN
   60's, 10 of SEVEN DAYS' 15), so the factory made no COSMOS DESK clip and its upload is held. PAY ATTENTION, whose
   questions are quoted and credited, is unaffected.
8. The outlets' terms (`compliance.md` §9, item 12) and whether the article cache may keep its extracts (item 11).
   Since round 6 the reader obeys each outlet's robots.txt (§6.1): on 17 Oct no host keeps an article address from
   us. The cache keeps only what the reader read, and can be switched off (`ARTICLE_CACHE=off`, a feed's
   `"cache": false`).
9. The writer's kickers and map places: on 17 Oct the channel said VOLCANO for black-hole "eruptions" (fixed in
   `topics.js` since), JUSTICE · USA for a trial in Mexico and EDUCATION for a school shooting. This desk leaves out any
   label a story's own words do not bear out, but the channel aired them.

**The beta's** (round 7, `docs/publishing/beta.md`): `EDITORIAL_CONTACT`, the C2PA SDK on the owner's server,
`PUBLISH_MODE=manual` and the daily `beta.mjs hacer`. Nothing else in the launch report stops a beta published by hand.

**This desk's, next:**

10. FULL TIME's first real edition judged in vertical on a 4x sheet before its clips are approved (round 6 made it
    and fixed the empty stage; its stories' sources must be in the archive, or it stays held: `sources-missing`).
11. The article cache's first days on air: measure how many aired stories it covers and how many posts then carry an
    aired line.
12. A clip-scoped picture audit at the gate (today one uncleared picture anywhere in an episode holds all its clips; the
    factory already scopes its own refusal to what a moment shows).
13. After two weeks of numbers (`plan.md` §7), the weights of the kinds of moment (`moments.js` `KIND_BASE`).
14. A floor of 10 s for a published clip (round 7: a 3-second story passed every rule).
15. Open-Meteo's paid plan wired into `weather.js` (its endpoint and key) before `OPEN_METEO_API_KEY` may clear the
    launch blocker (the compliance desk's check reads only that the variable is set).
16. The beta's news clips: `material.mjs` remakes with the offline writer (held: `offline-writer`); the remake with
    the AI writer, or the station keeping its aired episodes for the factory.
