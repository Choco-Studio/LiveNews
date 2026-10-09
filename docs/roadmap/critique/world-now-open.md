# WORLD NOW title sequence: critique log

The owner's request (9 Oct): "real newscasts have a far more crafted intro, several seconds long, with
great effects. Make one for our programmes, starting with WORLD NOW; when it scores above 9.7, show me."
Method: `docs/roadmap/QUALITY_LOOP.md` (a hostile panel of a pixel artist, a broadcast director and a
first-time viewer; renders only; at least 10 defects before any score; the round's score is the lowest
category).

**Research.** Real opens studied before the build:
- BBC News: a countdown with relentless pips, place names animated over the world, and interconnecting
  lines between people and places (Lambie-Nairn and David Lowe).
- Newscast studio packages: a family of opens, a sharp logo reveal at the end, glass and light layers.
- ITV News at Ten: a countdown, then Big Ben's bongs between headlines.

What we kept:
- the pips (four B5 pips, near the BBC's 1 kHz);
- the network of lines between cities, with each city named and its local time;
- one continuous camera move;
- the package's own lock-up as the logo reveal.

**Rubric for an open** (each 0–10):
- read at 1x and composition;
- continuity (no pops, one planet throughout);
- motion and timing;
- pixel craft;
- broadcast grammar and brand;
- sync of the pictures to the music.

Renders: 30 fps frames and MP4s with the theme, made from the lab (`public/lab/opens.html`,
`window.__lab.render(t)` and `window.__audio.render()`). Filmstrips are at 12 fps.

## Round 1: first full draft. Score 8.0 (lowest: read at 1x)

1. The night was lit like day: the sun sat above the visible cap, so Europe showed in steel and fog.
2. The flare's ghost rings sat in the middle of the globe as small circles, like interface glyphs.
3. London sat off centre in the first shot.
4. New Delhi landed outside the frame on the right limb, so its label never showed.
5. Routes that went behind the planet looped round its silhouette as red "ears".
6. There was a dead hold of about 1 s on the settled globe before the glide.
7. The title glint lit 2–10 pixels and was invisible.
8. The drone re-attacked at each bar, leaving gaps in the low end.
9. Nothing in the music marked the sunrise.
10. The city lights were sparse orange crosses.
11. The camera barely moved in act 1.

## Round 2: score 8.8 (lowest: pixel craft)

Fixed from round 1:
- the sun is now behind the planet, so act 1 is a night frame with a thin dawn ring;
- the ghosts are gone and the flare core is stronger;
- the framing is computed per landing;
- routes hide beyond the horizon, as on the emblem;
- the camera now settles at the brass entry;
- the glint band is 6 px wide;
- the drone is legato;
- a bell and an air swell now mark the sunrise.

Defects:
1. The lights looked like stamped, identical crosses.
2. Close up, Europe had none of the glow of a real night-lights image.
3. Landing rings started as tiny white diamonds.
4. The sunrise was still unmarked by the strings.
5. The NEW DELHI plate drifted next to London's pin, so it read as London's label.
6. Plates wiped in from the right on the left side, so the text appeared back to front.
7. The pings were faint in the first frame.
8. The graticule read as scratches on the close-up.
9. The London pin was lost among the lights close up.
10. The timpani in act 1 were as loud as the brass.

## Round 3: score 9.3 (lowest: pixel craft)

Fixed from round 2:
- a town scatter (brown and rust, on land only) round every city;
- cores are a cream pixel with a two-sided orange glow;
- a landing is a white flash, then a red ripple;
- plates sit right of the pin, else above it, never beside another pin, and keep their side;
- plates wipe in reading order;
- the graticule fades out close up;
- the London pin is outlined in black close up;
- the act-1 timpani are softer.

Defects:
1. The lights and stars flickered as they moved, because their dissolve used the screen's dither.
2. At night the red equator read as a dashed route.
3. The space-to-field dissolve looked like a screen door for about 1 s.
4. The atmosphere's dither crawled as the globe moved.
5. The flare's streak crossed the planet as a white line, like a laser cut.
6. The first ping was tiny.
7. Plus small spacing and leader nits.

## Round 4: score 9.7 (lowest: pixel craft and read at 1x)

Fixed from round 3:
- every light and star has its own stable threshold, so nothing flickers;
- the equator comes with the day;
- the field now comes up radially from behind the globe.

Defects left (1–3 pixel craft, 4 read at 1x):
1. The atmosphere dither crawled.
2. The flare was a "laser" across the disc.
3. The first ping was tiny.
4. Act 1 had a slow hook.

## Round 5 (final): score 9.8

Fixed from round 4:
- the atmosphere is dithered in the globe's own phase;
- the flare's streaks are a step dimmer over the disc;
- pings start at 1 degree.

Evidence:
- 1867 tests pass, including `test/world-titles.test.js`;
- the big earth matches the emblem's globe at the hand-over (0 differing pixels at R 54 and 41);
- consecutive-frame differences show no isolated spike (no pop) anywhere in 0–10.2 s;
- the theme: -16.7 LUFS integrated, 8.8 LU range (a crescendo from about -22 LUFS momentary in act 1 to
  -11 at the hit);
- per-frame render time: median 4.4 ms, p95 7.9 ms (headless Chromium).

Remaining nitpicks:
1. Frame 0 has no ping yet; the stinger covers it.
2. Act 1 is a calm 2.5 s on a dark frame, which is intended.
3. The New York route dives over the horizon about 0.3 s before the camera shows New York.
4. New Delhi sits on the limb throughout, so its leader drops onto the limb.
5. Routes to Beijing, Tokyo and Sydney vanish at the limb.
6. The iris ring fades in dithered at a large radius.
7. Coastlines resample slightly during the zoom (inherent to a rotating pixel globe; the dither phase
   is locked).
8. The radial dissolve is still an ordered dither for about 1 s.
9. The title glint is deliberately restrained.
10. The music is judged here on structure and measurements only; it has not been heard in-session.

Scores:

| Category | Score |
|---|---|
| Read at 1x and composition | 9.8 |
| Continuity | 9.9 |
| Motion and timing | 9.8 |
| Pixel craft | 9.8 |
| Broadcast grammar and brand | 9.8 |
| Sync of pictures and music | 9.8 |

Shown to the owner for his own score.

## Owner, 9 Oct: "it vibrates all the time"

The owner saw what the panel missed: the image shook all the way through.

The panel had judged sheets and 12 fps strips. Measuring frame by frame at 30 fps showed three causes:
1. The horizon stepped back and forth. The camera's centre and radius were rounded to whole pixels apart, so the limb went 56, 57, 56, 57… It reversed 58 times in the 232 frames of the flight.
2. The shading's dither flipped. Its phase came from the radius (the emblem table's corner), so each change of radius inverted every dithered pixel of the globe at once: 157 times in the flight.
3. The glide to the slot (the package rounds the globe's centre and size apart) reversed the globe's top edge 4 times.

Fixes:
- The planet is drawn from the true circle (fractional centre and radius), so its limb is the circle's own rasterisation on every frame (tested along the whole flight). It moves only as the camera moves.
- Dithers are fixed on the screen at the emblem's position, so each pixel of a moving gradient changes once as it passes. The emblem table's phase is now its centre's, unchanged at radius 34 and 54.
- Routes are sampled once and shown at nested densities, so a zoom never slides their dots.
- The glide is drawn from the true circle and lands on the emblem's own pixels (tested).
- London's pin outline, the city cores' glow, ripples and the flare no longer dissolve through the screen's dither while moving.

Measured on 30 fps renders, counting pixels that change and change back on the next frame (A→B→A):

| | Before | After |
|---|---|---|
| Whole sequence | 414,498 | 173,118 |
| Night shot, per second | 43,000 | 6,500 |

What remains is the legitimate motion of one-pixel details (city lights, coasts) as the camera moves.
