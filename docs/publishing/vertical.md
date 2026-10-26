# The vertical picture (9:16), and a clip's own graphics

Shorts, Reels and TikTok are watched on a phone held upright. A crop of the 16:9 channel would cut presenters in half,
lose the boards' edges and shrink the type. The vertical picture is therefore **composed again, every frame**, from the
channel's own drawing code, in bands laid out for a phone. It is rendered by the real renderer in clip mode
(`?format=vertical`), recorded by the deterministic recorder, and scaled 5x by nearest neighbour.

Code: `public/js/clip/` (`index.js` the switch, `layout.js` the zones, `vertical.js` the compositor, `vset.js` the
programme's set stood on end, `vboards.js`, `vquiz.js`, `vweather.js` and `vsport.js` the boards, `captions.js`,
`graphics.js`, `cards.js`, `thumb.js`). Labs: `/lab/vertical.html` (every programme's frames from the real
compositor: its single, a board, a map, the montage, the end card, the quiz's boards; served by the playback server,
which answers `/api/channel`), `/lab/vquiz.html`, `/lab/vweather.html`, `/lab/vsport.html`, `/lab/clip.html`,
`/lab/thumb.html`; `/lab/weather.html` draws the vertical stage of the weather's map shots beside its frame.

**The vertical live (24 Oct).** The same picture airs as a second 24/7 stream for the vertical feeds (YouTube's Shorts
feed, and the other vertical platforms where the channel is allowed to stream): drawn from the same frames as the
horizontal channel by the pre-rendered playout, with the channel's own moments (the ident and its AI notice, the break,
the spots in a window, the promo, the countdown) set for the frame. See `playout.md` §13.

**Round 10 (owner, 18 Oct: "eso queda fatal", "el fondo no pega nada").** Until round 9 the frame was a flat dark
field with the bands in black: a small board floated in empty space, every programme looked the same, and a clip could
open on a panel half wiped in. Since round 10 every frame is the programme's own studio, stood on end (§1, §2), boards
sit on glass in the set's own frame and are set as large as the stage lets them (§3.3, §3.5), and a clip opens on a
composed frame.

## 1. Principles

- **The same pixel.** The vertical frame is 216 × 384 at 1x and 1080 × 1920 at 5x, so its pixel is the channel's pixel
  (384 × 216 × 5 = 1920 × 1080). Nothing is resampled and nothing is drawn at a fractional scale: a 2x caption is 2x of
  the same 5×7 face.
- **Designed, not cropped.** Each shot type has its own layout (§3). Only a shot with no vertical layout yet falls back
  to a window on the horizontal frame.
- **Readable on a phone with the sound off.** Captions at 2x (14 px caps at 1x, 70 px on a 1080-wide screen), the hook
  at 2x, every word inside the platforms' safe area.
- **The programme's own set, stood on end** (`vset.js`). Under every band, edge to edge and top to bottom, is the
  programme's studio, drawn by the studio's own renderer (v2 `studio/set.js`: its wall, dressing, light and desk) for a
  tall picture: WORLD NOW under its four clocks before the city at night, TECH BYTES before its circuit board, COSMOS
  at its window on the Earth, MONEY MINUTE in its panelled room under the ticker, NEWS IN 60 in its control room,
  SEVEN DAYS before its sunset skyline, FULL TIME by its floodlit pitch, PAY ATTENTION under its marquee, WORLD
  WEATHER in its weather centre. Its lights breathe (§2). There is no flat field and no empty band.
- **Large.** A presenter is the studio made tall (§3.1), shoulders across most of the frame; a board takes the whole
  stage and its type the largest size that fits (§3.3, §3.5).
- **Whole from the first frame.** Nothing wipes in on the vertical frame: a board's glass and frame are there from the
  shot's first frame, its kicker and first rows already in place, its later lines popping in whole at their beat, never
  half risen out of a mask (§3.3). A clip therefore opens on a composed frame, whatever shot it opens on.
- **Disclosed.** The end card says it in the channel ident's words, the caption opens with it, and the platform's own
  AI label is required on every clip (`compliance.md` §3.2). The RECREATION label is set for the tall frame when a
  recreation is on screen (§3.8). Nothing stands over the clip's first seconds, and the bug stands clean (owner, 18 Oct:
  no AI plate beside it, the ident's words only),
  and no layout of round 10 adds one.

## 2. The grid and the zones (`layout.js`)

