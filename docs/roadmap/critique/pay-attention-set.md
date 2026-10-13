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
