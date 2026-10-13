# FULL TIME title sequence: critique log

The brief (`docs/programmes/full-time.md` §6): "The open (≈10 s, 120 BPM). A dark ground; the floodlights bang on bank
by bank on the beat (a low thunk each); the camera sweeps down to the centre circle; the scoreboard flips to FULL TIME
on the referee's final whistle — three blasts, the last long — played by the brass; the emblem is a stopwatch at 90:00
that becomes the plate." No real broadcaster's or club's jingle, no anthem, no quotation of an existing theme.

Method: `docs/roadmap/QUALITY_LOOP.md`. A hostile panel: a broadcast composer and sound designer, a senior broadcast
director, a lead pixel artist and a first-time viewer. Renders only. Each category is scored 0–10, and a round's score
is its lowest category. The bar is above 9.7 in every category.

**Rubric:**
- picture craft (read at 1x, pixel craft, shimmer);
- timing to the music;
- clarity of the FULL TIME plate;
- distinctness from the other opens.

The sound of the open (the theme) is scored in `full-time-sound.md`.

**Where it is:**
- the cue sheet, shared by the picture and the theme: `public/js/scenes/opens/cues.js` (`'full-time'`);
- the stadium: `public/js/scenes/opens/fulltimetitles.js`;
- the emblem, a digital stopwatch: `public/js/scenes/opens/sport.js`;
- the theme: `public/js/audio/themes.js` (`fullTimeTitles`);
- the lab: `public/lab/opens.html?id=full-time` (`window.__lab.render(t)`);
- tests: `test/full-time-sound.test.js`.

**Renders:** 30 fps frames from the lab, viewed at 1x and 3x, contact sheets every 0.1–0.5 s, and A→B→A flicker
maps. Recordings with the theme are in `/tmp/full-time-sound/`:
- `full-time-open.mp4` is the final one;
- `full-time-open-r1.mp4` is round 1.

## The sequence (one beat grid, 120 BPM; times in seconds from the cut)