| Zone | Rows (1x) | What it holds |
|---|---|---|
| MAST | 0–31 | The channel's bug at (8, 10), clean, the programme's tag at the right (or the quiz's hook), on the set's ceiling under tinted glass |
| TITLE | 32–71 | In a clip, the hook on its black plate, all clip long (laid over the master: §5); round the plate, the set. The master draws nothing here. |
| STAGE | 72–247 (216 × 176) | The picture: the board on its glass, the map, the photo (a single runs on from row 58: §3.1). Over a single, a map or a picture, the story's source on a plate at the top left (SOURCE: NASA); NEWS IN 60's progress rule along its top edge. A board, the montage and a recreation carry their own credit. |
| CAPS | 248–299 | The captions: two lines at 2x on black boxes, over the set's lower wall or the presenter's desk |
| FOOT | 300–383 | The set's desk and floor under tinted glass, nothing to read and no logo: the feeds put their own buttons and text here, and the bug carries the channel's name. |

**The picture under the bands** (`vertical.js` `frame`): the programme's set stood on end (`vset.js` `backdrop`), or
the presenter's single made tall (§3.1), drawn first over the whole frame; then the stage's content; then the top and
the foot under tinted glass (`glassScrims`: the picture read back and every colour taken to the dark end of its own
hue, fading in over a few rows, so the bug, the tag and the feeds' own words read on a calm ground while the set still
shows); then the mast and the captions.

**The set stood on end** (`vset.js`). The studio's camera never rotates and its screen row is a pure offset
(`geometry.js`: sy = hy + (Y − cam.y)·k), so renders of one camera 216 rows apart meet without a seam. Each
programme's camera (`VSETS`: zoom 1.822 on the video wall, solved so the screen is the glass: 190 px wide on its
columns, its top and foot on its rows) is rendered twice for the frame: rows 0–159 with the set's header behind the
hook's plate (the clocks, the ticker, the moon's phases, the week's days peep out beside it), rows 160–383 from the
same camera 56 rows lower (PAY ATTENTION: zoom 1.622, rows 0–139, then 87 lower), so the wall's foot runs behind the captions (the city's lights, the
circuit board, the Earth's rim, the panelling, the pitch) and the desk with its GLOBIT 24 plate sits in the foot. The
two halves share every column (the camera only pedestals), so the set's uprights run straight through the seam,
which the board's glass covers; the screen between them is the wall's own field, a tall screen for a tall board. It is
baked once per programme; its practical lights (lone lit pixels: windows, stars, LEDs, lamps) breathe on their own
slow beats (`twinkle`), and the accent rule of a board's frame or a window catches a glint every 5.5 s (`glint`).
WORLD WEATHER airs from its own weather centre, not the network's studio: its tall view is drawn in the centre's terms
(`weatherBackdrop`: the rig across the top, the curved wall's glass with the satellite's cloud and an isobar, the cyan
LED line at row 288, the glossy floor mirroring the wall). Without the studio's renderer (node tests) the backdrop is
the programme's colours on a graded field.

**Glass** (`vset.js` `GLASS`, `glassRect`): a board stands on the set seen through tinted glass, 190 × the stage less
6 px (x 13–203, centred on the frame), every colour taken to the dark end of its hue (white and the greys to ink,
the warm colours to maroon, the blues to navy, the greens to their darkest): the set reads through as shapes and its
own colour, its lettering never does, and the board's type stands on nothing lighter than navy. Its frame is the set's
screen bezel with the programme's accent along the top (`drawBoardFrame`); PAY ATTENTION's is its marquee: a purple
band in a fog rim with a chase of gold lamps.

**The safe area** (`PLATFORM_SAFE`): x 8–188, y 32–300. TikTok, Reels and Shorts all lay their buttons over the right
edge (about 12 % of the width) and their caption and handle over the foot (about 20 % of the height), so every word a
viewer must read stays inside this box.

