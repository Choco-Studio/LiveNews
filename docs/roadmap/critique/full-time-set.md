# FULL TIME — set critique log (build step 5: the pitchside platform)

Step 5 of `docs/programmes/full-time.md` §9, the set: the pitchside platform of §6. **Gate: renders critiqued above 9.7
by a hostile panel; the round's score is its lowest category.** The open, the theme and the bed (the rest of step 5)
are another stream's and are not judged here.

**Built**: `public/js/v2/canvas25d/studio/pitch.js` (the ground: sky by the hour, the town through the open corners, four
floodlight towers, the far stand with its still crowd, the scoreboard and its pennant, the boards, the striped pitch),
`studio/dressing.js` (the canopy with its orange cove and studio lights, the screen hung on two hangers, the slim
columns, the curved black desk with one orange edge light; round 7: the platform's front in the wide), `studio/styles.js`
(`'full-time'`, an open set), `studio/set.js` (no back-wall light under an open set; the floodlight banks in the cache
key; round 7: a programme's own floor in front of the desk), `studio/wall.js` (the screen: the story's picture or the
FULL TIME emblem; THE NUMBER's own figure on its segment), `runtime/stage.js` (warmed with the others),
`public/js/set.js` (the old renderer's `sport` theme), the labs (`v2-set.html`, `v2-camera.html`:
`?programme=full-time&hour=…&zoom=1|3|4`; round 7: `mcu-b` and `ots-b`), `test/full-time-set.test.js` (24 tests) and
`test/v2-set.test.js` (reads the drafts, so the drafted set meets every network set rule); round 8: `palette.js`
(`P_SET`, ENDESGA 32's mid and deep greens for the pitch), `pixbuf.js`, `color.js`, `light.js` and
`tools/measure-frame.mjs` (the two greens in the v2 tables).

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

## Round 7 — the integrator's decisions and fixes; the panel again, from scratch

The integrator (after round 6): fault 1 is decided, not excused: in FULL TIME the platform's screen is the network's
main screen above the desk, its idle frame the FULL TIME emblem (a side screen would break every framing and the
channel's camera grammar); the bible says so (§6). Every other fault stays open, with directions: the platform must
read in the wide, the scoreboard must be an object of the ground, the day's pitch brighter than the night's from the
palette's greens (P.green with P.darkGreen), the golden hour's lit banks as visible as the blue hour's, no golden band
behind a chin in the ots, the singles' lower right given something true to the ground, the mown stripes two calm
values with no edge behind a head in any framing. The panel looked again from scratch, as hard as before.

What changed:

- **The platform in the wide** (fault 2): the deck now runs on a metre and a half in front of the desk (ink: the desk's
  black foot stands on it, visibly), to the platform's edge: an orange LED strip on the edge, panel by panel (broken at
  the riser's three joints), its light on the riser's top row, then the riser's black panels with their seams, down out
  of the frame. The edge's light sits in the wide's only free rows, y 198-199: under the captions and the lower third
  (they end at y 196 and 194) and over the ticker (y 202); the deck under the captions is a quiet ink, the riser under
  the ticker black (ART_DIRECTION's one light line in the graphics zone, here the platform's: DESK_FRONTS `base`, `baseAt:
  'platform'`; the desk's own foot light is off). In every other framing the edge is below the frame. Asked for and
  not built, because the network's wide cannot see them: the platform's steps or a handrail at its ends, and the grass
  and a touchline low in the frame's corners. Measured: the wide's bottom row meets the pitch's surface 11.0 m out
  (Z 1101), behind the desk front (9.0-9.6 m) and the presenters (10 m), so no grass in front of the platform can be in
  frame; the riser under any edge in front of the desk runs below the frame (its foot at y 252 or lower); the
  platform's ends lie beyond the frame's sides (the desk alone spans x -56 to 440). Painting them would be a false
  detail.
- **The scoreboard** (fault 3): now on the stand's roof, right of the screen (wide: x 251-272, y 22-28, 4 px clear of
  the screen's mount and under the clock's box), in a frame on two legs down to the roof, its shadow breaking the roof's
  lit edge (thrown right by day and at the golden hour), the pennant on its pole beside it; the old slot over the
  screen is empty sky. The frame and legs take the colour that stands off each phase's sky (slate at night and by day,
  ink at dawn, the golden and the blue hour). Clear of every person (in the ots on presenter B it would stand by her
  hair, so it is not drawn there). Symmetry: 0 asymmetric blocks outside the board's own.
- **The pitch** (faults 4 and 7): two values a stripe, each one colour or a 50 % checker, never a Bayer pattern. The
  stripes beside the centre, which are behind the presenters' heads in the wide and the two-shot, are darkGreen in
  every phase; the centre stripe carries the light: the green/darkGreen checker in the sun (L* 58 as the eye mixes it),
  the darkGreen/black checker under the floodlights and at dawn (L* 26; the palette's darkest green that stays green:
  with ink or slate it turns teal-grey, with brown or maroon olive). The pitch's light (L* of the mean luminance), day /
  night: wide 45 / 32, two-shot 45 / 29, singles 52-53 / 30, every face over it (Lola 58-59, Paco 68). The stripes are a
  4 m centre stripe and 6.5 m stripes: no edge comes within 6 px of a head in any framing (nearest: 10.8 px, the
  two-shot at Rosa's shoulder); an edge between |X| 218 and 820 would pass behind a head in the two-shot, one between
  278 and 618 in the wide.
- **The golden hour** (fault 5): the lit heads' glare is a warm ring (tanShade, tan nearest the head) lifting the red
  sky by 11 L*, as the blue hour's steel ring lifts its navy (the blue hour's own halo, invisible before, now shows the
  same way); measured against the same sky with the banks off. In the ots the head stands in the sky's second band
  (purple at the golden hour, steel by day, navy at dawn and in the blue hour): the first edge moves above the crown
  with its ramp, the others below the neck; no band edge crosses behind a head in any phase (tested).
- **The singles** (fault 6): the stripes keep their two values out of focus (a stripe is a broad shape: the blur only
  takes the lines) and the halfway line is a dim soft line, so the lower right is the pitch: a stripe's edge running
  to the vanishing point, the halfway line, the boards' glows, all true to the ground.

Still open (the panel, round 7):

1. **The day's lit stripe is a green/darkGreen checker, 37 L* apart** (the integrator's specification; the only green
   mix under the faces): at 1x a sunlit stripe, at 3-5x a coarse mesh; in the two-shot a bright wedge between the
   presenters pointing at the screen, in the day singles a checkered field beside the presenter (under her face's
   value, L* 52 against 58) (pixel artist, director).
2. **The night's mown stripe** (darkGreen/black) reads dark teal at 1x, a textured shadowed stripe at 3x; dawn's pitch
   has the floodlit night's values (an unlit dawn darker than the night would need a darker green the palette lacks)
   (director).
3. **The halos are posterised discs** (the night's language since round 1, now in every lit phase): at 4x and closer
   they read as round plates behind the lamp heads (pixel artist).
4. **The platform's drop is out of frame**, as measured above: the wide reads a stage with a lit edge, not the height
   over the grass; on air the strip sits 3 px over the ticker band and, despite its joints, can be taken for a
   graphics rule at a glance (director, first-time viewer).
5. **The stripes' widths are uneven** (4 m and 6.5 m, set by the heads): the two-shot sees essentially one wedge
   (pixel artist).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Composition and depth | 9.8 | 4, 1 (the wedge's pull) |
| Light and the hour | 9.7 | 2, 3 |
| Pixel craft and palette | 9.7 | 1, 3, 5 |
| Presenters' integration | 9.8 | 1 (the day singles' field) |
| Motion discipline | 9.9 | — (the minute and the pennant only, on the scoreboard; 0 flip-backs under a push) |
| Distinctness | 9.9 | — |
| Performance | 9.9 | — (0.29-0.54 ms uncached, a sixth of WORLD NOW's city) |

**Round score: 9.7. Not passed** (the gate is above 9.7). Every fault the integrator listed is fixed or, for the
grass and steps the wide cannot see, measured and left out rather than faked. What holds light and pixel craft at 9.7
is the palette: two greens, 37 L* apart, so a brighter day stripe can only be their checker and a darker night stripe
only a mix with black; the halos' posterised discs are the night's language carried to the other phases. What would
pass, in the panel's view: a third green in the palette (a mid green near L* 50 gives a lit stripe in one solid colour
and a calm day pitch; a darker one, near L* 25, a night stripe without a checker), and, for the drop, a wide whose
bottom rows reach the grass (a network camera decision, as the screen was).

---

## Round 8 — the palette's two greens, Kai and Rosa, the glows; the panel again, from scratch

The integrator (after round 7): the palette is widened by ENDESGA 32's own mid and deep greens (`#3e8948`, `#193c3e`),
for the pitch only; the network's wide stays as it is for every programme and the platform's drop to the grass is not
required in it (both decisions now in the bible's §6); the platform's strip must not be taken for a graphics line; the
halos must read as light, not plates; rebase onto the branch tip, where Kai's and Rosa's own looks are merged, and check
every framing with their real heads; even stripes if they can be had. The panel looked again from scratch, as hard
as before.

What changed:

- **The palette** (`palette.js`): `P_SET = { midGreen, deepGreen }`, ENDESGA 32's, readable as `P.midGreen` and
  `P.deepGreen` and in the v2 renderer's `C`, `color.js` and the measuring tool, but defined so that no palette-wide
  loop sees them (`Object.keys / values / entries` of `P`): the weather's and the ads' quantisers, the pictures' tables
  and the opens' colour tables are exactly as before, so nothing else on the channel changes (the network set tests,
  72/72, and the cast tests are unchanged).
- **The pitch** (faults 1, 2): every stripe one solid colour, no mesh between the presenters: by day midGreen over
  darkGreen, under the floodlights darkGreen over deepGreen, at dawn deepGreen with a calm darkGreen/deepGreen stripe
  (12 L* apart), the darker value always behind the heads. The pitch's light (L* of the mean luminance), day / night /
  dawn: wide 42 / 28 / 25, two-shot 41 / 28 / 25, singles 46-47 / 31-32 / 28; every face over it (Kai 58-60, Rosa
  67-69: Kai's olive skin is now the darker face, 11 L* over the day's pitch in his single).
- **The stripes** (fault 5): as even as the heads allow: a 4.2 m centre stripe, then 6 m (was 4 m and 6.5 m). With
  Kai's and Rosa's own heads (Rosa's ponytail included) no edge comes within 8.9 px of a head in any framing. Even
  stripes cannot be had: in the two-shot every edge between 2.2 m and 8 m from the halfway line passes behind a
  presenter's head (and between 2.8 m and 6.2 m in the wide), so equal stripes would need to be wider than 16 m or put
  edges behind the heads.
- **The glows** (fault 3): each lit head now glows in steps, as the channel's other lights do: an inner step and a
  middle step of light, then a fringe where every other pixel takes the middle step, so the glow's edge melts into the
  sky (steel and slate over the night's ink, fog and steel over the blue hour's navy, tan and tanShade over the golden
  hour's red). The rings follow the head's exact centre: a ring tied to the rounded head stepped back and forth
  against its growing radius under a push (2 flip-backs in the ots, now 0).
- **The platform's strip** (fault 4): its diodes every other pixel (orange, then a step down), its light falling down
  the riser's top in two more steps (rust, brown) and broken at each panel joint: a light on the set, as the desk's own
  LED line is, not a ruled graphics line. On air (test mode, by day and with the clock forced to night) it reads as
  the platform's lit edge, clear of the captions' and the ticker's rows.
- **Kai and Rosa**: both labs seat their own looks; the OTS's sky bands stay off their heads in every phase (tested
  with Rosa's ponytail); Kai's orange collar no longer confuses the boards' check (the bands are found on the bare
  set).

Still open (the panel, round 8), none of them, in the panel's view, a fault at the gate:

1. **The two-shot still shows one lit centre stripe** between the presenters (with the halfway line, the darker
   stripes behind them and the next lit stripe in the top corners): the head rule leaves no room for more edges there
   (director).
2. **The glow's fringe is a checker** at 6x and closer (at 1-4x a soft edge); the stripes' widths still differ (4.2 m
   and 6 m) (pixel artist).
3. **The night's deepGreen leans teal** beside darkGreen (ENDESGA's deep green); the floodlit night is the darker
   pitch, as asked, rather than the vivid green of a real floodlit pitch (director).
4. **The strip sits three rows over the ticker** on air: its diodes and falloff carry it, at a glance (first-time
   viewer).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Composition and depth | 9.8 | 1 |
| Light and the hour | 9.8 | 3 |
| Pixel craft and palette | 9.8 | 2 |
| Presenters' integration | 9.8 | 1 (the wedge between them), 4 |
| Motion discipline | 9.9 | — (the minute and the pennant only; 0 flip-backs under a push) |
| Distinctness | 9.9 | — |
| Performance | 9.9 | — (0.29-0.97 ms uncached, under a third of WORLD NOW's city) |

**Round score: 9.8. Passed** (the gate is above 9.7). The integrator's decisions (the main screen above the desk, the
network's wide unchanged, ENDESGA 32's two greens for the pitch) are recorded in the bible's §6; everything the panel
asked for on screen is built or, where the network's wide or the head rule rules it out (the drop to the grass, even
stripes), measured and stated.

---

## Evidence (round 8)

Renders (Chromium, the set lab with Kai and Rosa; `public/lab/v2-set.html?programme=full-time&framing=<f>&hour=<h>&zoom=4`,
`framing=mcu-b` or `ots-b` for Rosa): the contact sheets of every phase and framing, the 4x wides by phase, the 6-8x
crops (the platform's strip, the scoreboard, the glows at night, the blue hour and the golden hour) and the on-air
captures are listed in the step's report.

Numbers (node, `labs/set.js`, Kai and Rosa):

| | Night | Dawn | Day | Golden (2 or 4 banks) | Blue hour |
|---|---|---|---|---|---|
| head zone L*, wide / two / mcu / ots | 15.2 / 20.3 / 18.7 / 17.8 | 14.9 / 20.2 / 25.6 / 29.2 | 22.9 / 30.8 / 35.5 / 40.5 | 15.2 / 20.4 / 25.0 / 29.9 | 15.2 / 20.3 / 25.6 / 29.5 |
| pitch light L*, wide / two / singles | 28 / 28 / 31-32 | 25 / 25 / 28 | 42 / 41 / 46-47 | 28 / 28 / 31-32 | 28 / 28 / 31-32 |
| faces L* (Kai / Rosa) | 58-60 / 67-69 | 58-60 / 67-69 | 58-60 / 67-69 | 58-60 / 67-69 | 58-60 / 67-69 |

- Stripe edges: nearest to a head 8.9 px (two-shot, Rosa's shoulder), 15.6 px in the wide, more than 12 px in the ots
  and the singles.
- Symmetry: 0 asymmetric blocks outside the scoreboard's. Palette only (with `P_SET`); the graphics zone black and ink
  but for the platform's light (three rows a column, 1,140 px).
- Motion: a still camera moves only the scoreboard's digits and the pennant; a slow push: 0 flip-backs in every framing.
- Cost: background uncached 0.29-0.97 ms by framing, cached 0.01 ms (WORLD NOW uncached 3.1-3.6 ms).
- Tests: `test/full-time-set.test.js` 24/24; `test/v2-set.test.js` 72/72.

## Evidence (round 7)

Renders (Chromium, the set lab; regenerate with `public/lab/v2-set.html?programme=full-time&framing=<f>&hour=<h>&zoom=4`;
`framing=mcu-b` or `ots-b` for presenter B): the contact sheets of every phase and framing, the 4x wides by phase, the
6-8x crops (the platform's edge, the scoreboard by night and day, the halos at the golden and the blue hour, the day's
centre stripe) and the on-air captures (test mode, 16:05-16:07) are listed in the step's report.

Numbers (node, `labs/set.js`):

| | Night | Dawn | Day | Golden (2 or 4 banks) | Blue hour |
|---|---|---|---|---|---|
| head zone L*, wide / two / mcu / ots | 17.1 / 29.3 / 18.6 / 17.6 | 16.8 / 29.3 / 25.5 / 28.7 | 22.9 / 30.5 / 35.9 / 39.8 | 17.1 / 29.3 / 24.9 / 29.5 | 17.1 / 29.3 / 25.5 / 28.9 |
| pitch light L*, wide / two / singles | 32 / 29 / 30 | 32 / 29 / 30 | 45 / 45 / 52-53 | 32 / 29 / 30 | 32 / 29 / 30 |
| faces L* (Paco and Lola, Kai's and Rosa's stand-ins until step 6) | 68 / 59 | 68 / 59 | 68 / 59 | 68 / 59 | 68 / 59 |

- Symmetry: 0 asymmetric blocks outside the scoreboard's (3-8 blocks, the board and its pennant on one side). Palette
  only; the graphics zone black and ink but for the platform's light line (2 rows, 760 px).
- Stripe edges: nearest to a head 10.8 px (two-shot), more than 12 px in the wide, the ots and the singles.
- Motion: a still camera moves only the scoreboard's digits and the pennant; a slow push: 0 flip-backs in every framing.
- Cost: background uncached 0.29-0.54 ms by framing (0.76 at worst with the profile's noise), cached 0.01 ms, desk
  0.09-0.38 ms (WORLD NOW uncached 3.1-3.6 ms).
- Tests: `test/full-time-set.test.js` 24/24; `test/v2-set.test.js` 72/72.

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
