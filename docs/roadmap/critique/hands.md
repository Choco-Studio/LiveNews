# Presenters' hands: critique log

Owner's open item: "Manos: detalles pendientes (golpecito al juntar dedos, deslizar gafas, nudillos, mano relajada) y rendimiento." The method is `docs/roadmap/QUALITY_LOOP.md` and its rubric. Every round is judged on:
- 1x crops and 3-10x upscales of every look at rest in the wide (1.0), the two-shot (1.86) and the single (3.4);
- the key poses of every presenter at the single (3.4) and the close (3.8), and of four looks in the wide and the two-shot;
- filmstrips at 12 fps (24 fps for contacts) on a still window;
- the real stage (`public/lab/v2-stage.html`, TECH BYTES) for the on-air framings with the set and graphics.

Renders are made in node with scratch tools that are not in the repo (a round sheet, before/after sheets, and a per-frame capsule check of the two hands' solids).

## Round 0 (base 1f076b8): score 7.0 (lowest: motion)

Renders: `/tmp/polish-hands/work/r0/`.

1. Steeple: the fingers interlaced into an X at the top; the fingertips never met.
2. Steeple: the hands floated apart and back during the hold; no contact beat.
3. Knuckles: one dashed lit ridge across the back of the hand read as a glove seam.
4. Resting hands: mirrored twins with flat fingers (paddles).
5. Resting hands and the papers slid about 2 px with every breath and sway.
6. Glasses: the frame lifted before the finger reached it.
7. Glasses: placed on stressed words, with no rarity.
8. Glasses: only one way (the pinch at the hinge).
9. The idle "hands closer" pose overlapped the two hands by about 4 px.
10. Counting: no contact at all; the fingers sprang up alone.
11. UNIT-8: the joint lines of curled fingers read as holes.
12. The resting hands' raster was redrawn every frame: the cache almost never hit.

## Round 1 (c2d444c .. a68d3d1): score 8.4 (lowest: pixel craft)

Renders: `/tmp/polish-hands/work/round1/`, `/tmp/polish-hands/work/r1_*.png`.

Fixed from round 0:
- `touch` puts the fingertips pad to pad (rig.js touchHands), with a contact beat (`tipSettle`) and a dead hold; steeple:tap and steeple:press were rebuilt on it;
- knuckles are separate 2 px clusters with valleys between them;
- resting curls are graded and the two hands are different;
- resting hands are planted on the desk and their raster is cached;
- glasses: the lift follows the finger, and they are placed between sentences at most once in ~3 minutes, never over a stressed word; a one-finger push variant was added;
- the joined idle pose meets fingertip to fingertip;
- micro-shifts and a settle make the resting hands live;
- count:tap: the other index lands on each counted fingertip.

Defects:
1. Resting thumbs curled into C-shaped claws.
2. UNIT-8: dark clumps where joint lines piled up.
3. A folded fist's knuckle valleys drew a pi-shaped glyph.
4. Steeple approach: one frame of interlaced fingers.
5. count:tap: the fingers overlapped at the 4th and 5th taps.
6. The far sleeve ran on a stiff diagonal.
7. The glasses push covered the mouth.
8. steeple:tap: the taps were too subtle.
9. count:tap in the wide was a blob.
10. The papers were mostly hidden under the resting hands.
11. Valleys showed as dashes between the knuckles.
12. Penny's pen hid behind her fingers.

## Round 2 (b93d901): score 8.9 (lowest: motion)

Renders: `/tmp/polish-hands/work/round2/`.

Fixed from round 1:
- the resting thumbs lie on the script and the hands turn toward the lens (no claw);
- `thinLines()` keeps UNIT-8's joints as lines;
- a fist's knuckles only dimple;
- Penny's pen crosses the thumb web.

Defects:
1. Steeple approach (24 fps, `/tmp/polish-hands/filmstrips/steeple_approach_paco_38_24fps_before_r2.png`): for six frames the middle fingers crossed by about 2 px and the fingers read as a comb.
2. Steeple hold: the five fingertips were unequal. The middle tips overlapped by 0.6 units while the little fingers were 1.35 units short of meeting.
3. steeple:tap and steeple:press releases: the wrists came in while the fingers turned across, and the fingers crossed by up to 1 unit.
4. count:tap: counting the ring and little fingers, the tapping index lay through the middle and ring tips (up to 1.1 units).
5. count:tap: on the way in, the tapping index swept through the counting thumb.
6. count:tap: lifting off a finger, the index went through the next one.
7. glasses:push: the back of the hand covered the whole lower face (`glasses_push_ada_34_12fps_before_r2.png`).
8. count:tap could be planned in a wide, where it reads as a blob.
9. Experts with glasses (Omar, Tomas) never touch them on air.
10. A fist's folded fingers still draw a small pi glyph at 3.8.
11. The nail pixels of a tent leaning to the lens make a dotted column.
12. steeple:tap: a 2 px opening at 3.4 is visible but small.

## Round 3 (3326e76, df1e051): score 9.3 (lowest: acting, pixel craft)

Renders: `/tmp/polish-hands/work/round3/`, `/tmp/polish-hands/*.png` (before/after), `/tmp/polish-hands/filmstrips/`, `/tmp/polish-hands/stage/` (on air), `/tmp/polish-hands/hands_gestures_clip.mp4`.

Fixed from round 2:
- touchHands keeps the closest pair of twin fingertips just touching, one-sided from a touch of 1/50, so no finger passes its twin;
- STEEPLE curls bend each finger so that all five tips meet within 0.1 units;
- the tap and press releases open the wrists before the fingers turn;
- count:tap: the tapping index comes across from in front of the counting hand and lifts toward the lens, and its wrist keys sit where it taps;
- glasses:push comes from low on the hand's own side with the index slanting in;
- no count:tap in a wide;
- a test checks the two hands' solids for overlap in the steeple family and count:tap n 1-5, every presenter, both seats. Only the pads' press is allowed.

Defects:
1. count:tap: the counting hand is held high so a head-and-shoulders single sees it above the caption, so the tapping forearm comes up toward the lens at collar height. It is plausible but effortful.
2. count:tap: tapping the thumb (5th), the tapping hand dips under the counting hand's knuckles.
3. glasses:push: the hand still hides one side of the mouth for about 0.3 s (always in a pause).
4. Experts with glasses never adjust them. Their gestures come from runtime/stage.js (REMOTE_GESTURE, cued at sentence starts), which this pass did not change.
5. A tent leaning to the lens shows a dotted column of nail pixels at the meeting line at 3.4.
6. The backs of the hands at 3.4 (steeple:tap) carry scattered knuckle-valley specks that read slightly as freckles.
7. In steeple:press, Penny's pen is left lying on the desk under the low joined hands. At 3.4 it reads as a stick poking out from under them.
8. Resting hands: one-pixel nail and lit-edge pixels on the fingertips flicker by a pixel when a micro-shift moves a finger.
9. UNIT-8 resting hands at 1.86 are busy grey clumps (robot by design, still noisy).
10. A fist's folded fingers (count1, front view) still show the pi glyph.
11. Steeple approach: the fingertips meet end to end for about 3 frames before the tent rises. Real steeples form while rising.
12. In the wide (1.0) a steeple is a 6-8 px wedge of skin. It reads as hands together, not as a steeple.

| Category | Score |
|---|---|
| Silhouette and read at 1x | 9.5 |
| Anatomy and proportion | 9.4 |
| Consistency | 9.5 |
| Motion | 9.4 |
| Acting | 9.3 |
| Pixel craft | 9.3 |
| Integration | 9.4 |

Next: nails on fingers pointing at the lens, and the steeple's fingers turning up sooner as the hands rise.

## Round 4 (1fb8215, 225a610): score 9.3 (lowest: acting)

Renders: `/tmp/polish-hands/work/round4/` and the refreshed `/tmp/polish-hands/` sheets, filmstrips and poses.

Fixed from round 3:
- a nail is drawn only on a fingertip whose last bone is at least 3 px long on screen, so the tent leaning to the lens loses its dotted column (test: fingers pointing at the lens carry a quarter or less of the light detail pixels of fingers up);
- the steeple's fingers turn up a little sooner as the hands rise.

Defects:
1. count:tap: the counting hand is held high, for the single's caption, so the tapping forearm comes up toward the lens at collar height. It is plausible but effortful.
2. count:tap: the thumb tap (5th) dips the tapping hand under the counting knuckles.
3. glasses:push: one side of the mouth is hidden for about 0.3 s (in a pause).
4. Experts with glasses (Omar, Tomas) never adjust them on air: their gestures are runtime/stage.js REMOTE_GESTURE, cued at sentence starts.
5. Backs of the hands at 3.4: shade specks of the valleys and finger separations read slightly as freckles when the hand is foreshortened.
6. steeple:press: Penny's pen lying on the desk reads as a stick under the joined hands at 3.4.
7. Resting hands: one-pixel nail and lit-edge pixels hop by a pixel when a micro-shift moves a finger.
8. UNIT-8 at rest at 1.86: busy grey clumps.
9. A fist's folded fingers (count1, front view) still draw a small pi glyph.
10. Steeple approach: the fingertips still meet nearly end to end for 2-3 frames before the tent rises.
11. Wide (1.0): a steeple is a 6-8 px wedge, read as hands together.
12. On air (TECH BYTES, `/tmp/polish-hands/stage/techbytes_wide_ada_steeple_12fps.png`), Ada's steeple releases to the desk in about 0.3 s just before a cut. The runtime's timing compresses it, and it reads a little abrupt.

| Category | Score |
|---|---|
| Silhouette and read at 1x | 9.5 |
| Anatomy and proportion | 9.4 |
| Consistency | 9.5 |
| Motion | 9.4 |
| Acting | 9.3 |
| Pixel craft | 9.4 |
| Integration | 9.4 |

Not above 9.7. Next, in order:
- a lower counting hand where the framing allows it, so the tapping arm can relax;
- experts' glasses, which need a remote cue placed in a pause by runtime/stage.js;
- fewer shade specks on foreshortened hand backs;
- Penny's pen kept clear of the joined hands.