**The safe column** (`SAFE`: x 28–188, centre 108, the frame's). Pictures, maps, grounds and the studio fill all 216
columns, but everything to read is set in the column. Until 24 Oct the column was the whole safe area (x 8–188) and
everything was centred on x 98, ten pixels left of the frame's middle: the owner saw it ("está como descentrado").
Since then the column is the widest one centred on the frame that stays inside the safe area, and the mast, the
boards, the glass, the singles, the captions, the hook and the channel's cards are all centred on the frame:

- every board is laid out in `boardBox(stage)`, 8 px either side of the column (x 20–196), so its panel's padding,
  never its words, reaches past it; PAY ATTENTION's in `quizBox` (x 16–200: its words start 12 px in);
- the mast's bug and programme tag at the column's edges (`MAST`), the title band's plate across it (`TITLE_BOX`:
  x 20–196, rows 34–70; the clip's hook fills it and centres its lines on it);
- the captions are centred on the column's centre and are no wider than the column;
- the title band, the hook and the name tags are set inside it; the two-way's boxes, the end card and the quiz's
  strip are centred on it;
- the programme's tag in the mast ends at the column's right edge.

`test/publish-vertical.test.js` draws every board, card and band and checks that each word lies inside x 8–188 and
above row 300.

**The tall stage** (`profileOf`): PAY ATTENTION's boards and three people need height, so the quiz has no title band.
Its stage runs from row 32 to row 247 (216 × 216), and its hook lives in the mast.

**The montage stage**: the headline montage and STILL TO COME have no captions (the plate shows the words the voice
reads), so their stage runs on through the captions' band to row 300 (216 × 228) and nothing is left empty.

## 3. The stage, shot by shot (`vertical.js` `drawStage`)

### 3.1 Presenter singles (studio wide and close)

A second instance of the v2 stage (`runtime/stage.js`) draws the speaker's own single:

- It is fed a proxy of the scene with `shot: 'close'`, the speaker's focus and a framing for a tall picture
  (`verticalFraming`: the quiz host and players on their own seats; every other presenter, duo or solo, in the
  vertical's own single, camera.js `tall`: the close's scale, k 3.8, the head on the 384-wide frame's middle column,
  so the tall crop centres it over the safe column on either seat. It is not walked clear of the wall's bezel as the
  horizontal singles are: the wall behind is at rest, and the walk drifted the camera. Round 10's first pass used the
  close, whose walk left FULL TIME's seat A head at x 81 and seat B's at 316, past where a crop can centre them).
- Its own camera points at the voice's owner. Its cue clock runs on the same plan, so the presenter gestures on the
  same words as on air.
- **Made tall** (round 10, `vertical.js` `tallSingle`, `vset.js` `single`). The Stage's frame is shown whole, its 216
  rows from row 58, the speaker's head over the safe column's middle; above it and below it the set is rendered from
  the very same camera (hy + 216 and hy − 216), so the wall rises behind the head to the set's top and the desk runs on
  to the frame's foot: the presenter sits in the studio, shoulders across most of the frame, eyes about a third of the
  way down it, and no window edge cuts the picture. The extensions are rendered once per camera (a cut makes new
  ones). PAY ATTENTION's single starts at row 40 (its hook is in the mast).
- **The body goes on below the frame** (`vset.js` `singleBelow`): every frame the Stage's own actors are drawn again,
  at the same instant, over the set below (clipped by its desks and podiums: a contestant's podium is lower than a
  desk). The set below is rendered `OVERLAP` (8) rows higher and shown from the row the Stage's frame ends on: the
  rasteriser leaves a frame's first and last rows to the set, and a body crossing the join would otherwise show a
  line of wall.
- It cuts when the voice changes hands, as a director would, and the speaker's name tag rises for 4.5 s after each cut.
- The studio wall behind the single is at rest (`wall.js` 'rest'): the programme's art without its words. A plate, map
  label or wordmark would be cut in half by the tall crop.

### 3.2 Two-shots and the two-way

A two-shot on air becomes the speaker's single (§3.1): a phone shows one face well rather than two badly. The two-way
(correspondent and studio) stacks the two boxes one over the other, each 178 × 82 from the horizontal frame's own
boxes, on the glass over the set.

### 3.3 Boards (`vboards.js`)

Each story board is laid out again for the stage's width as a single column centred in the stage, on the glass over
the set in the set's frame (§2: `bare`, no panel of its own). Precedence is the horizontal card's own (`boardKind`).

- **As large as the stage lets it be** (`verticalBoardLayout(card, w, h, programId, bare)`): its words at 2x (`T2`) when
  every row and the source line fit the stage that way, else at the body size (`T1`), never shrunk past it and never
  cut. A lone figure goes to 4x when it fits, two or three to 3x; their labels a size under them. WHAT HAPPENS NEXT
  stands its calendar leaf over its words at 2x, the date in words beside the leaf (WEDNESDAY 28 OCTOBER); a loose
  "28 OCTOBER" is read as the date it is (OCT over a large 28), never cut to OCTOB.... The kicker and the source are
  in the body face (35 px on 1920), the kicker in the programme's accent.
- **Whole from the first frame.** Nothing wipes in. The board's own cascade is pre-rolled by `PRE` (1.6 s), so its
  kicker and first four rows are there on the shot's first frame (a figure with its label, a headline over its
  figure: a clip that opens on a board opens on the board, not on its kicker), and a fifth row and on pops in whole at
  its beat (`pop`), never half risen out of its mask.

On the channel's panel (the horizontal frame's own boards, unchanged) the panel wipes in from the left, the kicker is
in micro type, and rows rise in turn.

