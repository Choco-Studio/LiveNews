# FULL TIME — set critique log (build step 5: the pitchside platform)

Step 5 of `docs/programmes/full-time.md` §9, the set: the pitchside platform of §6. **Gate: renders critiqued above 9.7
by a hostile panel; the round's score is its lowest category.** The open, the theme and the bed (the rest of step 5)
are another stream's and are not judged here.

**Built**: `public/js/v2/canvas25d/studio/pitch.js` (the ground: sky by the hour, the town through the open corners, four
floodlight towers, the far stand with its still crowd, the scoreboard and its pennant, the boards, the striped pitch),
`studio/dressing.js` (the canopy with its orange cove and studio lights, the screen hung on two hangers, the slim
columns, the curved black desk with one orange edge light), `studio/styles.js` (`'full-time'`, an open set),
`studio/set.js` (no back-wall light under an open set; the floodlight banks in the cache key), `studio/wall.js` (the side
screen: the story's picture or the FULL TIME emblem; THE NUMBER's own figure on its segment), `runtime/stage.js`
(warmed with the others), `public/js/set.js` (the old renderer's `sport` theme), the labs (`v2-set.html`,
`v2-camera.html`: `?programme=full-time&hour=…&zoom=1|3|4`), `test/full-time-set.test.js` (18 tests) and
`test/v2-set.test.js` (reads the drafts, so the drafted set meets every network set rule).