| Beat | Time | Picture | Music |
|---|---|---|---|
| 0–3 | 0–1.5 | A dark stadium from high behind the near stand. Only the unlit lines and the towers show. The board's clock reads 89:55 and ticks a second every two beats. | A sub on E-flat and a dark fifth. The clock's dry tick each second. |
| 3, 4, 5, 6 | 1.5, 2.0, 2.5, 3.0 | One bank a beat. Its head flashes white with a big halo, then settles. A crisp quarter of the pitch and of its stands comes up. | A low thunk each: timpani, the section and a felt kick, climbing the E-flat chord (the band's count-in). |
| 6.5–10 | 3.25–5.0 | The camera sweeps down over the low near terrace, into the bowl, and comes to rest low over the centre circle with the board over the far stand. | The groove: kick, backbeat, the bass in eighths, the guitar's chops, the brass stabs. |
| 10, 11, 12 (+2) | 5.0, 5.5, 6.0 | The clock reaches 90:00 on the first blast. The board's rim flashes orange with the two short blasts. The panel flips from 2ND HALF to FULL TIME on the long blast. | The final whistle on the brass: three blasts on B-flat, the last held two beats with a pea whistle's flutter. The band hits under each blast. |
| 13.5–15.25 | 6.75–7.6 | A push-in on the board's clock: a zoom with the frame panned to it (the camera never turns). The watch arrives at centre stage at the emblem's size. | An air swell and a snare fill over B-flat on the E-flat pedal. |
| 15 | 7.5 | The stadium drops away in three frames through the screen's matrix. The watch is held through the cut (a match cut on the clock) onto the open's field. | The signature on the brass, trumpets an octave up. |
| 15.7–19 | 7.85–9.5 | The package's reveal: the plate comes out of the watch. FULL TIME, THE DAY IN SPORT, WITH KAI SPRITE & ROSA RALLY. | The colour (B, the #5) over an augmented chord, rising to C (the 6th) on Eb6/9 on the hit. |
| 19 | 9.5–10.3 | Still. | The hit rings to the cut. |

(The scores of rounds 1 and 2 were given afterwards, from each round's renders, which are kept; round 3's is the
panel's verdict on the final renders.)

## Round 1: first full draft. Score 8.4 (lowest: picture craft)

Defects:
1. Frames took 82 ms (median). The ray caster ran per pixel with closures, so it would drop frames on air.
2. The near stand was full height with a roof. From the high opening camera it hid the near half of the pitch, so the
   floods lit nothing the viewer could see.
3. The dark phase was too bright: the stands read before their banks came on, so the bang had nothing to reveal.
4. The crowd drew rows and heads at every distance. Far away they were noise, and they shimmered in every move.
5. The halos were red and dotted, like a warning light, not a floodlight.
6. The lamp grid in each head was re-sampled as the head grew, so it aliased into stripes during the sweep.
7. The theme's thunks were louder than the groove (scored in `full-time-sound.md`).

## Round 2: score 9.3 (lowest: picture craft)

Fixed from round 1:
- the renderer works per row: a mode-7 ground (one distance per row), stands culled by their screen box, no closures,
  so the median frame is 9–10 ms;
- a low near terrace with no roof, so the whole pitch shows from the opening camera;
- darker levels before each bank;
- the crowd's detail by distance: rows and heads near, rows alone further away, a flat dithered tone far away;
- cool white halos, in the sky only;
- the lamp grid is in whole pixels, its cells growing a pixel at a time.

Defects:
1. Each bank lit its quarter with a soft edge 14–22 m wide. That edge dithered as a wide checkerboard across the pitch
   and the stands for whole seconds during the floods.
2. The roofs, fascias, walls, apron and sky were dithered middle tones, which read as more wide checkerboards.
3. Ad boards less than 3 px tall read as dotted lines.
4. The dark grass stripes were 0.62 of a step down. Stripes and dither together made a checkerboard of stripes.
5. The unlit tiers showed a grey crowd before their bank came on.
6. The push-in turned the camera towards the watch (yaw and pitch). The board skewed under a watch drawn square: the
   two read as a sticker on a slanted board.
7. Shimmer: 211,000 A→B→A flickers over the open (the other opens: 105,000–158,000). The flicker maps put it in the
   side tiers during the sweep and everywhere during the push.
8. From the air the far heads had no halo: the glow was only drawn on sky, and from the high camera there is no sky in
   the frame.
9. The 95th-percentile frame took 25 ms.

## Round 3 (final): score 9.6 (lowest: picture craft)

Fixed from round 2:
- **Crisp quarters.** Each bank lights its quarter with an edge of 2.5–4 m, so each bang lights a clean quarter and
  the four together light the pitch evenly.
- **Whole steps.** Roofs, fascias, walls, the apron and the sky's bands take whole palette steps by the light of their
  own quarter, never a dithered middle tone.
- **Thin ad boards** (under 3 px) are all orange band.
- **Lighter stripes.** The dark stripes are 0.26 of a step down: a texture, not a checkerboard.
- **Black until lit.** A tier is black until its quarter's bank comes on.
- **A zoom, not a turn.** The push-in is a zoom with a lens shift: the focal length grows to the emblem's size while
  the frame's centre moves so the watch eases to centre stage. Nothing moves in depth against anything else, and the
  board stays square to the watch.
- **Detail that waits for stillness.** The crowd's rows and heads only draw while the picture is nearly still. They
  fade back to the flat tone as the camera's speed passes 2–10 m/s, or as the zoom's rate passes 0.15–0.6 per second.
- **Halos from the air.** A halo is at least 22 px across. It glows over the night: the sky, or the dark land beyond
  the stadium when the camera looks down on it.

Evidence:
- **Flicker:** 120,831 A→B→A over the open, in the range of the other opens. Per second: 0, 38, 45, 24,005, 39,598,
  54, 10,521, 41,702, 4,522, 346, 0.
- **Frame times:** median 7.9 ms, 95th percentile 16.4 ms, max 58 ms (the first frame warming its caches).
- **The hand-over is exact.** At the settle the stadium's watch sits at centre stage at the emblem's size: 1e-6 px and
  1e-6 of scale (tested). Painted at its last stadium place and at the emblem's place it is the same pixels: 0 of
  1,500+ differ (tested). The digits and pusher are the same as the emblem's settled watch, so there is no pop at the
  switch.
- **The camera never turns:** its forward vector has no sideways component on any frame (tested).
- **Timing** (frames checked against the theme's note list): the banks land on 1.5, 2.0, 2.5 and 3.0 s with their
  thunks; the clock's tick is on each second to 90:00 at 5.0 s; the rim flashes at 5.0 and 5.5 s; the flip is at
  6.0 s; the cut is on the signature's downbeat at 7.5 s; the reveal is at 7.85 s; the hit is at 9.5 s; the cut to the
  studio is at 10.3 s.

Final scores:

| Category | Score | What keeps it from 10 |
|---|---|---|
| Picture craft | 9.6 | See the four items under this table. |
| Timing to the music | 9.8 | Every event lands on the beat it scores. The hold over the circle (5.0–6.75 s) carries the whistle and the flip, but the camera is dead still there; the director would take a slow creep. |
| Clarity of the FULL TIME plate | 9.8 | On the board, FULL TIME first reads in 5 px type on the LED grid (6.0–6.9 s). It is doubled during the push and is then the package's plate. A first-time viewer reads the board's 90:00 before the text. |
| Distinctness | 9.8 | The only open with a place you could stand in, at night, in the channel's orange; the only emblem with digits. The night sky with halos shares a palette with the city sequences' night frames. |

What keeps picture craft at 9.6:
1. **The crowd is still.** At the final whistle a real ground stands up, and this one does not move. Motion in the
   crowd would shimmer (the set's bible rules out a twinkling crowd). One flicker-safe reaction was tried and dropped:
   on the long blast more seats filled and scarves went up, each seat changing once. It could not be seen at 1x,
   because from the held shot the side tiers are at a grazing angle and draw as rows, not heads.
2. **Shimmer in the push.** The push (6.75–7.6 s) still shimmers at about 42,000 A→B→A in its second: the grass's
   dither and the lines crawl under a fast zoom.
3. **Clipped halos.** A near head's halo stops in a straight edge where it meets a stand's roof.
4. **A flat end stand.** The stand behind the far goal is a flat speckle with no rows at that distance. This is honest
   (the rows are under a pixel there), but it reads as a dark mass.

The round's score is 9.6. That is under the bar in picture craft, and it is reported as such. The next steps for a
fourth round:
- a flicker-safe reaction of the crowd at the flip (a static change, such as scarves held up, appearing once with the
  long blast);
- a footprint filter on the stripes' edges for the zoom;
- a halo that also lights a roof it overlaps.