- **figures:** up to three figures with their labels (a fact that ends on its figure, ECONOMY UP 0.1%, is set as the
  figure over its label, not as a line of words). MONEY MINUTE's are on cream paper with an ink edge; on the
  glass the paper is the whole sheet, the glass's height, the rows centred on it (no small card floating in the screen).
- **known:** WHAT WE KNOW, its points.
- **timeline:** a vertical rail with up to three dates.
- **change:** from, an arrow, to, and the label.
- **term:** IN PLAIN ENGLISH, the term and its plain words.
- **quote:** the words and who said them.
- **who:** the people and their roles.
- **share:** a figure as a share, with a chart of people or tens.
- **next:** WHAT HAPPENS NEXT, the date and what.

A board that does not fit drops its source line first, then its last rows, and never shrinks its type.

**FULL TIME** (`vsport.js`), on the glass like every board (`box.bare`: no panel, no wipe, the RESULT kicker in the
body face in the accent; the RESULT card, all entrance, settled from its first frame: both names whole, both scores
landed, FT or DRAW under them):

- **The RESULT card:** the sport's icon and RESULT, the two names in one type size (2x when both fit; on the glass a
  long name takes two lines at 2x, PIXELBURG / UNITED; else 1x on up to two lines), the home side first when the source
  names one (HOME and AWAY under the names), the scores at 3x (4x on the glass)
  landing from above, the winner white with the accent's score, then FT or DRAW once both have landed, the stage and
  the source.
- **The SCORE CENTRE:** the board with its title in the accent, each result on two lines (home over away), so no name
  is cut. Up to four rows have 2x scores; five or six have 1x scores. The winner's score is in the accent; a draw's
  two are white, as on the RESULT card.
- **COMING UP:** the title in the accent, then a row for each fixture (two or three): its calendar leaf (the month on
  the accent, the day at 3x, the weekday) dropping in when its date is read, the two sides on two lines with V between
  them, the time under them, the sport's icon at the right and the source at the foot.
- **THE MOMENT ON THE BOARD:** the channel's chalkboard, its ground (football, rugby, American football) drawn to
  scale inside the box: the scale is the smaller of what the height and the width allow, so the distance is never
  bent to fit.

**SEVEN DAYS**: HOW THE WEEK UNFOLDED is the week's diary, as on air: up to five days, oldest first, the day at 2x in
its own column, a node on the rail, the day's headline beside it at 1x on up to three lines, never cut. A step with a
date instead of a day's name falls back to the timeline (the date over its words). THE WEEK IN NUMBERS is the figures
board under its own kicker.

### 3.4 Maps

The channel's world map (`scenes/worldmap.js`) takes any viewport. It is drawn with the story's view on a viewport
that ends 8 px right of the safe column, so the pin and the place's name land inside the column and are as sharp as on
air. The map's last column of sea is then repeated to the frame's edge (`seaStrip`): the strip under the buttons holds
only sea. A picture's pan does the same. A map, a picture, a location shot or the montage's backdrop is a window set
into the studio: the programme's accent rule along its top and its foot over a black shadow line, as the set frames its
own screens (`windowRules`), with the glint passing along the top one.

### 3.5 PAY ATTENTION's boards (`vquiz.js`)

Every quiz board is ported to one column for the 216 × 216 tall stage:

- PICTURE THIS, LETTER BY LETTER, WHERE IN THE WORLD? (with the map), HOW MANY? and TODAY OR NOT TODAY?
- the round's card (its name at 3x when it fits one line)
- DOUBLE OR NOTHING, the final scores and the table

They use the horizontal boards' own helpers (seats and their shapes, the masked words, the countdown cells, the
picture's whole-block sharpening, the credit lines), so a question reads the same in both formats. The player's
shape, never a letter, tells who locked in. `test/publish-vertical.test.js` draws every lab case at every moment and
checks that nothing leaves the box.

On the vertical frame (round 10) every quiz board stands on the glass inside the quiz's marquee (the set's own: a purple
band, a fog rim, a chase of gold lamps stepping every 0.12 s), bare, inside the band:

- **Large where the board is sparse.** THIS WEEK'S TABLE sets its names at 2x with the players' shapes at 2x
  (tonight's two in gold), the rank and games played beside them; its rows share the board. A short week is set like
  the round's card: THIS WEEK'S at 2x in gold over TABLE at 3x; with three players or fewer (the owner's case of
  18 Oct: two) the names go to 3x, the wins to 5x and the games played to a line under each name, rows up to 46 px;
  with four, rows of 34 px and the wins at 3x. The final scores stand at 5x under the names at 2x; the
  round's card has its number at 2x in gold over its name at 3x on up to two lines; LETTER BY LETTER's tiles go to 2x
  (15 × 21, or 13 × 19 for a headline with a long word) when every word fits the column and the rows fit the board;
  HOW MANY?'s guesses stand at 2x in their boxes when they fit; DOUBLE OR NOTHING's stake is in the body face.
- **Whole from the first frame.** A question board's kicker, frame, question and players' marks are pre-rolled
  (`PRE`, 0.9 s) and the boards that are all entrance (the round's card, the scores, the table, DOUBLE OR NOTHING's
  offer) are settled from their first frame (`SETTLED`); what follows the voice and the plan (the locks, the countdown,
  the reveal, the pick) keeps the board's own clock.

HOW MANY? asks its question in big type on the glass from its first frame (`shorts-v2.md` A3, 25 Oct): where the
kicker and FILL IN THE NUMBER stood, the kicker names the game (GUESS THE NUMBER · 2 OF 3) and the question asks what
it counts at 2x on up to two lines, from the question's figure (`scenes/quiz-ask.js` `askOf`: HOW MANY PONIES?, HOW
MANY LIGHT-YEARS?, HOW MUCH? for a sum, WHAT PERCENT? for a share; a label that is no plain plural, STEAM from "the
$789 Steam Deck", gives HOW MANY?). Never its answer: the words are the label's alone. The room comes first from the
guess boxes (21 rows instead of 25 when the sentence is long), then from the shorter question (HOW MANY?); a question
that still does not fit keeps the frame. Off the glass the board is as it was.

The space under the players' guesses has a job all question long, because the board is on screen while the host reads
and the countdown often runs over the players' faces: YOUR GUESS? at 2x over an empty answer box at 3x height, its
cursor blinking on the bed's half notes, and the countdown under it while it runs. At the reveal the box reads THE
ANSWER and the figure lands in it at 3x in the reveal's yellow, its label under it, the credit at the foot. The box is
one width whatever the answer, so it gives nothing away. On a board too short for all of it (a long question on the
glass), the module is compact: a 21-row box with the answer at 2x, the countdown at the foot; with a longer question
only its words stay in the strip (YOUR GUESS? at 2x, THE ANSWER over the figure at 3x or 2x at the reveal). A question
that leaves no strip at all (five lines under a two-line ask) gives its answer where it asked: at the reveal the
question turns to the answer in the reveal's yellow (THE ANSWER over ABOUT 100 PONIES), the peak where the eye already
is. The plan picks the question's own words first, then the answer's size, then the guess boxes' (`howManyPlan`). On
the glass the module is settled from the board's first frame, like its header.

### 3.6 WORLD WEATHER (`vweather.js`)

The weather centre's boards are set again in one column, in the same language: black plates, colour heads, the
centre's own symbols, and each temperature on a chip of its colour at 2x. All the chips on a board are one width, so
the value column has one edge (41° as wide as 39° and −12°).

- **HOT & COLD:** HOT over COLD, the three places the voice counts down on each side. Each wipes in as it is named and
  is framed while it is said. Once every place is said, the gap between the two ends appears.
- **THE NEXT THREE DAYS:** the day heads, then each city on a line of its own over its three days (symbol, high on its
  chip, low). The city being said is lit.

The board's countdown state is the weather centre's own (`scenes/weather/index.js` `weatherView`), so the vertical
board lights the same row on the same word.

The map shots are composed again for the stage, not cropped (`scenes/weather/index.js` `drawWeatherVertical`, round 5).
The weather centre draws them with its own code at the stage's size (216 × 176): the map runs to the stage's full
width, under the feeds' buttons too, and every word stays inside the safe column (x 28–188) and the stage.

- **The world ("graphic"):** the world at the horizontal graphic's own scale (1.2 px a degree), so about half of it
  is in view. The camera opens on the first place the voice names. It pans (1.1 s) to each place, high or low the voice
  names next, unless that one is already well inside the column. The high or low being named is lit in the column's
  middle. The clock (THE NEXT 24 HOURS), or the TODAY · HIGHS tab, sits at the top left; the scale and the data's
  credit sit at the foot, right-aligned on the column's edge.
- **A zone ("wall"):** the zone's cities fitted to the column. The Americas fill its height, and MEXICO CITY is whole.
  The camera flies in as on air and on to the next zone. The cities wipe in once it has arrived, with their names, and
  the one being said is in brackets. The tab, the clock, the scale and the credit are drawn as on the world map. The
  presenter is not in these shots.
- **A warning:** the storm in the band over the panel. The warnings panel is centred in the column and slides in from
  its edge, so it is never seen past it.

The close-up (round 10) shows the horizontal frame's whole height, 216 rows from the stage's top, centred on the
presenter over the safe column, as a window over the weather centre's tall view (`tallWindow`; `vweather.js`
`weatherCloseup`). The boards stand on the glass over the centre's wall, the maps are windows (§3.4). The world
time-lapse is a clip moment of its own (`weather-map`, THE NEXT 24 HOURS).
`test/publish-vertical.test.js` drives the weather centre through the world, three zones and the warning. It checks
every word, frame by frame, against the column and the stage, and checks that the high or low being named is in the
column.

