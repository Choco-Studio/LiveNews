# Critique log — presenters' faces (QUALITY_LOOP.md)

Renders: `tools/critique/render-cast.mjs --faces` (close-up x3 neutral / happy / talking + the on-air single at 1x,
one row per presenter) and the per-presenter sheets (on set, close-ups, turnaround, talk at 12 fps, gesture).
Flicker: `tools/critique/flicker.mjs` (pixels of one colour that change shape between 30 fps frames, after
aligning on the best whole-pixel shift so a 1 px bob does not count).

## Round 0 — baseline (repo at f20c55b)

Defects (close-ups at s 3.4, on-air singles):
1. Lone light bars on every forehead (browSheen) read as sticking plasters.
2. Nose = a 1 px light stick + a 7 px brown bar under it (both nostrils and the cast shadow in the deep tone).
3. Light skin ramp jumps from skin straight to skinShade: every light face reads split in two along a hard,
   stair-stepped terminator; the lit half is one flat colour (a mask).
4. Heads taper from wide cheeks to a narrow chin: light-bulb heads, childlike.
5. Dark 2x2 "hole" under the lower lip (lip-shadow occlusion 0.36 in the deep tone).
6. Eye sockets invisible (socket bump too shallow): no brow ridge / socket structure.
7. Brows 1 px with a bump at the arch: caterpillars. Paco's arch peaks into a '^'.
8. Under-eye bags on a 6-9 px eye: a 2-3 px dash floating a row under the lid, a scar.
9. Paco's mustache: silver blobs on a steel band with a saw-tooth lower edge, a caterpillar.
10. The neck has a 3 px chin shadow: the head reads as stuck on top of the neck.
11. Nova: two pinkish cheek-plane blobs read as bruises.
12. Max: the beard is a flat slab with a stair-stepped edge.
13. Ada: the crown's sheen strokes on nearly every clump read as diagonal hatching (printed texture).
14. Lola: earrings are 2x2 orange blocks with a white glint, floating beside the jaw.

Scores: silhouette 7.5 · anatomy 6 · consistency 7 · pixel craft 5.5 · integration 7 (motion / acting not judged).
**Round score 5.5.**

## Rounds 1-8 — what changed

