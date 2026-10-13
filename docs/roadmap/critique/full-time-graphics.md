# FULL TIME — graphics critique log (build step 3)

Step 3 of `docs/programmes/full-time.md` §9: the scoreline card, the stadium scoreboard (SCORE CENTRE), COMING UP, THE
MOMENT ON THE BOARD, the eleven sport icons and the accent, in `public/js/scenes/cards-sport.js`. **Gate: the lab page
(`public/lab/sport.html`) at 1x and 4x, a hostile critique above 9.7.**

The panel is the design critique's: a lead pixel artist, a senior broadcast director, a standards and legal editor, a
senior sports editor and a first-time viewer. Each category 0–10; **the round's score is the lowest category.**

How it was looked at: the lab page rendered in Chromium and read canvas by canvas at 1x (the stream's own pixels) and
at 2x–6x; every board at several moments of its animation (filmstrips at 0.15–5 s); every board again with the
channel's top row (bug, LIVE, programme tag, clock) and a two-line caption over it (`?overlay=1`), as on air; the hardest
cases on purpose: the longest real club names in English football ("Wolverhampton Wanderers", "Brighton & Hove Albion",
with "Women"), an away win, a draw, a three-figure basketball score, a sport with no icon, a six-row board with two
days, an event written "vs".

---

## Round 1 — the first lab render (during the build)

Not scored: four faults were found and fixed before the board was shown to the panel.

1. COMING UP ran into the caption band (its board was 128 px tall).
2. The chalk lines looked dashed and the pitch was squashed (not to scale).
3. SCORE CENTRE cut long names with dots.
4. The football and basketball icons differed in too few pixels to tell apart at 1x.

## Round 2 — the panel's first look

Faults:

1. **Two type sizes on one board.** SCORE CENTRE put "BRIGHTWATER WANDERERS" and "HARBOURSIDE HERONS" in the micro face
   beside 1x names; COMING UP did the same with "LANTERNHILL LYNX". A real board has one size; a mixed one reads as
   broken (pixel artist, first-time viewer).
2. **The away winner was never lit.** SCORE CENTRE drew the home side white on a win or a draw and the away side always
   silver: "Ashcombe 1-2 Brightwater" showed the winner in the loser's colour, and a draw lit one side only (sports
   editor).
3. **SCORE CENTRE credited no source.** Every other board says where its facts come from; six results from three
   outlets aired with none (standards).
4. **Yellow digits.** The scores were in `P.yellow`, NEWS IN 60's accent, against the module's own rule of the programme
   accent as the one colour (director).
5. **Wrong icons.** Ice hockey drew the football and baseball the cricket bat; the test said "no icon is better than a
   wrong one" and the code broke it (standards, sports editor).
6. **The bicycle was a wheel.** At 1x the cycling icon (one spoked wheel) read as a second basketball (pixel artist).
7. **The football was a grey ball.** White outline, steel fill: not the black-and-white ball everyone knows (pixel
   artist).
8. **COMING UP had no sport.** Three dates of three sports and nothing said which was which; the data carried it
   (first-time viewer).
9. **The floodlight heads sat under the bug and the clock** (y 16–26 against the top row's 8–21): the channel's own
   graphics would have covered a piece of the set (director).
10. **Three figures broke the scoreboard.** The score column was a fixed 44 px; "112-108" at 2x is 68 px and ran into
    the names (robustness).
11. **"vs" was not a fixture.** "HARBOURSIDE HERONS VS LANTERNHILL LYNX" stayed one long name (robustness).
12. **The chalk pitch had no arc and a closed far end.** A penalty area without its D, and a solid line 40–60 yards out
    where no line exists (sports editor).
13. **The American football field had no end zone**; **rugby was drawn as American football**, in yards, posts and
    all (sports editor).
14. **A goal from 65 yards would have aired as "58 YARDS"**: the distance was clamped and the label written from the
    clamped number — a factual error by construction (standards).
15. **An unknown sport drew an American football field** (robustness).
16. **"THE PENALTY SPOT" fell to 1x** while "30 YARDS" was 2x (the board was 168 px wide) (director).
17. **Off-palette colours.** The chalkboard's green and chalk were hex values outside the channel's palette (pixel
    artist).
18. **Pops.** FT appeared in one frame while everything else moved; the chalk label appeared whole (director).
19. **7,500 fill calls a frame** for the scoreboard's unlit LED grid (engineering).
20. **A flat frame**: the chalkboard's wood had no light on it (pixel artist).

Scores:

| Category | Score | Worst fault |
|---|---|---|
| Legibility at 1x and 4x | 8.4 | 1 |
| Editorial fidelity | 7.5 | 14, 3, 2 |
| Broadcast craft | 8.5 | 9, 4 |
| Pixel art | 8.6 | 6, 7, 17 |
| Data robustness | 8.0 | 10, 15 |
| Consistency and performance | 8.8 | 19 |

**Round score: 7.5.**

## Round 3 — after the fixes

What changed, fault by fault:

1. **One type size a board.** SCORE CENTRE: every name 1x, with the score column moved off the middle as far as the
   widest names need; on a board of up to four rows a name too long for that goes on two 1x lines; on the compact board
   (five or six rows) every name drops to the micro face together; dots only when even that cannot hold a name.
   COMING UP: 1x with the columns evenly spaced, else 1x with each column as wide as it needs (a leaf and its icon,
   70 px, or its widest name), else everything in micro the same two ways; neighbouring names never closer than 12 px.
   The lab's hardest board (Wolverhampton Wanderers v Brighton & Hove Albion beside Harbourside Herons v Lanternhill
   Lynx) airs in one size and uncut.
