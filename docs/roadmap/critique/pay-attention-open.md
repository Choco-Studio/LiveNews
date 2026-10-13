# PAY ATTENTION title sequence: critique log

The brief (`docs/programmes/pay-attention.md` §6): "The open (≈8 s, 112 BPM): a dark stage; the buzzer lamps of both
desks light in turn on the beat; the question board flips to PAY ATTENTION; the plate." Purple only as a fill with its
fog rim; white and gold light only; no laughter and no applause, ever; no real broadcaster's or game show's jingle.

Method: `docs/roadmap/QUALITY_LOOP.md`. A hostile panel: a lead pixel artist, a senior broadcast director, a senior
quiz-show producer, a sound designer and composer, and a first-time viewer. Renders only. Each category is scored 0–10,
and a round's score is its lowest category. The bar is above 9.7 in every category.

**Rubric:**
- picture craft (read at 1x, pixel craft, shimmer);
- timing to the music;
- clarity of the PAY ATTENTION plate;
- distinctness from the other opens;
- the promise of a game (does a first-time viewer know a quiz is about to start?).

The theme itself is scored in `pay-attention-sound.md`.

**Where it is:**
- the cue sheet, shared by the picture and the theme: `public/js/scenes/opens/cues.js` (`'pay-attention'`);
- the studio: `public/js/scenes/opens/payattentiontitles.js`;
- the emblem, the two lamps on their plaque: `public/js/scenes/opens/payattention.js`;
- the package's opt-in rim down the plate's sides: `public/js/scenes/opens/kit.js` (`style.plateRim`);
- the theme: `public/js/audio/themes.js` (`payAttentionTitles`);
- the lab: `public/lab/opens.html?kind=open&id=pay-attention` (`window.__lab.render(t)`);
- tests: `test/pay-attention-sound.test.js` (the open's part) and `test/opens.test.js`.

**Renders:** 30 fps frames from the lab (250 frames), viewed at 1x, 3x and 4x, contact sheets every 0.3–0.8 s, 10x crops
of the emblem, A→B→A flicker counts, frame times in Chromium, and the open recorded with its theme
(`pay-attention-open.mp4`, listed in the step's report).

## The sequence as built (round 3; one beat grid, 112 BPM, a beat 0.536 s; times from the cut)

| Beat | Time | Picture | Music |
|---|---|---|---|
| 0–2 | 0–1.07 | The dark studio: the board's outline in slate on black, the three desks' top edges, nothing lit. | An A-flat sub and an open fifth on the pad; two soft snaps count in. |
| 2, 3, 4, 5 | 1.07, 1.61, 2.14, 2.68 | The lamps light in turn on the beat: A's circle, B's square, A, B. Each flashes (its cream heart grown for a fifth of a beat), then glows gold while the other goes dark; each desk's front comes up ink with its purple band and fog rim the first time its lamp lights. | A ping per lamp, the channel's signature an octave up (E-flat, A-flat, B-flat, E-flat), left for A and right for B; the pad opens to add9. |
| 6 | 3.21 | Both lamps flash; the room's light comes up: the washes on the back wall, the moving heads and their beams, the board's purple frame and fog rim, the podium, the stage's white nosing. The wide has crept in 5 % since the cut, eased, and now holds. | The downbeat: the band comes in (pluck arpeggio, bouncing bass, soft kick, snap on 2 and 4, off-beat hats) with a flam. |
| 6.5–7.5 | 3.48–4.02 | The board's face turns over and comes back as PAY ATTENTION (white over silver). | A mallet run up the scale from E-flat, eight notes over the turn. |
| 8 | 4.29 | Cut to the board close (twice the wide): PAY ATTENTION at 4x. | F minor over the A-flat pedal. |
| 10 | 5.36 | Cut to the emblem: the two lamps lit on their purple plaque, at centre stage at the package's size. | The signature on the lead (E-flat, A-flat, B-flat, E-flat) over D-flat on A-flat. |
| 11.5–14 | 6.2–7.5 | The package: the top row comes on, the emblem glides to its slot, the plate wipes out of it: PAY ATTENTION, THE WEEK'S NEWS AS A GAME, WITH (the host). | The signature ends; the colour (B-flat, the 9th) over A-flat sus2. |
| 14 | 7.5–8.3 | Still. | The hit: the lead rises to C (the 10th) on A-flat 6/9 with bells; it rings to the cut. |

(The scores of rounds 1 and 2 were given afterwards, from each round's renders; round 3's is the panel's verdict on the
final renders, looked at again from scratch.)

## Round 0 — the first draft (during the build, not scored)

The open played end to end at the first try (the cue sheet's 8.3 s, the hit at 7.5 s). Two pitch errors in the theme
(a D-flat chord and its arpeggio a semitone off; a D natural in the flip's run) were fixed before anyone looked.

## Round 1 — the panel's first look. Score 9.2 (lowest: picture craft)

Faults:
1. **The lamps' highlight printed as a "+"**: a disc that small at 1x is a plus sign (pixel artist).
2. **The desks read as flat cards** in the dark (director).
3. **The board, once lit, was a flat frame**: nothing caught the key as every set's screen does (pixel artist).
4. **A dead camera**: the wide held perfectly still for six beats in the dark (director).
5. **The plate's fog rim ran along its top only**; its sides were bare purple on the dark, against §6 (pixel artist).

| Category | Score |
|---|---|
| Picture craft | 9.2 |
| Timing to the music | 9.7 |
| Clarity of the plate | 9.5 |
| Distinctness | 9.7 |
| The promise of a game | 9.5 |

## Round 2 — after the fixes. Score 9.6

What changed:
- 1: the highlight is a small block up and to the left, larger on the flash (in the open and on the set alike);
- 2: side faces were tried on the desks: in the dark they read as stray slashes at 1x, so they were taken out again;
  the desks keep their silver top edge and their lit fronts;
- 3: the board's bezel lips (its top and left inner edges) catch the light once the room is up;
- 4: the wide creeps in 5 % over the lamps' beats, eased, then holds (every edge moves one way and each pixel changes
  once); the board's words stay at a whole pixel scale whatever the creep;
- 5: the plate's sides took a fog rim, first through the open's own `after` hook; that left the UP NEXT promo's still
  lock-up (which skips `after`) without it, so the rim moved into the package as an opt-in (`style.plateRim`), drawn
  with the plate (MONEY MINUTE's and WORLD NOW's own hooks untouched); a test now holds the lock-up frame-still from the
  hit to the cut.

| Category | Score |
|---|---|
| Picture craft | 9.6 |
| Timing to the music | 9.8 |
| Clarity of the plate | 9.8 |
| Distinctness | 9.8 |
| The promise of a game | 9.7 |

## Round 3 — from scratch

Faults:
1. **The washes were dithered eggs** running off the top of the frame: not the set's pools, which stop flat under the
   ceiling (pixel artist, director).
2. **The emblem's plaque stood half a pixel high in the lock-up**: the plate's box (its top line, its purple, its bar)
   is 27 rows and the plaque sat 2 rows under its top and 3 over its foot (pixel artist).
3. Centring it on a pixel row gave **the circle a nub at each side of its middle row** (an even width over an odd
   height) (pixel artist).
4. A ceiling line, tried to match the set, hugged the frame's top edge once the creep had run (y 1): dropped.

What changed: the washes take the set's shape (flat-topped under the ceiling with a three-unit Bayer band there, a
narrow Bayer edge at the sides and foot); the emblem is painted on pixel centres in both axes, so the plaque stands
with 2 rows above and 2 below in the plate's box and the circle is a clean 13 x 13 disc (a test holds the centring).

Evidence:
- **Flicker:** 7,045 A→B→A over the open (FULL TIME 56,906; the other opens 105,000–158,000). Per second: 0, 19, 0,
  3,975, 150, 4, 2,495, 402, 0. The third second is the room's light, the double flash and the board's turn (its
  edge-on frame); the sixth is the package's glide and wipe, as in every open. The creep adds next to none (19 in the
  first two seconds).
- **Frame times** (Chromium, the lab): median 0.3 ms, 95th percentile 1.1 ms (FULL TIME's 7.6 and 11.3 on the same
  machine).
- **Tests:** the lamps light in turn, gold on the right desk only; the words at whole pixels (2x in the wide, 4x in the
  close); the creep one way and then held; every purple box with its exact fog rim (through the framing on air); the
  emblem's hand-over to the package (the same pixels at centre stage); the plaque centred in the plate's box; the
  lock-up still from the hit to the cut; every instant draws (`test/pay-attention-sound.test.js`, `test/opens.test.js`).

Still open (the panel, round 3):
1. **"WITH THE HOST"** in the lab's lock-up: the credit line is a placeholder until step 6 names the host (on air it
   comes from the programme's presenters) (quiz producer).
2. **The open's studio is the set redrawn, simpler**: no seams on the desks, no network plate on the podium, no people
   (an empty studio waiting for its game). A director would like the cut from the open's last wide to the programme's
   wide to match more closely (director).
3. **The board close shows the washes' soft edges** at both sides of the frame: true to the room, a little texture at
   the edges (pixel artist).
4. **The flip samples rows by nearest neighbour**: for two or three frames mid-turn the squashed letters have uneven
   strokes at 4x (pixel artist).
5. **The moving heads barely move** in the two beats of room light before the close (their sweep is slow by design)
   (director).
6. **8.3 s against "≈8 s"**: the hit at 7.5 s, then the package's still, as in every open (quiz producer).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Picture craft | 9.8 | 3, 4 |
| Timing to the music | 9.9 | — every event on a beat: a ping per lamp, the band on the room's light, the run on the turn, the signature on the emblem's cut, the hit on the lock-up |
| Clarity of the PAY ATTENTION plate | 9.8 | 1 (and the name twice, board and plate, by design) |
| Distinctness | 9.8 | the only open set in an empty studio, and the only emblem made of the players' own shapes; a quiz's lamp test is a familiar idea |
| The promise of a game | 9.8 | 2, 5 |

**Round score: 9.8. Passed** (the gate is above 9.7).

What keeps each category from 10, in one line each:
- **Picture craft**: the flip's nearest-row squash; the washes' edges in the close.
- **Timing to the music**: nothing the panel would move; a 10 would want the moving heads to land on the hit.
- **Clarity of the plate**: the placeholder credit until step 6.
- **Distinctness**: lamps lit in turn is a known game-show figure, made the channel's by the shapes.
- **The promise of a game**: an empty studio promises contestants it does not show.

## Round 4 — the reviewer reopens it (after the merge)

Seen beside the network's other opens (WORLD NOW's flight over the city, FULL TIME's floodlights and whistle), this one
is the plainest on the channel:

- a dark room;
- two lamps;
- a board that flips;
- a plate.

Its studio is simpler than the set's, which round 3 already said and still scored 9.8. "Promise of a game" holds, but
"picture craft" against the channel's own standard does not.

| Category | Round 3 | Reviewer |
|---|---|---|
| Picture craft | 9.8 | 8.8 |
| Distinctness | 9.8 | 9.4 |

**Round score: 8.8. Reopened.** It is to be rebuilt on the richer set from the set's round 5.

---

## Round 5 — rebuilt in the studio itself

The open is now shot in the quiz studio of the set's round 5: the v2 renderer draws the set itself
(`payattentiontitles.js` calls `drawBackground`, `drawDesk` and `drawQuizLive`), and a camera moves through it. The cue
sheet, the 112 BPM grid, the theme's sync, the emblem and the plate rules are unchanged. The lock-up credit "WITH THE
HOST" stays a placeholder.

### The sequence as built (round 5)

| Beat | Time | Picture | Music |
|---|---|---|---|
| 0–2 | 0–1.07 | The studio with its lights out, seen from high at the back of the room, the camera already moving: a crane down through the rig hung over the front of the studio (a ladder truss with its par cans, which rises past the lens and out of the frame) and a push down the room. Only the room's lights glimmer: the dim bulbs of the marquee and of the players' shapes, the strips, the stage's ring. The two moving heads search the dark, their beams swinging in from outside together. | An A-flat sub and an open fifth; two soft snaps count in. |
| 2, 3, 4, 5 | 1.07–2.68 | The lamps strike in turn, one a beat: A's circle, B's square, A, B. Each strike lights the lamp and its player's shape on the wall in gold and lifts the room a step for a fifth of a beat. Each striker's head swings onto its desk in the last third of the beat before and stops dead on the strike: a follow spot, the other head dark. The camera keeps coming down and in. | A ping per lamp, the signature an octave up, left and right. |
| 6 | 3.21 | The camera lands on the quiz's wide on the downbeat as the room's light comes on: the soffit, the cove, the strips, the marquee, the ring of light, the podiums' bands. Both heads fire inward and sweep out, stopping dead at rest on the next beat. The board shows the emblem over a row of blank tiles. | The band comes in with a flam. |
| 6.5–7.5 | 3.48–4.02 | The board's letters flip in one by one, left to right, tile by tile, to PAY ATTENTION (white over silver). | The mallet run up the scale. |
| 8 | 4.29 | A cut to the board at twice the wide's scale: the emblem and the name at 2x in the marquee frame, the strips at its sides. | F minor over the pedal. |
| 10 | 5.36 | A cut to the emblem: the two lamps, lit, alone on the open's field. | The signature on the lead. |
| 11.5–14 | 6.2–7.5 | The package: the emblem glides to its slot and the plate wipes out of it. | The colour, then the hit. |
| 14 | 7.5–8.3 | Still. | The hit rings to the cut. |

The dark is the lit studio taken down the palette's ramps, a step at a time (`color.js` DARKER): three steps in the
dark, two while the lamps strike, one on a strike. So the dark room and the lit room are the same room, and each lamp's
strike lifts it.

Faults found while building it, fixed before the panel looked (not scored):

1. A cubic ease made a dead start: the first beat barely moved. The move now runs from the cut and lands softly on the
   downbeat.
2. The letter tiles sat on a fixed 6-px advance, which left a gap at the I ("ATTENTI ON") and merged the blank tiles
   into two bars. Now each tile takes the face's own advance and its letter's width, with the face's 1-px gap between
   tiles.
3. The rig's zigzag web crawled under the crane (the flicker map showed it). It is now a ladder truss, whose vertical
   struts slide along themselves.
4. In the dark the network plate's white letters were the brightest thing in the frame. Paint (white, silver) now goes
   two steps further down than the lights do.
5. The par cans read as hooks in the dark. They now have slate bodies with a lit side.
6. The dark half was still but for the lamps. The heads now search the dark, then follow-spot each strike.

## Round 6 — the panel from scratch, beside the network's opens

How it was looked at:
- 30 fps frames (250), viewed at 1x and 3x, and contact sheets beside FULL TIME's and WORLD NOW's opens;
- A→B→A flicker counts with a map of where the flips fall;
- frame times in Chromium;
- the open recorded with its theme (`pay-attention-open-r5.mp4`).

At 1x it now plays as a sequence with a camera in a place: from the rig's height down into the dark studio, the
buzzers striking under follow spots, the lights coming up on the downbeat, the board answering in flipping letters. It
is darker than FULL TIME's floodlit stadium by its brief ("a dark stage"), and as eventful.

Evidence:
- **Flicker:** 62,642 A→B→A over the open (FULL TIME 56,906; the other opens 105,000–158,000). Per second: 42,400,
  11,899, 5,150, 273, 19, 4, 2,495, 402, 0.
  - The first second is the rig passing the lens: by the map, about 40,000 of its flips lie along the truss's own path,
    a near object moving at 30 fps with no blur.
  - The second and third seconds are the camera's move and the heads' swings.
  - The room itself never crawls: its lights are fixed world points.
- **Frame times** (Chromium, the lab): median 0.5 ms, 95th percentile 3.9 ms, the slowest 16.5 ms (the first frame and
  the cut to the close). FULL TIME: 7.6 ms, 11.3 ms and 51 ms on the same machine.
- **Tests** (`test/pay-attention-sound.test.js`, 24; `test/opens.test.js`):
  - the camera moves from the cut, one way, lands on the wide on the downbeat, then cuts to the board at exactly twice
    the scale;
  - the letters flip left to right inside the flip's beat: blank tiles before, every pixel of the name after, 1x in the
    wide and 2x in the close;
  - the light comes up in steps, the strikes lift it, and the follow spots stop dead on their strikes;
  - palette only: purple inside its rims, gold only in the lamps and the players' shapes, red only on the plate;
  - the emblem's hand-over, the plaque centred in the plate, and the lock-up still from the hit to the cut.

Still open (the panel, round 6):
1. **The rig's pass strobes** in the first second: about 40,000 A→B→A along the truss's path. This is a near object's
   motion, not a crawl, but at 30 fps with no blur a pixel artist sees it step (pixel artist).
2. **The dark studio reads as line art**: the lit room taken down the ramps keeps its outlines, so the first beats are
   a wireframe of the room rather than black with lights. The marquee's dimmed bulbs go amber (tanShade) (director).
3. **The follow spots are cones on the wall's plane** from the tower heads: they point at the desks' outer ends, a spot
   "on the player" by suggestion (director).
4. **The close is a cut**, not a move (director).
5. **"WITH THE HOST"** stays a placeholder until step 6 names the host (quiz producer).
6. **The letters flip at 1x in the wide**: the flip is the open's climax, 7 px tall; the close gives the name at 2x
   (pixel artist).
7. **8.3 s against "≈8 s"**: the hit lands at 7.5 s, then the package holds still, as every open does (quiz producer).

| Category | Score | What keeps it from 10 |
|---|---|---|
| Picture craft | 9.8 | 1, 2, 6 |
| Timing to the music | 9.9 | — (every event on a beat: a ping and a spot per strike, the lights on the downbeat, the heads stopping on the next, the run on the flip, the signature on the emblem's cut, the hit on the lock-up) |
| Clarity of the PAY ATTENTION plate | 9.8 | 5 |
| Distinctness | 9.8 | — (the only open shot in its own studio, with the network's set renderer; a lamp test under follow spots is a known game-show figure, made the channel's by the shapes) |
| The promise of a game | 9.8 | 3, 4 |

**Round score: 9.8. Passed** (the gate is above 9.7).

What keeps each category from 10, in one line each:
- **Picture craft**: the rig's strobing pass; the dark as a wireframe; the flip at 1x.
- **Timing to the music**: nothing the panel would move.
- **Clarity of the plate**: the placeholder credit until step 6.
- **Distinctness**: the lamp test is a familiar figure.
- **The promise of a game**: spots that suggest the players rather than find them; an empty studio waiting for its cast.
