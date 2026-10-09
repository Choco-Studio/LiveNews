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

## COSMOS DESK

### Round 1: score 8.0 (lowest: read at 1x)

1. At the start the stars sat in a dense cluster at the vanishing point, so the opening read as a galaxy smudge.
2. The flyby's planet was half lit by the emblem's first light (from the right), not backlit.
3. The sun's burst was small.
4. Close up, the planet was flat colour blocks.
5. The nebula was faint at the start.

### Round 2: score 9.0 (lowest: motion and timing)

Fixed from round 1:
- the stars are spread out at the start;
- the flyby's sun sits behind the planet (a thin crescent) and swings round through L0 to the key light;
- the burst is an eight-point star with a dithered glow;
- the nebula is full from the cut.

Defects:
1. Day came round only once the planet had shrunk, so its close-up detail was never seen lit.
2. The fine streaks read as squiggles.
3. The rings changed colour all at once when the light crossed the side.

### Round 3: score 9.5 (lowest: pixel craft)

Fixed from round 2:
- day comes round from the burst while the planet is still big;
- the belts are broad with gentle waves;
- the rings turn over through the screen's fixed matrix.

Defects:
1. The ringlets were set in screen pixels, so they slid as the ring scaled and flickered at 61,000 a second.

### Round 4 (final): score 9.8

Fixed from round 3:
- the ringlets belong to the ring (radius in e), broad, fading before they are thinner than two pixels: flicker fell from 225,000 to 158,000 over the sequence.

Evidence:
- the hand-over to the package differs by 0 pixels (lab) and matches pixel for pixel in the unit test;
- frames take 3.4 ms (median) and 10.7 ms (p95);
- the theme measures -15.7 LUFS, 5.5 LU range.

Nitpicks left:
1. The deep field's stars stream gently (calm by design, at 82 BPM).
2. The nebula's dithered edges crawl slightly as it drifts.
3. The kit's glide steps the planet's size, as in every open.
4. The theme is judged on structure and measurements only.

## MONEY MINUTE

The first idea was a guilloché rosette and a banknote. A prototype at 384x216 showed that engraved line work falls to noise at this size, so it was dropped. The sequence became a time-lapse of the financial district instead: the evening, the tower emptying, the last window as the bit.

### Round 1: score 9.2 (lowest: pixel craft)

1. The towers were tinted by the full sky gradient, so every silhouette carried the same horizontal colour bands.
2. Windows of 1 px slid at 0.7 px a frame, and diagonally in x and y on alternate frames: 204,000 A→B→A flickers.
3. The close-up was a full-frame grid of 4 px lights, so it read as an LED panel.
4. The middle distance dithered to a checkerboard for whole seconds as it darkened.
5. The crown was cut off at the top of the frame at the cut, so the match on the tower was lost.
6. The neighbours in the close-up were boxes outlined on four sides.
7. The far skyline's lights were placed by a modulo rule and drew diagonal hatching.
8. The clouds were 1–3 px lines that read as wires.
9. The sky's slow gradients dithered across 30 rows.
10. The music was level from beat 1 to beat 13: the bass entered at once.

### Round 2: score 9.8 (final)

Fixed from round 1:
- each layer has its own flat tone, with haze along the horizon and the sun's glow through it;
- the camera is slower (towers under 0.5 px a frame) and every slide steps at 15 Hz, so x and y change together and never on two frames running;
- the close-up frames the tower's top floors and its stepped crown against the sky, between two neighbours with slanted and setback roofs and fins;
- layers darken late and quickly;
- the sky's dither is about 5 px wide whatever the gradient;
- the clouds are lenses with a lit underside;
- an elevated road carries the time-lapse's traffic streaks;
- lit skylights sit on the rooftops;
- the bass enters with the sun going down, and a felt sounds under each floor going dark.

Evidence:
- flicker fell from 204,000 to 16,400 over the sequence; most of what is left is the cut itself and the package's own glide;
- the hand-over to the package differs by 0 pixels (lab);
- frames take 4.5 ms (median) and 9 ms (p95);
- the theme measures -16.5 LUFS.

Nitpicks left:
1. The tower dissolves into the field through the screen's matrix in a quarter of a second (dark into dark).
2. The road's streaks are small at 1x.
3. The theme is judged on structure and measurements only.