2. Winner white on either side, a draw both white, the loser silver.
3. `source` on SCORE CENTRE: "SOURCES: PIXELBURG SPORT / SKY SPORTS / THE GUARDIAN" on the board's foot (whole credits
   dropped from the end only if the line could not fit 284 px; four outlets fit).
4. The digits in the programme's accent.
5. `iconOf` maps only the eleven drawn sports: ice hockey, baseball and the rest get none.
6. A bicycle side-on (two wheels, frame, saddle, bars); 7. the classic patched ball. The silhouette test still holds
   (every pair differs in 15 or more of 121 pixels).
8. The sport's icon beside each leaf, level with its date, in the boards' quiet fog tone.
9. The floodlight heads under the top row (y 30–40), the gantry at y 26–32; checked with the real top row drawn over.
10. The score column as wide as the widest score at the board's scale.
11. "V", "VS", "V.", "VERSUS" all split an event.
12. The arc (the part of the ten-yard circle round the spot outside the area); the ground open at the far end.
13. The American football field: posts on the end line on one stem, the end zone hatched, the goal line and a line every
    ten yards. Rugby: an H on the try line, the in-goal behind it, the 22, the dashed 10 m line and halfway, in metres
    (`{ metres: 45, sport: 'rugby' }` → "45 METRES").
14. A distance outside 1–70 draws no board at all; the label is the source's number, never a clamped one.
15. Only football, American football and rugby draw a ground; anything else draws nothing.
16. The chalkboard 196 px wide: "THE PENALTY SPOT" at 2x.
17. The board `P.darkGreen`, the chalk `P.white` (thinned with alpha for the ground's lines, as the channel's halos are).
18. FT wipes on from the left over 0.15 s once the second score has landed; the chalk label is written a whole letter at
    a time over 0.45 s (never half a glyph on screen).
19. The board's face (rim, black, LED grid) drawn once a height and copied.
20. The frame lit from above: `P.tan` on its top and left edges, `P.brown` on its bottom and right.

The tests (`test/full-time-graphics.test.js`, 7) cover the safe area of every board, FT and DRAW, the home-and-away
boxes, the rows flipping in at their times, one type size a board on three real layouts, the winner lit on either side,
three figures inside their column, COMING UP's icons, sizes and spacing, "vs", the three grounds inside their frame, and
no icon for ice hockey or baseball.

Scores after the fixes (the whole lab re-read at 1x, 2x and with the overlay; filmstrips of the scoreline, SCORE CENTRE
and the chalkboard):

| Category | Score | What keeps it from 10 |
|---|---|---|
| Legibility at 1x and 4x | 9.8 | the compact board's last resort is the micro face (5 px caps, 25 px on a 1080p screen): only when six rows hold names as long as the lab's worst; with headline names ("Coventry", "Bills") it is 1x |
| Editorial fidelity | 9.8 | a credit line that cannot fit drops whole outlets from its end (needs five outlets on SCORE CENTRE or three long names beside a long COMING UP title; none of today's feeds) |
| Broadcast craft | 9.8 | SCORE CENTRE arrives by a cut, and the rows' times come from the voices: both are step 4's to prove |
| Pixel art | 9.8 | the F1 car is the weakest silhouette of the eleven (it reads as a racing car, not as Formula 1 in particular); the runner's limbs are one pixel wide |
| Data robustness | 9.8 | the chalk distances come from the server's extraction, built in step 4 |
| Consistency and performance | 9.9 | — |

**Round score: 9.8. Passed.**

## Carried to step 4

- Wire the boards into the director and pace: the scoreline card on `seg.score`, SCORE CENTRE full-screen with
  `rowTimes` from the voice marks and `source` from the rows' outlets, COMING UP, the chalkboard on `seg.chalk`, the
  night or evening ground from the hour.
- The server's chalk extraction ("from 30 yards", "a 45-yard field goal", "from the spot", "a penalty from 45 metres"),
  only for the three grounds and only distances from 1 to 70.
