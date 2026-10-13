# PAY ATTENTION — set critique log (build step 5: the quiz studio)

Step 5 of `docs/programmes/pay-attention.md` §9, the set: the quiz studio of §6. **Gate: renders critiqued above 9.7 by
a hostile panel; the round's score is its lowest category.** The open is judged in `pay-attention-open.md`; the theme,
the bed and the stings in `pay-attention-sound.md`.

**The brief** (§6): a low stage in a dark room; the network's main screen as the question board, in a purple frame with
a 1-px fog rim; two contestant desks, each with a buzzer lamp and a score display in pixel digits; the host's podium in
the centre; the players told apart by a shape (a circle on seat A, a square on seat B), never by colour alone, never by
a letter; white and gold light only; purple only on the desk fronts and the board's frame, always with its rim; two
moving heads on the back wall that sweep between questions and hold still during one; nothing borrowed from TECH
BYTES's purple-and-magenta rings and LEDs or COSMOS's purple glow.

**Built**:
- `public/js/v2/canvas25d/studio/quiz.js`: the geometry (`QUIZ`), the three seats (`QUIZ_SEATS`), the framings
  (`quizCamera`), the director's hook (`setQuizState`, `quizState`) and the sweep's clock, the room (`quizRoom`: the
  frame), the stage (`quizFloor`: the black deck, the skirting, the white nosing), the podium and desks
  (`rasterQuizDesks`), the lamps, the score displays, the moving heads and their beams (`LIVE_DRAW['pay-attention']`);