- `cast/base.js` SKIN_LIGHT = [cream, skin, tan, skinShade] (brown stays the outline): soft terminator. (#3)
- `face.js` browSheen only at s ≥ 4.5. (#1)
- `face.js` ridge light: lower bridge only, continuous into the tip's light; `head.js` cast shadow 0.42 → 0.26,
  near nostril soft, septum 0.1 → 0.05. (#2)
- `head.js` lip-shadow occlusion 0.36 → 0.2. (#5)  Socket bump -0.55 → -0.75. (#6)
- `head.js` close-up tones [0.885, 0.44, -0.08]: a highlight tone on the planes facing the key (forehead,
  nose bridge, outer cheekbone, chin), kept out of the band under the eyes (it read as a tear track). The lit
  threshold rises so the sockets and the hollow under the cheekbone turn. (#3, #6)
- `character.js` chin shadow on the neck 1.1 → 2.1 u with a deep core under the jaw. (#10)
- `face.js` close-up brows: 2 px head and body, 1 px tail; Paco's arch 0.35 → 0.18. (#7)
- `face.js` bags only on large eyes (W ≥ 10). (#8)
- `cast/paco.js` mustache 4.9 x 1.3 u, clean lower edge, lit upper plane on the key side, shaded far wing. (#9)
- Jaws: jawPow / chinHW raised for every human presenter (men 2.6 / ~3.3, women ~2.5 / ~2.7). (#4)
- `cast/lola.js` earrings: a 1x2 gold drop. (#14)  `cast/ada.js` crown sheen strokes on half the clumps. (#13)

Flicker (talk, 30 fps, s 3.4): the new highlight tone changes 3-4.5 px per frame on average (p95 9-13) against
14-27 px for the lit / shade tones that were already there (those include the jaw): it adds no visible flicker.

Scores after round 8 (close-ups and on-air MCU): silhouette 7.5 · anatomy 7 · consistency 7 · pixel craft 7 ·
integration 7.5. **Round score 7.** Open: hair finish (Paco's noise, Ada's remaining hatching, Lola's crown
patch), Max's beard, Nova's cheek planes, mouths when talking, eyes (blue-grey sclera reads glassy), and the
motion / acting categories, which need filmstrips of real on-air movement.

## Round 9 — guards back to green

The round-8 changes broke two guards (41 failing tests against the 38 Windows-environment ones):
- `v2-face` "forehead highlight is a short sheen": the close-up highlight covered 4.2-6.5 % of the skin
  (cap 4 %; Max worst, the beard leaves the brow as most of his lit skin). Close-up lit threshold
  0.885 → 0.9, and a per-look `sheenCut` (Max 0.02) narrows it further where a beard covers the face.
- `v2-cast-b` distinct silhouettes: Paco's squarer jaw put the Max-Paco mask IoU at 0.865 (cap 0.86).
  Paco jawPow 2.6 → 2.45 (0.855; still adult, the original was 2.25).

## Rounds 10-13 — eyes and the highlight's strays

Defects found (eyes zoomed x9):
1. Sclera nearly all fog: the rule put fog on the whole top row, both corners and the whole far half,
   which on a two-row eye is almost every sclera pixel: glassy, goggle eyes.
2. Lone cream pixels at the eye corners (Lola, Sam, Ada) and a hard 2-stroke 'L' on Sam's temple: islands
   of the round-6 highlight that `cleanTones` never touched (it skipped tone 0, from before the skin had one).
3. The forehead sheen ran through the key-side brow and on under it (Paco's 'hourglass', a plaster).

Changes:
- `face.js` sclera silver; fog only as shadow: the far corner, and under the lid on the far side of an eye
  with three or more rows. (#1)
- `head.js` cleanTones also clears highlight islands up to HI_ISLAND = 6 px. 10 removed more but made
  Ada's 5-17 px highlight cross the limit from frame to frame (flicker p95 9 px); at 6 her p95 is 3. (#2)
- `head.js` no highlight from just above the brow (L.brows.y - 0.45) down past the eye, over the eye's
  width; the forehead sheen stays above the brow. (#2, #3)

Highlight share now 0.4-2.6 % of the skin at s 3.4 / 4. Flicker while talking, 30 fps: 0.65-2.6 px per frame
on average (p95 3-8), down from 3.2-4.5. Known, not from these rounds: in a turnaround one frame switches
~110 px of highlight at once (also with the island pass off): a threshold step in the turn, to fix.

Scores after round 13: silhouette 7.5 · anatomy 7 · consistency 7.5 · pixel craft 7.5 · integration 7.5.
**Round score 7.3.** Open, in order: the turnaround highlight jump; Max's beard (a flat slab with a stepped
edge, a black mouth hole); Nova's pink cheek blobs; hair finish (Paco's noise, Ada's hatching, Lola's crown
patch); heads that read long and egg-shaped on air; mouths when talking; then motion / acting.

## Rounds 14-23 — Max's beard, Nova's planes, hair, quantisation pops, noses

Defects found (close-ups x6-x9, talk and idle filmstrips at 30 fps, `tools/critique/strip.mjs`):
1. Max's beard: random lighter/darker specks in every tone (dirt), a moustache in the ramp's black (two black rows
   over the lip read as an open mouth), a black slab under the chin and a strip of lit neck under it (a strap).
2. Max's forehead sheen: a trapezoid with two straight edges (browTop and the brow band), a plaster.
3. Nova at close-up: the hand-placed cheekbone capsule doubled head.js' new lit planes and read as a straight
   bandage across the cheek; a round replacement read as rouge.
4. Brows popped between an arch with hooked ends and a flat bar from one talk frame to the next (Paco's arch is
   0.6 px; each polyline point was rounded on its own, so a sub-pixel turn changed the shape).
5. Lola: the sheen lit most of each fanned clump (a pinwheel of rust wedges on the crown); separations under
   1.3 px wide aliased into black dashes (stitching).
6. Paco's hairline: a narrow, deep temple recession plus the wave cut an 'M' with two points (cat's ears).
7. Noses: the close-up highlight plus face.js' ridge light made a pale 4x3 block on Sam's nose (a plaster);
   without it the ridge alone read as a 1 px stick.

Changes:
- `cast/max.js` beard close-up: strand dashes only over the beard's lit tone on the cheeks (3-5 px, every third
  column); black only on the far edge of the jaw and the moustache's far tip; moustache maroon with a lit brown
  upper edge; one dark row under the chin; the neck under the beard in its shadow at every tier. (#1)
- `head.js` forehead sheen needs more light the higher it sits (0.06 per unit above the brow band): a curved top. (#2)
- `cast/nova.js` close-up: no cheekbone plane; a broader forehead plane and chin plane carry the light (her
  "warmest, brightest area" guard holds). The medium keeps the capsule. (#3)
- `face.js` brows: the polyline is rounded against one reference point, so the whole brow moves by whole pixels
  and keeps its shape; the ridge light's tip offset is rounded from the stroke's start. (#4)
- `cast/kit-a.js` clumpTone options `sepSoft` (no deep tone in separations), `litW` (sheen width), `sepPx`
  (separation width in px); Lola uses sepSoft, litW 0.78, continuous separations 1.45 px wide. (#5)
- `cast/paco.js` temple recession broader and shallower (sigma² 2 → 5, depth 1.4 → 1.15), wave 0.22 → 0.1. (#6)
- `head.js` no close-up highlight on the nose bridge; the ball of the tip keeps it. (#7)
- Tools: `tools/critique/strip.mjs` (filmstrips, `--find blink`), `flicker.mjs --rows --hist --trace`.

Measured: the turnaround's ~110 px highlight jump is the lab's sweep resetting at t = 4 and 8, not the rig.
Moustache silver while talking: stable at 5 px (the 5-12 px swings are the teeth, same colour, on open visemes).
Blink (Sam, 30 fps): open → half → closed 3 frames (~100 ms) → half → open, no jump.
Tests: v2-face / v2-cast-a / v2-cast-b 83/83; the full suite keeps only the 38 Windows-environment failures.

Scores after round 23 (faces): silhouette 7.5 · anatomy 7.5 · consistency 8 · pixel craft 8 · integration 7.5.
Motion and acting not yet judged on air. **Round score 7.5.** Open: Lola's crown sheen still blotchy; heads read
long on narrow necks in the close-up; hands (owner list 13); Sam walking in WORLD WEATHER; acting timing.

## Rounds 24-27 — necks, blinks, rims, Nova's forehead, the weather presenter's walk

Defects found:
1. Necks 0.35-0.42 of the face's width (a person's is ~0.7-0.8): a pencil neck under a broad head, bobble-heads.
2. Nova's enlarged close-up forehead plane sat centred and tall: a spotlight on her forehead.
3. Blinks closed in one frame and opened over three (owner list 11, "parpadeos que saltan"): the 60 ms close left
   at most one in-between frame at 30 fps, which a two-row eye rounds to open or shut.
4. Sleeves (and any shallow diagonal edge) carried a row of isolated silver rim dots, stitches: the side rim lit
   only the pixel at each step of the edge.
5. Lola's crown sheen still blotchy after round 20.
6. WORLD WEATHER (owner 5 Oct, "walks oddly side-on"): straight legs opening and closing like compasses (a stance
   wider than the hips, 34 cm side-steps, a 3 cm foot lift); while walking and explaining, the hands stayed up at
   the chest in the seated anchors' desk pose, holding an invisible ball; no arm reacted to a step.

Changes:
- Necks widened (men ~0.5, women ~0.43 of the face) with the collar opening by the same amount. (#1)
- `cast/nova.js` close-up forehead plane flatter, over the key-side brow ridge. (#2)
- `idle.js` blinkCurve: close 90 ms, hold 40 ms, open 140 ms; at 30 fps open → half → shut → shut → half → open. (#3)
- `pixbuf.js` resolve: the side rim only where it continues to a neighbouring row (up, down or diagonal);
  vertical and 45° edges keep their continuous rim, shallow slopes lose the dots. (#4)
- `cast/lola.js` sheen band 6.3-8.6, litW 0.7. (#5)
- `rig.js` perf.rest: a performer's own resting channel values (gestures blend from and back to them).
  `scenes/weather/presenter.js`: hip-width stance (8 cm), 24 cm steps, 6 cm foot lift (the knee bends), weight
  3.4 cm over the standing foot; at rest the hands come together loosely in front of the waist, while walking they
  hang at the sides (palms turned in, three-quarter to the lens) and the stepping side's hand balances the step.
  `test/weather.test.js` expects the new stance (19.2 px at 1.2 px/cm). (#6)

Tests: v2-* and weather 309/309.
Scores after round 27: silhouette 7.5 · anatomy 8 · consistency 8 · motion 7.5 · acting 7 · pixel craft 8 ·
integration 7.5. **Round score 7.** (Acting now judged: the weather presenter's points come only with the voice's
marks, not in the lab's frozen renders; to judge on a recorded programme.)

## Rounds 28-30 — on air, correspondents, lips, earrings, Max's eyes, Ada's brows

Judged on the channel itself (`tools/shoot.mjs` on `/?autostart=1&voice=mute`, renders/r28/air) and in the labs.
Defects found:
1. Vic Vector (Americas desk, deep ramp) had no lit planes: one brown face with the far side in shade and the
   nose's light as the only lit pixels, a pale dot.
2. Lola's and Mika's drop earrings floated a pixel under the bob (they read as orange specks beside the jaw).
3. Lola's and Penny's lipstick sat only on the line where the lips meet: a red slit, no lips.
4. Max's eyes taller than everyone's (h 1.62): sclera round the iris, a stare.
5. Ada's brows sat on the glasses' top bar: one heavy dark band over the eyes.

Changes:
- `cast/nova.js` exports drawWarmHead; `cast/correspondents.js` Vic uses it with skinLift 0.4. (#1)
- `cast/lola.js` drawEarrings: at close-up the drop's stem rises to the hair's edge (≤ 4 px). (#2)
- Lola / Penny mouths: upper lip darkRed, the line brown (maroon is the open interior the tests count), lower lip
  skinShade. (#3)
- `cast/max.js` eyes h 1.62 → 1.48. (#4)   `cast/ada.js` brows y -2.35 → -2.7, thick 0.46 → 0.42. (#5)
- `tools/critique/strip.mjs` also draws the correspondents (vic, rhea, mika) in the A lab.

Checked and kept: head shapes (cranium ~6 % wider than the cheekbones, as a real head's ~10 %); UNIT-8 matches the
cosmos.md instrument table (slits, black visor, static sheen, speech line, no lights).
Tests: v2-* and weather 309/309; full suite 1795 pass, the same 38 Windows-environment failures.

Scores after round 30: silhouette 8 · anatomy 8 · consistency 8.5 · motion 8 · acting 7 · pixel craft 8.5 ·
integration 8. **Round score 7.** Lowest: acting, which needs a recorded programme with voices (gestures on the
stressed word, eyelines in two-shots, listeners' reactions).

## Round 31 — Nova's eyes

Nova's iris (brown / maroon) sat at her skin's value, so the eye's opening did not read: only the sclera's corners
and the lash line, small and tired eyes. Iris maroon / black (as Vic's). A taller eye (h 1.58) changed nothing at
s 3.4 (the rows quantise the same), so h stays 1.5.

## Rounds 31-32 — on a recorded programme (WORLD NOW, 90 s with Kokoro voices)

Recorded with `PATH=<ffmpeg dir>:$PATH PYTHON=<python> node tools/showcase/record-show.mjs --port 8602 --start open
--max-wait 1500 --seconds 90` (on Windows the tools need a real python and ffmpeg on PATH; `python3` is the Store
alias). renders/r31/show.mp4, show-sheet.png. Defects found on air and in the labs:
1. Paco's close-up highlight flickered round the nose while he talked (p95 8 of 12 px changing per frame): the edge
   of the no-highlight window under the eye left a 1 px 'L' on the cheek that came and went.
2. The nose tip's highlight was a 3x3 pale block on a 4-5 px nose in the MCU (a shiny nose).
3. Paco's MCU head read as a brick: chinHW 3.35 gave straight sides to a flat chin.
4. Lola's necklace ran over the lapels (r24 widened the garment's opening, and the chain followed it).

Changes:
- `head.js` cleanTones: a highlight pixel that belongs to no 2x2 block of highlight returns to the lit tone (marked,
  then cleared). Paco's talk flicker p95 8 → 2, Sam's 6 → 2. (#1)
- `head.js` the nose keeps the close-up highlight only in a small spot on the tip's key side. (#2)
- `cast/paco.js` chinHW 3.35 → 3.1. (#3)   `cast/outfit.js` the chain follows the neck (neck.hw + 0.4). (#4)

Acting on the recording: Paco reads the grave lead (Hurricane Elena) still, with small head moves and blinks and no
arm gestures, as the writer's grave-story rules ask; the two-way with Vic Vector holds both in their boxes, Vic
speaking with small nods. Nothing puppeted in these 90 s; gestures were not exercised by this lead.

## Round 33 — COSMOS DESK recorded (100 s), Sam's hair, Ada's knit

renders/r32/show.mp4 (COSMOS with Nova and UNIT-8). Acting: in her close-up Nova turns head and eyes to the eclipse
picture while her hand rises toward it, then comes back to the lens; in the wide two-shot she talks with small head
moves and turns once to UNIT-8; UNIT-8 shifts its slits 1 px toward her at the start of her turn and dims once
('processing'), as cosmos.md asks. Nothing puppeted.
Defects fixed:
1. Sam's hair: 2.5 u separation dashes under 1 px wide aliased into dark specks all over the crop (dirt). Now
   sepSoft, sepPx 1.3, gap 4.5: strands, not specks.
2. Ada's roll-neck: the knit ribs were 2-3 px dashes every 6-10 px (a grid of dots, stitching); long ribs in the
   base→shade step read as a barcode. Ribs only where the knit catches the light (lit → base), long with short
   breaks; at her MCU the sweater reads as the fine-gauge knit her look describes.
Max at his MCU (beard, quiff, blazer) holds up.

Scores after round 33: silhouette 8.5 · anatomy 8.5 · consistency 8.5 · motion 8 · acting 8 · pixel craft 8.5 ·
integration 8.5. **Round score 8.** Still below 9.7: the loop continues.

## Round 34 — Penny's jaw, the correspondents Rhea and Mika

1. Penny's lower face heavy and square (chinHW 2.65, jawPow 2.45 from round 1): chinHW 2.55, jawPow 2.2 (her
   silhouette still distinct, v2-cast-a green).
2. Rhea flat (one tone and the far side in shade): skinLift 0.35. Nova's hand-placed planes were tried and dropped:
   under her low fringe the forehead plane was clipped to a thin bar, a plaster.
3. Mika's silver drops had an orange tip (drawEarrings hard-coded the gold's shade): the tip is the metal's own
   darker step (silver → fog). Her lips as Lola's and Penny's (colour on the lips, brown line).
Motion check (Lola talking, 36 frames at 12 fps): smooth head tilts out and back, a blink, varied mouths, the earrings
follow; nothing snaps or repeats.

## Round 35 — the wide

Paco's tie read as a black tie with a red tip in every wide: the 2 px blade's own maroon outline (where it meets the
shirt) ate the colour, only the wider tip stayed red. `cast/outfit.js` drawTie: at tier 0 the blade and knot are
flat decals of the tie's own colour (no outline of their own), so it is the same tie as in the close-ups.
(`buf.joinGroups` was not used: it persists in the shared buffer across actors and frames.)
Checked: Sam (NEWS IN 60) and Penny (MONEY MINUTE) wides read cleanly at 1x.

## Status after round 35 — where the score stands and why

Scores: silhouette 8.5 · anatomy 8.5 · consistency 8.5 · motion 8.5 · acting 8 · pixel craft 8.5 · integration 8.5.
**Round score 8.** Before / after (round 0 vs 35): renders/before-after-a.png.

What the remaining critique points at is no longer a defect to fix but the art direction's own limits:
- Skin has 4 tones (ramp) from ENDESGA 32. A face lit by a key from camera-left gets one lit plane, one base, one
  shade and the deep: every round that added modelling (rounds 2-8, 24, 28) found the same ceiling, where a 5th
  step (a warm half-tone between lit and base) would let cheekbones, the brow ridge and the jaw turn without hard
  bands. That is a palette decision (ART_DIRECTION.md), the owner's.
- Faces are ~22-26 px wide in the MCU at 384x216: the eye is 2-3 rows, the mouth 1-3; acting with the face (a
  brow's lift, a half smile) has 1 px to work with. Higher-resolution close-ups would break the channel's
  pixel-art grid; also the owner's call.
Inside those limits the hostile pass of round 35 found only small items; the panel's 9.7 would need one of the two.