### 3.7 Pictures, montage and tease

The story's picture fills the stage's width, panning as on air. The headline montage and STILL TO COME are set again
on the montage stage (§2, rows 72–300): the picture as the backdrop, centred on the safe column,
a black plate with the headline at 2x as tall as its lines need (1x past four lines), the source under them
(SOURCE: …), and TOP STORIES with the run's pips, or STILL TO COME, on the plate's top edge (in a clip the hook
holds the title band all clip long). The plate is whole from the shot's first frame and its headline is pre-rolled
(round 10): a clip that opens on the montage opens on its headline. The montage has no captions, because its plate shows the words the voice
reads.

A story with no picture has a board of its own, prepared for the tall backdrop (216 × 228):
- **With a place:** the locator board (`graphics/locator.js`, with its `anchor` and `frame` options). The place sits at
  the column's middle, a third of the way down, and its name stays inside the column above the tallest headline
  plate.
- **Without a place:** the topic board (`graphics/topicboard.js`, with its `frame` option): the story's own figure,
  quote, actor or topic, as the pictures desk's round 8 draws it. It is right-aligned to x 184, between rows 30 and 112
  of the backdrop, above the tallest headline plate. A description too wide for the column is left out, never cut.

FULL TIME keeps the plain ground.

**Credits.** A story's picture, wherever the stage shows it (full frame, B-roll, the headline frame), carries its
credit as its licence asks, and so does a link's file footage (`vertical.js` `pictureCredit`, `drawVerticalCredit`):
- FILE (FILE 2023, or PHOTO for a picture of the event) white on black, and beside it the author, the licence and
  PIXELATED silver on black, all in the body face (35 px on 1920, the compliance desk's floor for a vertical label,
  never the micro face);
