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

## NEWS IN 60

### Round 1: score 8.9 (lowest: pixel craft)

1. A crash zoom moved the dial 40 px a frame. Eight instants a frame drew ghost copies of the bezel and the rules, as horizontal hatching.
2. The adaptive blur (instants per pixel, endpoint checks, shared 2x2 blocks) drew stair-step structures where pixels were sampled differently.
3. Frames took up to 55 ms.
4. At the switch to the emblem's drawing, 338 px changed:
   - the crown sat a row high;
   - the bands' proportional sizes overrode the emblem's pixels at centre stage;
   - the ticks were padded to four pixels;
   - the rings were rasterised by distance, not as midpoint circles.
5. The crown's sizes were rounded per frame, so its edge jumped back and forth during the push-in.
6. The close-up's metal was flat grey.
7. A crystal glare split the face along a hard radial edge.
8. The pusher lost its modelling as soon as the camera moved.
9. The slow push-in on the close-up made the knurling and the fifths crawl.
10. The hand's blur trail stayed on to the settle, then vanished.

### Round 2: score 9.8 (final)

Fixed from round 1:
- a smooth pull-back of a few pixels a frame, one crisp sample per pixel, and an analytic blur for the hand;
- the bands grow from the emblem's own pixels;
- within two pixels of centre stage, the emblem's rasterisation is emulated, so the seam carries only the hand's own motion (tested: 0 of 748 emblem pixels differ just before the switch);
- the crown grows smoothly;
- a polished convex bezel with a glint, a knurled cylinder pusher, ticks with lit and shaded edges;
- only the finest detail goes while the camera moves;
- the opening close-up is locked off;
- the hand's blur thins away before the emblem.

Evidence:
- flicker fell from 86,000 to 47,000: under 200 px a frame on the still close-up and at rest, and the rest is the pull-back's own motion;
- the hand-over to the package differs by 0 pixels (lab);
- frames take 0.7 ms (median) and 8 ms (p95);
- the theme measures -16.4 LUFS.

Nitpicks left:
1. The face is plain ink between the ticks, as on the emblem.
2. The tick-tock is judged on structure and level measurements only (the off-beat tick sits 7 dB under the tock).

## WORLD WEATHER

### Round 1: score 8.4 (lowest: pixel craft)

1. The clouds were a thresholded noise field: blotchy camouflage, not clouds.
2. The sea of cloud was a grey blanket under a wavy line.
3. The sun's glow was a hard cyan disc.
4. The package's bit (out of the sun's shoulder at 0.9 s) was missing at the hand-over: 16 px.
5. Banks slid 4–8 px a frame past 2 px rims and 1 px outlines: 768,000 A→B→A flickers.
6. A sampled blur ranked a pixel's bands by share, so the picks swapped frame to frame; it hardly helped.
7. The sea's solid bases covered the frame for a second, so all the banks were hidden.
8. Blue sky showed below the sea's soft bases.
9. Bank ends drew dark vertical seams.
10. The sky came in as a screen-door dissolve.
11. The storm was a light, empty slate with one flash.
12. Frames took up to 36 ms.

### Round 2: score 9.7 (final)

Fixed from round 1:
- illustrated banks of cumulus in three depths, sharing the emblem's language;
- the sea is the cloud layer's own top banks;
- a soft blue glow;
- the bit pops on the package's clock;
- motion at most 3 px a frame through the cloud, with each pixel sampling the bank at its own fixed instant;
- bands at least twice the motion deep;
- the sea only at the far and middle depths, with soft bases;
- sky only over the sea;
- shading only on the rims;
- the sky clears from the top down;
- a darker storm with a second, distant flash;
- the falloffs are computed once.

Evidence:
- flicker fell to 105,000 over the sequence (TECH BYTES 158,000, COSMOS 158,000);
- the hand-over differs by 0 pixels (lab);
- frames take 5.3 ms (median) and 19 ms (p95);
- the theme measures -16.6 LUFS.

Nitpicks left:
1. The banks' moving edges are dithered across a few pixels by the per-pixel sampling: in a still they look speckled, in motion they read as blur.
2. The climb inside the cloud deck is the plainest stretch.
3. The p95 frame time is the highest of the sequences.


## The themes, recomposed (owner, 9 Oct: "redo the intro music from scratch if you like it better")

### Before: score 7.9 (lowest: arrangement)

Measured on the five themes as they were:
1. **Sparse.** The model's loudness of each part while it plays, against the lead: pads 15 dB under, bells 20–23 dB under, ticks 29 dB under, hats 35–40 dB under. Under the signature only the lead and the bass were heard; before it, a pad and a sub.
2. **Clashes.** Leads a semitone from the pads' maj7 and #11 tones (COSMOS's B over A#, among others).
3. **Monotonous builds.** One chord and one texture until the signature, so every theme waited for its last four beats.
4. **Lost tracks.** The tune parser kept 12 tracks, so WORLD NOW's felt thump on the hit and its tom on the button were never played.

### After: score 9.6

The engine:
- ensembles: `unison`, `detune` and `spread` on any instrument (several detuned voices a note, across the stereo field, at the level of one voice), with the `strings`, `warm`, `mallet` and `synthbass` presets;
- a long hall (2.6 s) as a send beside the room (`hall`), counted by the loudness model (measured: 3.2 hall² against the room's 2 room²);
- 16 tracks a tune, and a test that no theme loses one.

The scores (each section is in `docs/programmes/*.md`, in its sequence table):
- **TECH BYTES:** sixteenths three against four on the signature's head, a half-time kit, a saw bass in eighths, a wide stab on the wave, the climb over D9 with a snare run into a double-kick boot.
- **COSMOS DESK:** strings in the hall, an orbiting triangle, a timpani roll into the planet, C#m9 over the pedal as day comes round, the #11 high on the hit.
- **MONEY MINUTE:** a warm pad, strings with the sunset, kick and snare without hats, a breakdown for the floors going dark, and a snare pickup into the signature over Bb/F.
- **NEWS IN 60:** the strings climb over the G pedal under the tick-tock (Em, Am, Bm), a short D on the stop, silence for "60".
- **WORLD WEATHER:** rain on an uneven hat, low strings and thunder in the storm, the strings climbing, the low strings opening under the sun.

Evidence:
- no semitone clashes between parts (the piano-roll check, on an eighth grid);
- every part at its level (the model's loudness while it plays, against the lead): pads and strings 6–8 dB under, bass 4–6 dB, bells about 9–11 dB, arpeggios about 13 dB, hats about 22 dB;
- each theme builds to its hit (momentary loudness): TECH -21 to -13 LUFS, COSMOS -20 to -13, MONEY -28 to -13, NEWS -21 to -13, WEATHER -21 to -14, the storm's strike under the sun;
- integrated loudness -16.2, -15.8, -16.3, -16.4 and -16.8 LUFS, true peak -2.2 dBTP at most.

Nitpicks left:
1. The judgement is by structure and measurement, not by ear.
2. WEATHER reads 0.8 LU quiet, the loudness model's own error on that tune.