- `studio/styles.js` (`'pay-attention'`, theme `quiz`: built ahead of its config entry, `BUILT_STYLE_IDS`), `studio/set.js`
  (the desk branch, the network plate on the podium, a style's own ceiling line), `studio/dressing.js` (the hooks),
  `studio/wall.js` (the board at rest: PAY ATTENTION and the two shapes in fog; a story's picture);
- `public/js/set.js` (the old renderer's `THEMES.quiz`: steel and silver rings, gold LEDs, no purple);
- the lab: `public/lab/pay-attention-set.html` with `labs/pay-attention-set.js` (`?framing=wide|host|player-a|player-b`,
  `?question=1`, `?lamps=A|B|AB`, `?scores=7,12`, `?wall=picture`, `?t=`, `?onair=1`: the network's top row over the set);
- `test/pay-attention-set.test.js` (19 tests).

**The panel**: a lead pixel artist, a senior broadcast director and production designer, a senior quiz-show producer,
a sound designer and composer (here for the moving heads' timing against the countdown) and a first-time viewer.
Categories, each 0–10: **composition and depth**, **light** (white and gold), **pixel craft and palette**,
**presenters' integration** (the people, and the graphics on air), **motion discipline**, **game legibility** (who is
who, the lamps, the scores), **distinctness**, **performance**.

**How it was looked at**: the lab in Chromium (Playwright), read at 1x, 3x and 4x, and 6–10x crops; contact sheets of
the four framings with the board at rest and with a story's picture; the lamps off, A, and both; the scores; the sweep
at t 0, 4, 8 and 12 s and a question held (the heads still); the network's top row drawn over the set (`?onair=1`: the
bug, LIVE, the programme's purple tag as in its 8 s after the open and after breaks, the clock); NEWS IN 60, MONEY
MINUTE and COSMOS in the network's solo wide for comparison; numbers from node (`labs/pay-attention-set.js`:
`measure()` for faces, head zones and wall light; `profile()` for frame cost). The cast are stand-ins until step 6:
Sam as the host, Penny on seat A, Nova on seat B. Renders of the last round: see "Evidence" at the end.

(The scores of rounds 1 and 2 were given afterwards, from each round's renders; round 3's is the panel's verdict on the
final renders, looked at again from scratch.)

---

## Round 0 — the first renders (during the build, not scored)

1. **Two moons.** The pools behind the contestants were bright slate ellipses, the room's two loudest things. Now ink
   washes from above, as dark as COSMOS's, with a narrow Bayer edge.
2. **The desks vanished** into the black stage. Now ink fronts, the tops and the side faces black.
3. **The downlight scallops floated off the heads**: the parallax between the wide and a player's single moved them
   beside the hair. Now one wide wash per contestant, whose edge falls beside the head in both framings.
4. **The moving heads did not read**: invisible over the pools, the beam a thin blade. Now at the wall's outer edges, a
   fixture drawn at its true size (yoke, slate barrel with a steel rim, the lens turned along the beam), and the beam a
   flat cone in steel, slate and ink that only ever lifts the wall (it never paints over the dark).
5. **The frame read as an outline.** Now 9 units of purple with its fog rim; the desk fronts got a groove under the
   band and a black kick.
6. **The circle lamp's housing overwrote the band's bottom rim** (the purple test caught it): the lamp a size smaller.

## Round 1 — the panel's first look

Faults:

1. **The desks were flat ink slabs**: no construction, nothing to say what they are made of (production designer).
2. **The desks crowded the frame**: desk A's outer edge 3 px from the frame's left edge in the wide (director).
3. **Stray Bayer dots** of a pool's edge along the host single's right edge (pixel artist).
4. **The board at rest missed the host's single**: two lines at 2x needed 104 px and the free box beside his head is
   92 px, so the layout fell through to nothing legible (pixel artist).
5. **The purple test was loose**: it only flagged slate or steel beside purple, not a missing rim (engineering).

| Category | Score | Worst fault |
|---|---|---|
| Composition and depth | 9.0 | 1, 2 |
| Light | 9.3 | the washes' hard steps |
| Pixel craft and palette | 9.0 | 3 |
| Presenters' integration | 9.2 | 3, 4 |
| Motion discipline | 9.6 | — |
| Game legibility | 9.5 | — |
| Distinctness | 9.7 | — |
| Performance | 9.9 | — |

**Round score: 9.0.**

## Round 2 — after the fixes

What changed: the desks are built in panels (a silver top edge, a black reveal under it, two recessed seams a third in
from each end, a black kick, the left edge catching the key); they are 4 units narrower each (air at the frame's
edges); the washes moved out to X ±160 (no dots in the host's single); the board at rest falls back to 1x on one line
with its shapes in the host's single (as MONEY MINUTE's wordmark in its single); the purple test checks every rim pixel.

New faults:

1. **The washes became tombstones**: a flat plateau with a narrow edge (edge 0.3) read as two cut-out slabs (pixel
   artist).
2. **The open's and the set's lamps disagreed** on the highlight (a disc that printed as a "+"): fixed in both.

| Category | Score |
|---|---|
| Composition and depth | 9.6 |
| Light | 9.5 |
| Pixel craft and palette | 9.5 |
| Presenters' integration | 9.6 |
| Motion discipline | 9.8 |
| Game legibility | 9.8 |
| Distinctness | 9.8 |
| Performance | 9.9 |

**Round score: 9.5.** The washes were softened (edge 0.55, taller, centred higher) before round 3.

## Round 3 — from scratch, and on air

The panel looked again at every framing, as hard as the first time, and for the first time with the network's top row
drawn over the set.

Faults:

1. **The washes ran over the ceiling line**: light painted onto the ceiling above y 6 (pixel artist).
2. **Two 1-px notches in the ceiling line** at x 147 and 236: the board's drop pipes, black on the black wall, showed
   only as the gaps they cut (pixel artist).
3. **The desks' lit left edge stopped dead at y 150**, halfway down the panel, where the graphics zone begins: a stub
   (pixel artist).
4. **In the singles the frame's rim was ink** (out of focus): the bible's purple always carries its fog rim (quiz
   producer).
5. **A story's picture on the board** at the network's brightness (mean L* 56) behind the host's head in the dark room
   (director).
6. **On air, the network's solo wide failed the top row.** The frame's top-left corner stood under the programme's
   purple tag (8 s after the open and after breaks): purple tag and purple frame merged into one shape. The clock's black
   plate cut the right wash's top. The left moving head's bracket stood in the top row's last row, under the bug's globe
   (director).
7. Once the wide was reframed (below), **the square lamp's housing took the band's bottom rim row** (the test).

What changed:

- 1: the wall's light eases out under the ceiling (black above Y −121); 2: the pipes are gone (the board hangs on the
  wall); 3: the slate edge runs down the front's top section only, to the groove under the band (the podium's to its
  plate's foot); 4: the frame's rim is fog in every framing, as the board's own words are; 5: a story's picture on the
  board is kept as quiet as COSMOS's (mean L* 50).
- 6: **the quiz's wide is its own**: the network's solo wide pulled back 5 % and lowered 11 px (`quizCamera('wide')`:
  zoom 0.95, horizon at y 87). The frame's top is now 6 px under the top row, the washes and the moving heads'
  brackets start 11 px under it; the desks' fronts and the podium's plate still end above the graphics zone
  (y 147); the ceiling's one line stays at y 6 (`style.ceilingY`); the stage moved 33 cm back so its lit nosing sits in
  the wide's free rows (y 198: under the captions and the lower third, over the ticker), as FULL TIME's platform edge.
  A test now holds the top row: nothing but the dark wall within 4 px of either box at any point of the sweep, and the
  bracket's top at y 26 or lower.
- 7: a lamp and its housing ring are sized to fit inside the band's rim at any scale (the square 8 px, the circle 9 px
  in the wide).

Still open (the panel, round 3):

1. **Player B's single and the programme tag.** In that single the frame's right band (x 153–168) stands under the
   tag's right end (x 92–172) during the tag's 8 s: purple on purple. The singles are mirror images; a pan moves the
   band 0.55 px per pixel of head, so clearing the tag would put B's head at x 306. The panel accepts it at 9.8 only with
   the director's rule (step 4): no cut to player B's single while the tag shows. The tag itself is a bare purple box on
   the dark set; by §6 it should carry the fog rim too (graphics), which would also separate it from the frame
   (director).
2. **The board's name at 1x in the host's single** (the free box beside his head is 92 px; two lines at 2x need 104):
   legible, small, and it reads more as a caption than as the board (pixel artist, first-time viewer).
3. **A story's picture fills the board behind the host's head** in the wide and in his single, the owner's rule for
   every wall; quieter now, but a photo's bright sky can stand behind his hair (director).
4. **The washes' Bayer edges read as a checker** at 4x and closer, and their flat tops under the ceiling make them
   shields more than scallops (pixel artist).
5. **The moving heads are small** (a 9-px fixture, a 36-px cone) and only the wide sees them; in a still they read as
   wall lamps, and only their sweep says "moving head" (first-time viewer).
6. **The low stage reads only by its lit nosing**: the deck is black (the graphics zone allows black, ink and one light
   line), so the step up is told, not seen (director).
7. **The lamps are out of frame in the players' singles**: a lock-in there is seen through the graphics' marks only
   (quiz producer).
8. **The set at rest is sombre**: purple fronts and frame, the network's red plate, gold only when a lamp is lit. The
   excitement comes from the lamps, the beams and the graphics, as §6 asks (quiz producer).
9. **The cast are stand-ins** until step 6 (the host's face; the contestants' seats are the network's people).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Composition and depth | 9.8 | 6, 4 |
| Light | 9.8 | 4, 3 |
| Pixel craft and palette | 9.8 | 4, 5 |
| Presenters' integration | 9.8 | 1 (with the director's rule), 2, 3, 9 |
| Motion discipline | 9.9 | — (only the beams move, between questions; the lamps and scores change on the director's hook) |
| Game legibility | 9.8 | 7 |
| Distinctness | 9.9 | — |
| Performance | 9.9 | — |

**Round score: 9.8. Passed** (the gate is above 9.7). Fault 1 is a live fault until the director (step 4) holds its
rule or the tag gets its rim.

What keeps each category from 10, in one line each:
- **Composition and depth**: a stage seen only by its nosing; the washes' shield shapes.
- **Light**: posterised washes (a checker at 4x); a story's photo can be brighter than the room behind the host.
- **Pixel craft and palette**: the washes' Bayer edges; the moving heads are 9-px fixtures.
- **Presenters' integration**: player B's single under the purple tag (the director's rule); the board's name at 1x in
  the host's single; stand-ins.
- **Motion discipline**: nothing the panel would change; a 10 would want the sweep heard (the composer suggests the
  heads come to rest on a bar line of the bed, which the director can do by setting the question flag on the grid).
- **Game legibility**: the lamps unseen in the players' singles.
- **Distinctness**: nothing on the channel looks like it; a 10 would want a signature object the eye remembers beyond
  the lamps.
- **Performance**: nothing.

---

## Evidence (round 3)

Renders (Chromium; regenerate with `public/lab/pay-attention-set.html?still=1&framing=<f>&scores=7,12&lamps=A&t=<t>`,
`&onair=1` for the top row, `&question=1` for the held heads, `&wall=picture` for a story; zoom with `&zoom=4`): the
4x wide, the four framings on air at 3x, the sweep at t 0, 4, 8, 12, the lamps lit and dark, the 6–10x crops of the
desks, the lamps and the top-left corner are listed in the step's report.

Numbers (node, `labs/pay-attention-set.js`, the stand-in cast, the board at rest):

| | Wide | Host | Player A | Player B |
|---|---|---|---|---|
| faces L* (Penny / Nova / Sam) | 63.6 / 56.3 / 65.9 | — / — / 67.1 | 64.1 | 44.0 (Nova's own dark skin ramp) |
| head zone L* (mean, max) | 17.1, 18.2 (players) | 0 (the board's black) | 15.5, 18.2 | 15.0, 18.2 |
| wall L* (mean) | 9.4 | 7.9 | 10.1 | 10.1 |
| background uncached / cached, desk (ms) | 0.21 / 0.011, 0.30 | 0.15 / 0.011, 0.05 | 0.17 / 0.018, 0.02 | 0.10 / 0.009, 0.01 |

- Every face stands at least 20 L* over its head zone; 0 bright patches near a head.
- Palette only; purple only inside the fog-rimmed fronts and frame; gold only in a lit lamp; red only on the network's
  plate; the graphics zone (y 150 and below) black and ink with one light line, the nosing.
- Symmetry: 0 asymmetric 8x8 blocks outside what differs by design (the board's words, the plate, the lamps' shapes,
  the score windows).
- Motion: during a question the whole frame is identical from frame to frame; between questions only the beams move
  (eased in and out over 0.8 s).
- Top row: nothing within 4 px of the bug's or the clock's box in the wide at any point of the sweep.
- Tests: `test/pay-attention-set.test.js` 19/19; `test/v2-set.test.js` and `test/full-time-set.test.js` unchanged and
  passing.

## Round 4 — the reviewer reopens it (after the merge)

The integrator compared the set at 1x and 4x side by side with the network's other sets (NEWS IN 60, MONEY MINUTE,
COSMOS, FULL TIME's pitchside). Round 3's 9.8 does not hold against them:

1. **The back wall is a flat dark field.** Every other set has a designed back wall: screens and data panels, wood and
   brass, a starfield and a horizon, floodlit stands. Here there is nothing behind the players but two cones of light.
2. **The floor is empty.** About a quarter of the wide is an unlit floor with one line: no gloss, no reflection of the
   desks' lights, no stage ring, no light along the nosing.
3. **The desks are dark slabs.** Their lower fronts have no light, no edge strip and no texture, so the shape marks and
   scores carry the whole desk.
4. **The board idles as plain text** ("PAY ATTENTION", a circle, a square). The network's main screen idles with a
   designed graphic on every other set.
5. **Little light design.** There are no rim lights on the players, no pools on the desks and no rig. Real quiz studios
   are dark, but cut with light.

| Category | Round 3 | Reviewer |
|---|---|---|
| Composition and depth | 9.8 | 8.6 |
| Light | 9.8 | 8.8 |
| Pixel craft | 9.8 | 9.2 |

**Round score: 8.6. Reopened.** The rest of round 3's work stands: the seats, the framings, the moving-head hook, the
rules on purple and gold, and the shapes and lamps.

---

## Round 5 — the studio rebuilt (the reviewer's five points)

What changed, point by point (round 4's numbering). Everything stays inside §6: a dark room, white and gold light only,
purple only as fills with their fog rims, the moving heads still during a question, the shapes and lamps on the desks.

1. **The back wall in layers** (`quiz.js` `quizRoom`), back to front:
   - a white soffit along the top of the wall (y 3 in the wide, over the graphics' top row), its light falling in two
     steps;
   - a white cove along the wall's foot;
   - two truss towers at the wall's sides (a box truss, the outer chord catching the light), each carrying its moving
     head on a top plate: the rig;
   - each player's shape in sixteen warm-white bulbs above their desk, on an ink fixture: A's ring, B's square;
   - an ink backing panel behind the host, the board's frame on it, and two white light strips framing it, each a fog
     core with a steel and slate glow and a wide ink halo;
   - the board's frame, purple with its fog rim, with a marquee of warm-white bulbs set into it.
2. **The floor**: the stage's front edge is now a ring of light round the host: a white LED nosing straight across in
   front of the desks, curving forward round the podium in a half circle (y 193 at the sides, 201 in front of the
   podium, over the ticker). On the gloss: flat ink reflections of the cove, the strips' feet and each desk's foot.
3. **The desks**: each is a cabinet (a silver top edge, white edge strips at both corners, the purple band holding the
   shape lamp and the score, or the network's plate), its overhang's black shadow, and a plinth set back under it,
   black with ink slats. A pool of the key's light on each desk's top, under the hands.
4. **The board's idle is a designed graphic**: the emblem (the two players' lamps, circle and square, on a purple plaque
   with its fog rim, the open's lamps) beside the name, white over silver, as the open's board shows it. Every 8 s the
   emblem tests its lamps: the circle lit gold for a beat, then the square. The test runs on the moving heads' clock, so
   it stands still with them, and during a question both lamps are dark (`quizIdlePhase`).
5. **Light design**: the pools behind the players stay (the light from above on the heads' backs). The towers' heads and
   beams now sweep outward, clear of the towers. A lit lamp lights its player's shape on the wall in gold too, so the
   lock-in reads across the studio.

The API is unchanged for step 4: `QUIZ_SEATS`, `quizCamera`, `setQuizState`, `quizState` and the sting names. The live
layer is now `drawQuizLive`, which the open drives with its own state; `LIVE_DRAW['pay-attention']` still calls it with
the director's.

Faults found while building it, fixed before the panel looked (not scored):

1. The beams lay over the towers, because the old sweep ran straight down the heads' new mounts. The sweep moved
   outward (centre −30°, ±12°).
2. The light strips read as grey poles (a fog line with a narrow glow). They now have a wider glow and an ink halo.
3. A ghost "88" in the score windows read as part of the score ("87"). It was removed: a quiz producer never risks a
   misread score.
4. The players' shapes peeked into the players' singles as a row of bulbs beside the clock's plate. They are smaller
   and higher now, wholly above those frames.
5. The shapes' top bulbs and the strips' tops stood within 4 px of the graphics' top row. Both were lowered (the
   top-row test caught them).
6. The backing panel's and the towers' lit edges (the key from the left) broke the set's symmetry in 23 blocks. They
   are mirrored to the pixel now.
7. The desks' feet's reflections drew brackets (corner streaks under each end). They are now a single ink row.
8. The board's name ran to the bezel in the wide (2 px of air). It now needs 12 px of air. The name goes in two lines
   beside the emblem in the wide, and in a column under it in the host's narrow side box.

## Round 6 — the panel from scratch, beside the network's sets

How it was looked at:
- the quiz's wide side by side with NEWS IN 60, MONEY MINUTE, COSMOS, WORLD NOW (night) and FULL TIME (night) at 1x and
  3x;
- every framing at 3–4x, with and without the network's top row (`?onair=1`), and 6x crops of the rig, the desks and
  the floor;
- the board's three idle states (circle lit, square lit, both dark during a question);
- the numbers from node.

At 1x the quiz now holds its own beside the others: a game-show studio read at a glance (the marquee board, the rig
and its beams, the lit podiums, the players' shapes in bulbs, the ring of light round the host). It stays the network's
darkest set, as its bible asks.

Still open (the panel, round 6):

1. **The pools are dithered shields**: posterised washes with a Bayer edge, a checker at 4x. They are the network's
   light language, but the least designed thing on the wall (pixel artist).
2. **The floor's gloss is nearly invisible**: the graphics zone allows only black, ink and one light line, so the
   reflections are ink on black. True reflections of the desks' lights would fall below the frame. The ring of light
   carries the floor (director).
3. **The beams aim into the frame's dark corners**: they light haze, not a target (director).
4. **The bulbs are 2 px squares**: bulbs at 1x, squares at 4x (pixel artist).
5. **Two parallel verticals each side of the board** (the strip and the backing panel's edge), 6 px apart (pixel
   artist).
6. **The players' singles show less of the room** than the wide: a pool, a strip and the board, its emblem and name at
   1x on a large black screen (director).
7. **Two ambient motions**: the beams' sweep and the board's lamp test. The board is wall content, which may move, but
   a strict reading of the motion budget allows one set effect (director).
8. **The cast are stand-ins** until step 6.
9. **The rule on player B's single** is no longer needed. The programme tag now carries its fog rim (graphics), so over
   that single's frame band it reads as its own box (checked on air, 6x crop).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Composition and depth | 9.8 | 2, 6 |
| Light | 9.8 | 1, 3 |
| Pixel craft and palette | 9.8 | 1, 4, 5 |
| Presenters' integration | 9.8 | 6, 8 |
| Motion discipline | 9.8 | 7 (both stand still during a question) |
| Game legibility | 9.9 | — (a lock-in lights the lamp and the player's shape on the wall; the scores on lit desks) |
| Distinctness | 9.9 | — (no other set on the network is a game-show studio; nothing of TECH BYTES or COSMOS) |
| Performance | 9.8 | 0.68 ms uncached in the wide (three times round 3's), under the network's 1 ms; cached 0.01 ms |

**Round score: 9.8. Passed** (the gate is above 9.7).

What keeps each category from 10, in one line each:
- **Composition and depth**: an invisible gloss on the floor; the singles show less of the room than the wide.
- **Light**: the pools' posterised edges; beams that light nothing in particular.
- **Pixel craft and palette**: square bulbs; the pools' checker; the double verticals beside the board.
- **Presenters' integration**: the singles' plainer backgrounds; stand-ins.
- **Motion discipline**: two ambient motions, both still during a question.
- **Game legibility**: nothing the panel would change.
- **Distinctness**: nothing the panel would change.
- **Performance**: the uncached frame now costs three times what it did.

## Evidence (round 6)

Renders (Chromium; regenerate with `public/lab/pay-attention-set.html?still=1&framing=<f>&scores=7,12&lamps=A&t=<t>`,
`&onair=1` for the top row, `&question=1` for the held heads, `&zoom=4`): the comparison sheet with the network's five
other sets, the four framings on air, the board's three idle states and the 6x crops are listed in the step's report.

Numbers (node, `labs/pay-attention-set.js`, the stand-in cast, the board at rest):

| | Wide | Host | Player A | Player B |
|---|---|---|---|---|
| faces L* (Penny / Nova / Sam) | 63.6 / 56.3 / 65.9 | — / — / 67.1 | 64.1 | 44.0 (Nova's own dark skin ramp) |
| head zone L* (mean) | 17.1, 17.0 (players), 24.7 (host) | 0 (the board's black) | 15.5 | 15.0 |
| wall L* (mean) | 11.4 | 8.3 | 8.8 | 8.8 |
| background uncached / cached, desk (ms) | 0.68 / 0.012, 0.22 | 0.17 / 0.010, 0.04 | 0.25 / 0.014, 0.04 | 0.23 / 0.010, 0.01 |

- 0 bright patches near a head; every face at least 20 L* over its head zone.
- Palette only.
  - Purple only inside the fog-rimmed fronts and frame.
  - Warm white (cream) only in the bulbs.
  - Gold only in a lit lamp and its player's shape; with the lamps dark there is no gold on the set.
  - Red only on the network's plate.
  - The graphics zone is black and ink but for the ring of light (its diodes and the slate under them).
- Symmetry: 0 asymmetric 8x8 blocks outside what differs by design (the board's content, the plate, the lamps, the
  score windows, the players' shapes).
- Top row: nothing but the dark wall within 4 px of the bug's or the clock's box at any point of the sweep.
- Tests: `test/pay-attention-set.test.js` 20/20 (new: the room's elements, the ring of light, the bulbs, the lamp
  test); `test/v2-set.test.js` and `test/full-time-set.test.js` pass unchanged.

## Reviewer, after round 6

Set accepted by the reviewer at 9.75: composition 9.75, not 9.8.

| Category | Round 6 (panel) | Reviewer |
|---|---|---|
| Composition and depth | 9.8 | 9.75 |

**Accepted at 9.75** (the gate is above 9.7). The open's round 7 (`pay-attention-open.md`) leaves the set as it stands:
the open's dark beats are drawn in the opens package, and nothing in `studio/quiz.js` or `studio/set.js` changed.