- under the source plate over a picture (at the stage's top left in the headline frame), inside the safe column;
- the credit wrapped at whole parts and words, then under the tag across the column, never cut (the licence asks for
  all of it);
- PREVIEW · NOT CLEARED in yellow under it in a private preview.

The horizontal frame's credits are drawn by its own graphics, which a vertical master does not draw. Before round 5 a
vertical clip showed no credit at all.

A moment that shows a picture not cleared for publication is never chosen or queued (`moments.js` `markUncleared`,
`clips.md` §2). Neither is any moment of a private preview, even with `--all`.

### 3.8 Recreations

A recreation (AI RECREATION, words from public statements) is set for the tall frame by the compliance desk's own
layout (`graphics/recreation.js` `recreationLayout(rec, frame)` with `frame.vertical`):

- the plates at the stage's top right, inside the safe column: AI RECREATION on the label's yellow, WORDS FROM PUBLIC
  STATEMENTS, and the source's credit, all in the body face (7 px at 1x, 35 px at 1080 × 1920), never the micro face;
- the role and the name at the stage's foot, on up to two lines.

`server/compliance/clips.js` `checkClip` reads a vertical frame (`frame.layout: 'vertical-216x384'`, 1080 × 1920,
scale 5): the label must be whole, inside the frame and the stage, and legible at the output size. The factory also
measures that the label is there in every frame of the recreation (`labelEvidence`).

### 3.9 The fallback

A shot with no layout of its own shows the middle 216 columns of the horizontal frame, drawn at 1x. It is still
crisp, but it is a crop, and §8 lists what remains.

## 4. Captions (`captions.js`)

- The channel's 5×7 face at 2x: white caps on solid black line boxes, as the channel's subtitles.
- Pages of one or two lines break between words only:
  - a comma past half the width ends a line;
  - weak words ("in the") never end a line when they can go down with their noun;
  - a page turns on its first word, so it never shows a word before it is said.
- The word being said is lit yellow, from the recorded voice's word marks. **Over grave news nothing is lit.**
- No caption is drawn when the voice reads what the board shows: the quiz's "here's the sentence as it aired", a quote
  card or IN PLAIN ENGLISH (`boardRepeats`). The board is the caption then.
- Horizontal clips use the same captions at 2x, 336 px wide, over the strap or at the top over full-screen graphics.

## 5. A clip's graphics and cards (`graphics.js`, `cards.js`)

**Clip mode** (`?clip=1`) differs from the channel in a few ways:

- No clock and no LIVE tag, because a clip is not live.
- No ticker: its headlines belong to the hour it aired.
- The bug stays, with the programme's tag beside it for the whole clip. Nothing is drawn under it (a whole programme
  is uploaded from this recording, and opens on the channel's ident as on air).
- NEWS IN 60 keeps its progress rule, as on air: a 2 px track along the stage's top edge, filled in yellow as its
  minute runs (the title band is the hook's in a clip).
- The story's source is never in the foot (the feeds cover it) nor in the title band (the hook covers it): it is on a
  plate at the stage's top left while the story's strap is up.
- The strap, the RECREATION label and the link graphics draw exactly as on air, with one exception: a clip never shows
  another story's strap. A strap that is leaving is dropped at once. So is a strap whose headline belongs to a
  different story in the running order from the one the shot shows, because the director cuts to the next story a
  frame before its voice and its strap take over.
- On a full-screen map, the captions keep clear of the place label. They sit over the strap as always, unless the
  label is there (on air nothing covers it). Then they go to the top of the frame, if the label leaves room there.
  The map reports where it drew its label (`worldmap.js` `takeMapLabel`).

**The intro** (`clip/intro.js`, `shorts-v2.md` §6) comes before the clip: the programme's own spectacle for a phone,
four seconds at most, with its theme, ending on its emblem and logotype (never a plate), then dissolving into the
clip's first frames pixel by pixel along the diagonal, top right to bottom left. The clip's mast, title band and
captions come in through it.

**The hook** is the clip's title: two lines at 2x of at most 16 characters ("HOW MANY? / PLAY ALONG", "4 STORIES / IN
55 SECONDS"), or, for a story whose headline is longer, **the whole headline** in the body face on up to three lines.
A headline is never cut, because a cut one says what the story did not ("NEANDERTHAL / REMAINS MAY"). A running-order
label (AND FINALLY, NUMBER OF THE DAY) is never a hook. Placement:

- Vertical: in the title band on a black plate as large as its lines, beside an accent bar, all clip long. The card is
  clear everywhere else (round 10; it was a black band over the whole top), so the programme's set shows round it.
- PAY ATTENTION's tall stage: one line in the mast on a black plate, where the programme's tag would be: a
  question's topic from the words its board shows (NASA, EXMOOR PONY HERD: `quizTopic`, never its answer; since 25 Oct,
  `shorts-v2.md` A3), PLAY ALONG where it has none (LETTER BY LETTER, whose headline is its answer), FULL ROUND for a
  whole round.
- Horizontal: a plate under the top row for the first four seconds, or for the quiz, whose boards own the top, one
  line at the top row's right end. A horizontal WORLD WEATHER board has no hook plate: its heading (HOT & COLD, THE
  NEXT THREE DAYS) is in the plate's place and says the same.

The hook is drawn by the channel's own code (`/lab/clip.html`) and laid over the master before the 5x scale.

**The end card** (2.6 s, with the channel's ident sting) shows, vertical (round 10):

- the programme's own set behind tinted glass (the set the clip stood in: `clip.html` bakes it from the programme's
  theme), the programme's accent rules opening from the column's middle over the mast and over the feeds' band;
- the logo landing and glinting (the emblem at 4x over the wordmark's plate at 2x, the bug without its own small globe,
  so the card shows one globe);
