# The vertical picture (9:16), and a clip's own graphics

Shorts, Reels and TikTok are watched on a phone held upright. A crop of the 16:9 channel would cut presenters in half,
lose the boards' edges and shrink the type. The vertical picture is therefore **composed again, every frame**, from the
channel's own drawing code, in bands laid out for a phone. It is rendered by the real renderer in clip mode
(`?format=vertical`), recorded by the deterministic recorder, and scaled 5x by nearest neighbour.

Code: `public/js/clip/` (`index.js` the switch, `layout.js` the zones, `vertical.js` the compositor, `vboards.js`,
`vquiz.js`, `vweather.js` and `vsport.js` the boards, `captions.js`, `graphics.js`, `cards.js`, `mark.js`, `thumb.js`).
Labs: `/lab/vquiz.html`, `/lab/vweather.html`, `/lab/vsport.html`, `/lab/clip.html`, `/lab/thumb.html`; `/lab/weather.html`
draws the vertical stage of the weather's map shots beside its frame.

## 1. Principles

- **The same pixel.** The vertical frame is 216 × 384 at 1x and 1080 × 1920 at 5x, so its pixel is the channel's pixel
  (384 × 216 × 5 = 1920 × 1080). Nothing is resampled and nothing is drawn at a fractional scale: a 2x caption is 2x of
  the same 5×7 face.
- **Designed, not cropped.** Each shot type has its own layout (§3). Only a shot with no vertical layout yet falls back
  to a window on the horizontal frame.
- **Readable on a phone with the sound off.** Captions at 2x (14 px caps at 1x, 70 px on a 1080-wide screen), the hook
  at 2x, every word inside the platforms' safe area.
- **Disclosed.** The AI mark stands beside the bug all clip long, drawn once (the bug's own row draws no second
  mark), the RECREATION label is set for the tall frame when a recreation is on screen (§3.8), and the end card says
  how the channel is made.

## 2. The grid and the zones (`layout.js`)

