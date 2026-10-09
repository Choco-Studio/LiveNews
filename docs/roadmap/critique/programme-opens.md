# Programme title sequences: critique log

Owner, 9 Oct: "now make the other programmes' intros as crafted as WORLD NOW's". The method is `docs/roadmap/QUALITY_LOOP.md` with the rubric of `world-now-open.md`:
- read at 1x;
- continuity;
- motion and timing;
- pixel craft;
- broadcast grammar and brand;
- sync of the pictures to the music.

The lessons of WORLD NOW's vibration are rules here:
- geometry stays fractional until a pixel is plotted;
- dithers are fixed on the screen;
- small features are filtered by their footprint and the frame's motion;
- every render is measured at 30 fps for A→B→A flicker, not only judged on sheets.

## TECH BYTES

### Round 1: score 7.5 (lowest: read at 1x)

1. The traces were 1.5 units wide, seen from 11 units up, so the board read as a highway with neon lanes.
2. The crane passed close to the processor, so the emblem's frame was seen magnified, in chunky pixels.
3. The fog dithered to black and speckled.
4. The components were grey dithered blocks.
5. The processor's traces were dotted where magnified.

### Round 2: score 8.6 (lowest: pixel craft)

Fixed from round 1:
- the run is at 20 units, over buses of 0.7-unit traces that jog at 45 degrees;
- a row of pads runs down the middle;
- packages have silver legs and capacitors stand tall;
- the crane rises past the overhead height and settles onto it, so the frame is never magnified;
- the TECH backdrop is computed where each pixel lands instead of baked;
- fog darkens in palette steps;
- magnified stretches of trace are joined up.

Defects:
1. Pads, crosses and short traces strobed in the run and the crane: A→B→A flicker of 25,000–130,000 pixels a second.
2. The crane was too fast: the pitch turned 40 degrees in 0.4 s.
3. Frames took 12–17 ms.

### Round 3: score 9.4 (lowest: pixel craft)

Fixed from round 2:
- small features are filtered over the frame's motion (capped, never on the buses, which slide along themselves), so the run's flicker fell by a third;
- the crane is 1.9 s;
- the board works in palette indices, fog skips the far board and the signals' fronts are computed once a frame: 6–9 ms a frame.

Defects:
1. An uncapped motion blur turned the buses into cyan slabs in the crane.
2. The horizon glow was a dotted stripe.
3. Far side blocks were dithered noise.
4. Capacitor highlights fogged to cyan.

### Round 4: score 9.7 (lowest: pixel craft)

Not above 9.7 yet: the middle distance was sparse and the centre pads blurred into crosses.

Fixed from round 3:
- the blur is capped and kept off the buses;
- the horizon is a solid navy and ink line;
- far side blocks fade out instead of tinting;
- capacitor edges are silver.

Evidence:
- the hand-over to the package differs by 8 pixels, the heads of four traces advancing one pixel in the same instant;
- flicker is 13,000–19,000 a second in the run;
- the crane peaks at 89,000 (the wave's bright heads racing: motion);
- the theme measures -16.0 LUFS.

### Round 5 (final): score 9.8

Fixed from round 4:
- the centre pads are SMD resistors (black bodies, silver end caps) passing under the camera, which gives strong parallax;
- rows of tiny capacitors stand beside the buses;
- the theme is a crescendo from quiet (the pad and the arpeggio rise through the run).

Nitpicks left:
1. The chip seen at an angle in the crane is a soft mip (motion).
2. The kit's glide steps the chip sprite's size, as in every open.
3. Far fog steps are dithered between neighbouring palette colours.
4. The theme is judged on structure and measurements only.