**The panel** (QUALITY_LOOP.md's method): a lead pixel artist, a senior broadcast director and production designer, a
first-time viewer. Categories, each 0–10: **composition and depth**, **light and the hour** (all five phases),
**pixel craft and palette**, **presenters' integration**, **motion discipline**, **distinctness**, **performance**.

**How it was looked at**: the set lab rendered in Chromium (Playwright) and read at 1x, 2x, 4x and 6–8x crops; contact
sheets of every phase (night 21:47, dawn 06:30, breakfast 08:30, day 12:30, the golden hour with 0, 1, 2 and 4
floodlight banks at 17:06, 17:30, 18:06 and 18:42, the blue hour 20:00) in every framing the director uses for a duo
(wide, two, mcu-l, mcu-r, ots, close) plus the lab's single and solo; the camera lab's gallery; the wall with a story
picture; numbers from node (`labs/set.js measure()`: faces, head zone, saturation; symmetry blocks; frame cost through
`profile()`); a slow 4 % push in every framing, frame by frame (flip-backs); a still camera for two minutes with the
live layer on and a running clock (what moves); and FULL TIME **on air** in the station's test mode
(`DRAFTS_ON_AIR=full-time@world-weather ROTATION_START=full-time`, the real director, Stage and graphics), by day
(14:35) and with the studio clock forced to 21:37. Renders of the last round: see "Evidence" at the end.

---

## Round 0 — the first renders (during the build, not scored)

Faults found and fixed before the panel's first look:

1. The scoreboard did not draw: the guard's margins (canopy +2, screen −3) left it five rows; the canopy moved up two
   units and the screen margin became one pixel.
2. The far towers floated: their heads sat on the roof with no mast. The stand now ends short of the corners, which are
   open (a low terrace, the town beyond), and the far towers rise there with their masts.
3. The crowd read as static noise (random black bodies on ink). Rebuilt as rows: a head (two tones) over its shoulders,
   the step below, a stair every 16 seats.
4. The lit exits read as brown crates (6x5 px, dull). Now 2x3 px warm openings in a dark frame, two of them.
5. The lit stripe of the pitch, a Bayer of darkGreen and green, was loud and as bright as a face. The pitch is flat
   darkGreen with the other stripe a Bayer step down toward ink.
6. At dawn and at the golden hour the open corners were solid rust blocks: the sky's low band ran down below the
   horizon. The ground now uses the city's four sky bands at the city's heights (the channel's phases), and below the
   horizon the town's roofline fills the corners.

## Round 1 — the panel's first look

Faults:

1. **Sky bands behind the head in the singles** (mcu-l/r, close): navy, purple and dark red bands crossed behind the
   hair at the golden hour; a band edge at the crown (pixel artist).
2. **The roofline behind the forehead in the singles**: a hard horizontal edge behind the head (director).
3. **The singles were a dark wall**: flat bands, two brown bricks (the out-of-focus boards), flat green (first-time
   viewer: "where is the stadium?").
4. **The touchline on the crowns in the two-shot**: the network's two-shot (z 460, hy 17.3) shows the far plane about
   35 px higher than the wide, so the boards and the silver touchline ran along both presenters' hair (pixel artist).
5. **The far lamp heads were 4x4 white blocks**, the brightest patches in the frame (pixel artist).
6. **A board band touched a tower mast** (tangent at x 24) (pixel artist).
7. **The day crowd glittered**: fog heads (L* 64) on slate (director).
8. **The head zone too dark**: 8.8 L* in the ots and 10.9 in the mcu at night (WORLD NOW: 11 and 17) (pixel artist).
9. **Asymmetric**: 32 of 238 blocks (the seeded crowd and the stripes' parity flipping at the halfway line) against the
   network's symmetry rule (director).
10. **Frame cost**: 1.6 ms uncached in the wide (the crowd hashed per pixel) (engineering).
11. **Two dithered pitch stripes at dawn** (both textured) (pixel artist).

| Category | Score | Worst fault |
|---|---|---|
| Composition and depth | 8.8 | 3, 4 |
| Light and the hour | 9.0 | 1 |
| Pixel craft and palette | 8.8 | 5, 6, 9 |
| Presenters' integration | 8.5 | 1, 2, 4 |
| Motion discipline | 9.6 | — (only the minute and the pennant; no shimmer) |
| Distinctness | 9.7 | — |
| Performance | 9.2 | 10 |

**Round score: 8.5.**

## Round 2 — after the fixes

What changed: out of focus the sky is one flat tone per phase and the roofline a 6 px Bayer step between two adjacent
ramp steps (a defocused edge); the crowd stays as one dim tone in rows; the boards' bands are rounded dim glows. The far
touchline is left out (the halfway line stays, faint). Far lamps silver, three columns. Bands every 400 units, clear of
the masts. Day heads steel and ink. Night: the stand on ink (the head zone lifts to 17–18 in the singles). The crowd's
seats come from a seeded table mirrored about the stand's centre line (the mirror always falls behind the screen), the
stripes mirrored about the halfway line: **0 of 238** asymmetric blocks in every phase, dressing on. The table cut the
cost to **0.59–0.74 ms** uncached (WORLD NOW 3.1–3.6 ms). Dawn's lit stripe flat.

New faults:

1. In the two-shot the boards' black band and the pitch's top edge still met the crowns (the band moved with the pitch).
2. The near and far tower heads crowded each other in the corners; their halos merged.
3. The near towers' feet planted on the visible pitch once more pitch showed (a mast standing on the field).
4. The day pitch's lit stripe (a step up toward green) read as a screen door behind the faces in the two-shot.
5. Four FULL TIMEs in the wide (three bands and the screen's emblem) (director: "shouting").

| Category | Score |
|---|---|
| Composition and depth | 9.2 |
| Light and the hour | 9.3 |
| Pixel craft and palette | 9.3 |
| Presenters' integration | 9.1 |
| Motion discipline | 9.8 |
| Distinctness | 9.8 |
| Performance | 9.8 |

**Round score: 9.1.**

## Round 3–4 — the boards above the crowns, the corners uncluttered

What changed: the pitch's level was raised so the boards sit just under the screen's foot in the wide and clear above
the crowns in the two-shot (the faces stand on the pitch with no edge at the hair); the band between the presenters
now hides behind the screen, so the wide shows **two bands and the screen's emblem**; more pitch shows in the wide.
The main stand ends at ±800 (its gables 10 px from the far towers), the far towers stand lower and dimmer than the near
pair (depth), the near pair close enough that their feet fall behind the desk. Day pitch flat. Every object placed either
side of the centre rounds to mirrored pixels (a `.5` tie had put one tower head a pixel off).

New faults:

1. The scoreboard's top edge touched the canopy's glow row and the pennant sat on it (tangent).
2. At night the halos were clipped where the sky turned navy (a light that stops at a sky band).
3. The far tower heads at 4x: a 3x4 block, no lamp grid (nitpick, kept: one pixel a lamp at that distance).

| Category | Score |
|---|---|
| Composition and depth | 9.5 |
| Light and the hour | 9.5 |
| Pixel craft and palette | 9.5 |
| Presenters' integration | 9.6 |
| Motion discipline | 9.8 |
| Distinctness | 9.8 |
| Performance | 9.8 |

**Round score: 9.5.**

## Round 5 — the last fixes, on air

What changed: the scoreboard is seven rows (frame, five rows of dots, frame) with a row of sky above and below; the
night sky keeps its glow for the band just over the town, so the halos are whole circles on ink.

On air (test mode, real director and Stage): the scoreboard's clock is the graphics' clock; the four tower heads sit
under the bug, the LIVE tag and the clock with 3 px to spare; the singles show the FULL TIME emblem, never a story's age
(the integrator's report, fixed in `wall.js`); nothing else moves.

What the panel still finds (none blocks the read; these keep categories from 10):

1. **The screen is not "at the platform's side"** (bible §6): it is the network's centred hero screen, hung from the
   canopy at the platform's pitch edge. Every framing, the wall's layout and the director's over-the-shoulder shots are
   built on that screen; moving it is a network change, not a set's (director).
2. **The raised platform is not seen in the wide**: the desk hides the deck's edge; the platform reads in the two-shot
   (the deck's nosing over the pitch) and from the view down onto the stripes (director).
3. **The scoreboard reads as part of the set's top bar** in the wide: its gantry to the stand's roof is behind the
   screen; only a camera move shows it is far (it is on the stand's plane) (first-time viewer).
4. **The top 14 px are busy**: the canopy's cove, four studio lights, two hangers, the scoreboard and the pennant, in
   order but close (pixel artist).
5. **The singles' lower right is a flat green plane** (about a quarter of the frame) with the boards' dim glows on a
   black strip: true to a defocused pitch, plain to look at (director).
6. **The day pitch is no brighter than the night's**: the palette's only brighter green (L* 72) equals a face; the day
   reads cool and grey-blue (pixel artist).
7. **The golden hour's halos vanish** against the bright sky (true to life; the first banks read as a lit row of
   lamps), and in the ots the golden sky's bands pass behind the presenter's chin (as WORLD NOW's city does) (director).
8. **The mown stripe is a Bayer fill** (two adjacent steps of the green ramp, flat within a stripe, anchored to the
   screen: the floor's light, which ART_DIRECTION allows, but at 4x the dark stripes read as a checker) (pixel artist).
9. **The far tower heads are 3x4 blocks** and the studio lights 5x7 sprites with little detail (pixel artist).
10. **In the two-shot a stripe's dithered edge runs diagonally behind one head** (low contrast) (pixel artist).
11. **The pennant's three frames differ in a few pixels**: sparse as asked, easy to miss at 1x (director).
12. **The programme tag beside the bug** (8 s after the open) covers the left pair of studio lights (director).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Composition and depth | 9.5 | 1, 2, 3, 4 |
| Light and the hour | 9.6 | 6, 7 |
| Pixel craft and palette | 9.6 | 8, 9, 10 |
| Presenters' integration | 9.6 | 5, 10, 12 |
| Motion discipline | 9.8 | 11 |
| Distinctness | 9.9 | — |
| Performance | 9.9 | — |

**Round score: 9.5.**

## Round 6 — the open faults worked; the final verdict

What changed, fault by fault (round 5's numbering):

- 4 and 12: the two studio fresnels now hang clamped on the screen's drop pipes over its corners (x 151 and 233 in the
  wide): the sky either side is calm, and the programme tag beside the bug (x 92–147, 8 s after the open) covers none
  of them. The near towers' heads dropped 4 px: on air their night halos had reached under the bug's box; a test now
  checks every head and halo against the top row's boxes in the wide, the two-shot and the ots.
- 9: the far heads show their three lamp columns apart (a grid at one pixel a lamp).
- 11: the pennant's three frames flutter a row (20 px change over two minutes, all in the scoreboard slot).
- 7: tried a cool, then a warm glare for the golden hour's banks; both read as a disc with an outline over the red sky
  (a coin, not light), so the golden hour keeps the night's rings, which barely show against a bright dusk sky (as in
  life); the banks lighting row by row carry "the floodlights come on as the sky reddens".

Still open (the panel, round 6):

1. **The screen is not "at the platform's side"**: it is the network's centred hero screen, hung from the canopy at the
   platform's pitch edge (read here as the platform's pitch side). The framings, the wall's layout and the director's
   over-the-shoulder shots are built on that screen; moving it is a network change, not a set's (director).
2. **The raised platform is not seen in the wide**: the desk hides the deck's edge; the platform reads in the two-shot
   (the deck's nosing over the pitch) and from the view down onto the converging stripes (director).
3. **The scoreboard reads as part of the set's top bar** in the wide: its gantry to the stand's roof is behind the
   screen, and no framing but the wide shows it (first-time viewer).
4. **The day pitch is no brighter than the night's** (the palette's only brighter green, L* 72, equals a face; a sparse
   green sparkle read as a screen door behind the faces in the two-shot); the day ground is cool and grey-blue
   (pixel artist).
5. **The golden hour's glare** barely shows, and in the ots the golden sky's bands pass behind the presenter's chin (as
   WORLD NOW's city does) (director).
6. **The singles' lower right is a flat green plane** (a defocused pitch) with the boards' dim glows on a black strip:
   calm and true, plain (director).
7. **The mown stripe is a Bayer fill** (two adjacent steps, flat within a stripe, anchored to the screen: the floor's
   light that ART_DIRECTION allows), a checker at 4x; in the two-shot one stripe's dithered edge runs behind a head at
   low contrast (pixel artist).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Composition and depth | 9.6 | 1, 2, 3 |
| Light and the hour | 9.6 | 4, 5 |
| Pixel craft and palette | 9.7 | 7 |
| Presenters' integration | 9.6 | 6, 7 |
| Motion discipline | 9.9 | — (the minute and the pennant only; 0 flip-backs under a push) |
| Distinctness | 9.9 | — |
| Performance | 9.9 | — (0.42–0.69 ms uncached, a fifth of WORLD NOW's city) |

**Final round score: 9.6. Not passed** (the gate is above 9.7). Faults 1–3 are limits of the network's grammar (the
centred hero screen, the desk in front of the platform, the scoreboard's only slot over the screen) and 4 one of the
palette; 5–7 are judgement calls the panel did not accept as 9.7 in light and integration. What would pass, in the
panel's view: a network decision to let a set place its hero screen (a side screen for FULL TIME), a lower camera or a
slimmer desk in FULL TIME's wide so the platform's edge shows, and a second, darker green in the palette (a lit and a
mown stripe without dither, a bright day pitch below the faces).

---

## Evidence (round 6)

Renders (Chromium, the set lab; regenerate with `public/lab/v2-set.html?programme=full-time&framing=<f>&hour=<h>&zoom=4`
or `v2-camera.html?programme=full-time&mode=gallery&hour=<h>`): the contact sheets of every phase and framing, the 4x
wides by phase, the 8x crops (scoreboard and pennant, towers, crowd, band) and the on-air captures are listed in the
step's report.

Numbers (node, `labs/set.js`):

| | Night | Dawn | Day | Golden (2 or 4 banks) | Blue hour |
|---|---|---|---|---|---|
| head zone L*, wide / two / mcu / ots | 16.6 / 27.4 / 18.6 / 17.6 | 16.0 / 25.8 / 25.5 / 18.8 | 22.5 / 28.9 / 35.9 / 31.8 | 16.6 / 27.4 / 24.9 / 30.3 | 16.6 / 27.4 / 25.5 / 18.9 |
| faces L* (Paco and Lola, Kai's and Rosa's stand-ins until step 6) | 68 / 59 | 68 / 59 | 68 / 59 | 68 / 59 | 68 / 59 |

- Symmetry: 0 of 238 blocks in every phase (dressing on). Palette only, graphics zone black/ink, in every phase and
  framing.
- Motion: a still camera over two minutes changes 20 pixels, all in the scoreboard slot (the minute's digit and the
  pennant); nothing moves in the two-shot, the singles or the ots. A slow push: 0 flip-backs in every framing (WORLD
  NOW: 2–21).
- Cost: background uncached 0.42–0.69 ms by framing, cached 0.01–0.02 ms, desk 0.10–0.49 ms (WORLD NOW uncached
  3.1–3.6 ms).
- Tests: `test/full-time-set.test.js` 18/18; `test/v2-set.test.js` 72/72 with FULL TIME among its programmes.