| Zone | Rows (1x) | What it holds |
|---|---|---|
| MAST | 0–31 | The channel's bug at (8, 10), the AI mark docked to it, the programme's tag at the right (or the quiz's hook) |
| TITLE | 32–71 | In a clip, the hook, all clip long (it is laid over the master's mast and band: §5). In the master, the story's tag and headline, or the programme's title and tagline. |
| STAGE | 72–247 (216 × 176) | The picture: the speaker, the board, the map, the photo. Over a single, a map or a picture, the story's source on a plate at the top left (SOURCE: NASA); NEWS IN 60's progress rule along its top edge. A board, the montage and a recreation carry their own credit. |
| CAPS | 248–299 | The captions: two lines at 2x on black boxes |
| FOOT | 300–383 | A slate rule and the full logo at the bottom, nothing else. The feeds put their own buttons and text here, so nothing a viewer must read lives in it. |

**The safe area** (`PLATFORM_SAFE`): x 8–188, y 32–300. TikTok, Reels and Shorts all lay their buttons over the right
edge (about 12 % of the width) and their caption and handle over the foot (about 20 % of the height), so every word a
viewer must read stays inside this box.

**The safe column** (`SAFE`: x 8–188, centre 98). Pictures, maps, grounds and the studio fill all 216 columns, but
everything to read is set in the column:

- every board is laid out in `boardBox(stage)`, a box that ends 8 px right of the column (x 0–196), so its panel's
  padding, never its words, reaches toward the buttons;
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
  (`verticalFraming`: the quiz host and players on their own seats, a duo's speaker single, a solo presenter's
  medium close-up).
- Its own camera points at the voice's owner. Its cue clock runs on the same plan, so the presenter gestures on the
  same words as on air.
- The crop centres on the head (from the seat's screen x and its neck), so the eyes sit about a third down the stage.
- It cuts when the voice changes hands, as a director would, and the speaker's name tag rises for 4.5 s after each cut.
- The studio wall behind the single is at rest (`wall.js` 'rest'): the programme's art without its words. A plate, map
  label or wordmark would be cut in half by the tall crop.

### 3.2 Two-shots and the two-way

A two-shot on air becomes the speaker's single (§3.1): a phone shows one face well rather than two badly. The two-way
(correspondent and studio) stacks the two boxes one over the other, each 178 × 82 from the horizontal frame's own
boxes.

### 3.3 Boards (`vboards.js`)

Each story board is laid out again for the stage's width as a single column centred in the stage. The panel wipes in
from the left, the kicker is in micro type, and rows rise in turn, as on air. Precedence is the horizontal card's own
(`boardKind`).

- **figures:** up to three figures with their labels. MONEY MINUTE's are on cream paper with an ink edge.
- **known:** WHAT WE KNOW, its points.
- **timeline:** a vertical rail with up to three dates.
- **change:** from, an arrow, to, and the label.
- **term:** IN PLAIN ENGLISH, the term and its plain words.
- **quote:** the words and who said them.
- **who:** the people and their roles.
- **share:** a figure as a share, with a chart of people or tens.
- **next:** WHAT HAPPENS NEXT, the date and what.

A board that does not fit drops its source line first, then its last rows, and never shrinks its type.

**FULL TIME** (`vsport.js`):

- **The RESULT card:** the sport's icon and RESULT, the two names in one type size (2x when both fit, else 1x on up
  to two lines), the home side first when the source names one (HOME and AWAY under the names), the scores at 3x
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
only sea. A picture's pan does the same.

### 3.5 PAY ATTENTION's boards (`vquiz.js`)

Every quiz board is ported to one column for the 216 × 216 tall stage:

- PICTURE THIS, LETTER BY LETTER, WHERE IN THE WORLD? (with the map), HOW MANY? and TODAY OR NOT TODAY?
- the round's card (its name at 3x when it fits one line)
- DOUBLE OR NOTHING, the final scores and the table

They use the horizontal boards' own helpers (seats and their shapes, the masked words, the countdown cells, the
picture's whole-block sharpening, the credit lines), so a question reads the same in both formats. The player's
shape, never a letter, tells who locked in. `test/publish-vertical.test.js` draws every lab case at every moment and
checks that nothing leaves the box.

HOW MANY? gives the space under the players' guesses a job all question long, because the board is on screen while
the host reads and the countdown often runs over the players' faces: YOUR GUESS? at 2x over an empty answer box at 3x
height, its cursor blinking on the bed's half notes, and the countdown under it while it runs. At the reveal the box
reads THE ANSWER and the figure lands in it at 3x in the reveal's yellow, its label under it, the credit at the foot.
The box is one width whatever the answer, so it gives nothing away.

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
width, under the feeds' buttons too, and every word stays inside the safe column (x 8–188) and the stage.

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

The close-up keeps the horizontal frame's window, centred on the presenter's close-up. The world time-lapse is a clip
moment of its own (`weather-map`, THE NEXT 24 HOURS).
`test/publish-vertical.test.js` drives the weather centre through the world, three zones and the warning. It checks
every word, frame by frame, against the column and the stage, and checks that the high or low being named is in the
column.

### 3.7 Pictures, montage and tease

The story's picture fills the stage's width, panning as on air. The headline montage and STILL TO COME are set again
on the montage stage (§2, rows 72–300): the picture as the backdrop, centred on the safe column,
a black plate with the headline at 2x as tall as its lines need (1x past four lines), the source under them
(SOURCE: …), and TOP STORIES with the run's pips, or STILL TO COME, on the plate's top edge (in a clip the hook
holds the title band all clip long). The montage has no captions, because its plate shows the words the voice
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
- The bug stays, with the AI mark docked to it and the programme's tag beside it for the whole clip.
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

**The hook** is the clip's title: two lines at 2x of at most 16 characters ("HOW MANY? / PLAY ALONG", "4 STORIES / IN
55 SECONDS"), or, for a story whose headline is longer, **the whole headline** in the body face on up to three lines.
A headline is never cut, because a cut one says what the story did not ("NEANDERTHAL / REMAINS MAY"). A running-order
label (AND FINALLY, NUMBER OF THE DAY) is never a hook. Placement:

- Vertical: in the title band, beside an accent bar, all clip long.
- PAY ATTENTION's tall stage: one line in the mast, where the programme's tag would be ("PLAY ALONG", "FULL ROUND").
- Horizontal: a plate under the top row for the first four seconds, or for the quiz, whose boards own the top, one
  line at the top row's right end. A horizontal WORLD WEATHER board has no hook plate: its heading (HOT & COLD, THE
  NEXT THREE DAYS) is in the plate's place and says the same.

The hook is drawn by the channel's own code (`/lab/clip.html`) and laid over the master before the 5x scale.

**The end card** (2.6 s, with the channel's ident sting) shows:

- the logo landing and glinting (vertical: the emblem at 4x over the bug at 2x);
- THE WORLD, PIXEL BY PIXEL;
- the programme's accent rule, FROM <PROGRAMME>, NEWS 24 HOURS A DAY · WATCH LIVE;
- the disclosure: PRESENTERS ARE AI-GENERATED CHARACTERS, EVERY FACT FROM A CREDITED NEWS SOURCE.

No URL is drawn, so a card never goes stale: the post carries the links.

**The AI mark** (`mark.js`) is the compliance desk's own (`graphics/disclosure.js` `drawMark`, closed) when that module
is in the build. Until then a plain mark of the same shape stands in: a yellow plate with black double-struck AI.

## 6. Thumbnails for whole programmes (`thumb.js`)

The programme's own frame, at 384 × 216: the presenter's first close shot in the first story, 1.5 s in, or two
seconds into the story when it has none (the quiz: its first board). It is taken from a **clean plate**: the same
deterministic run recorded with `?clip=clean`, which draws no bug, strap or caption, so the thumbnail's type never
sits on the programme's.

The studio's grammar puts the presenter on the left and the wall on the right. On a close shot the type therefore
goes **right**, over the wall and its board, and her face stays clear (`side: 'right'`). Otherwise it goes left. On it:

- the type's side dimmed by an ordered dither of black, which is pixel-true and has no blur. It reaches as far as 60 %
  of the frame and fades over its last 32 pixels. Behind the type block itself it is solid, so none of the wall's own
  lettering reads between the lines;
- the bug and the AI mark;
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
- The quiz's first frame is the round card's panel wiping in, so the hook in the mast carries the first 0.3 s.