- THE WORLD, PIXEL BY PIXEL;
- FROM, then the programme on its accent plate at 2x (its tag beside the bug, made large);
- PAY ATTENTION only (`shorts-v2.md` A5): FOLLOW FOR THE over NEXT QUESTION at 2x, the series asking for its next one
  at the moment the viewer has played one (`END_CTAS`, `&cta=next-question`); the emblem stands at 3x and the slogan
  gives its row, so the invitation sits inside the quiz's marquee and the notice under it is unchanged. One card goes
  to every feed, so it says FOLLOW (a feed's own button says FOLLOW or SUBSCRIBE);
- where to watch only when there is a stream (`airmode.js` `streamOf`, from `CHANNEL_LIVE_URL`): NEWS 24/7 at 2x for
  the pre-rendered stream, NEWS 24/7 · WATCH LIVE in the body face for a live one, nothing without a stream (the manual
  beta). A clip never points to a stream that does not exist;
- the AI disclosure in the channel ident's design, three rows at the foot of the safe area: AI-PRODUCED NEWS in white,
  then PRESENTERS ARE AI CHARACTERS and FACTS FROM CREDITED SOURCES in silver, the body face with its shadow.

Horizontal: the full lock-up at 3x, the slogan, the accent rule, FROM <PROGRAMME>, where to watch as above (NEWS 24
HOURS A DAY, · WATCH LIVE for a live stream alone) and the ident's two rows. No URL is drawn, so a card never goes
stale: the post carries the links.

**The AI disclosure** (owner, 18 Oct: the channel's ident alone, nothing over a programme or a clip's first seconds)
is the end card, the caption's first line ("AI-produced news: …") and the platform's own AI label. The factory declares
the end card (`clipCards({ endCard })`); the gate holds a clip without it or its words (`end-card-missing`), without its
caption (`text-disclosure-missing`) or without the platform's label (`flag-missing`, `flag-unavailable`). The notice
super that held a clip's first four seconds (`drawNoticeCard`) and the AI plate beside the bug (`mark.js`) are gone.

## 6. Thumbnails for whole programmes (`thumb.js`)

**Since 23 Oct the uploads use the packaging's three thumbnails** (`cover.js` `drawThumb16`, with the clips' 1080×1920
covers, `drawCover`; `docs/publishing/thumbnails-titles.md`): the lead story's cleared picture, the presenter from the
same clean plate, the words big, three titles for YouTube's Test & Compare. `drawThumb` below stays for the lab and its
tests.

The programme's own frame, at 384 × 216: the presenter's first close shot in the first story, 1.5 s in, or two
seconds into the story when it has none (the quiz: its first board). It is taken from a **clean plate**: the same
deterministic run recorded with `?clip=clean`, which draws no bug, strap or caption, so the thumbnail's type never
sits on the programme's.

The studio's grammar puts the presenter on the left and the wall on the right. On a close shot the type therefore
goes **right**, over the wall and its board, and her face stays clear (`side: 'right'`). Otherwise it goes left. On it:

- the type's side dimmed by an ordered dither of black, which is pixel-true and has no blur. It reaches as far as 60 %
  of the frame and fades over its last 32 pixels. Behind the type block itself it is solid, so none of the wall's own
  lettering reads between the lines;
- the bug (clean: the upload's description, YouTube's label and the file's C2PA carry the disclosure);
- the programme's name on its accent plate at 2x;
- the lead at 3x (at most three lines of 11 characters, cut at its own colon or after the last strong word), or at 2x
  (lines of 16) when a word is longer than 11, or the programme's tagline;
- the kicker (FULL PROGRAMME · 17 OCT) at the foot.

It is scaled 5x to 1920 × 1080. A PNG over 2 MB becomes a JPEG.

## 7. How a vertical master is made

1. `main.js` reads `?format=vertical`. The page's canvas becomes 216 × 384, the renderer draws its horizontal frame into
   an offscreen 384 × 216 canvas with clip graphics that draw nothing (`VerticalGraphics`), and the compositor draws
   the vertical frame from it after every frame.
2. `tools/record.mjs --lossless` grabs that canvas at 1x, with sound, on the fake clock (`--seed 1 --time <aired>`).
   It also writes its report: every speech, sentence, voice clip and cut, with its video time.
3. The factory cuts, lays the hook over the picture, adds the end card and scales 5x by nearest neighbour
   (`render.js` `composeArgs`).

Nothing changes on air without `?clip=1` or `?format=vertical`.

## 8. What remains

- WORLD WEATHER's close-up is still a window on the horizontal frame (the presenter is whole in it). Its map shots are
  composed for the tall frame since round 5 (§3.6), without the presenter.
- The pictures in vertical were checked on a demo edition (the repository's fixture art with DEMO credits), because
  the offline material carries no pictures. The first real edition with cleared pictures should be watched in vertical.
- FULL TIME has been through the factory only as a demo edition (the archive's one FULL TIME is the fictional fixture
  league of 13 Oct); its first real edition should be watched in vertical before its clips are approved.
- The quiz's and the weather's labs (`/lab/vquiz.html`, `/lab/vweather.html`, `/lab/vsport.html`) show every board.
  The tests draw them all at every moment and check nothing leaves its box.
- ~~The quiz's first frame is the round card's panel wiping in~~ (round 10: every board is whole from its first frame).
- The backdrops are rendered from the studio sets as they are: a programme whose set changes gets its new vertical set
  at once, but its tall camera (`VSETS`) should be looked at again on `/lab/vertical.html`.
- WORLD WEATHER's tall view is drawn for the vertical frame (`weatherBackdrop`), not by its centre's own renderer: the
  centre's wall picture shows only through its own windows (the close-up, the maps).
