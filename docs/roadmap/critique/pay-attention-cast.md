# PAY ATTENTION — cast critique log (the host: three faces, names and voices)

Build step 6 of `docs/programmes/pay-attention.md` (§2, §9): the quizmaster is a new character, quick, warm and exact,
who enjoys the game more than winning it and keeps the score and the facts straight, seated at the centre podium. The
owner approves the face, the name and the voice. **Gate: three strong, distinct candidates of each for the owner,
candidate A wired in both renderers as the provisional host `qm`, and a hostile critique of the character rubric above
9.7.** Unlike FULL TIME's cast log, which scored only the wired look, every round here scores all three candidates:
the owner may pick any of them, so the round's score is the lowest category over A, B and C.

The panel: the lead character designer and pixel artist, a senior broadcast director, a senior quiz-show producer, a
casting director (voice) and a first-time viewer. Five categories, each 0–10:

- **distinctness**: from every presenter, correspondent and expert, and from each other;
- **readability at 1x**: in the wide three-shot at the podium, on a dark set with the purple board behind;
- **personality fit**: the bible's host;
- **craft**: palette only, clean clusters, no orphan pixels; the mouth, blinks and gestures working; nothing clipped;
  the old renderer;
- **voice**.

**The round's score is the lowest category.**

How it was looked at:

- The lab, `public/lab/pay-attention-cast.html`, captured in headless Chromium (Playwright):
  - `candidates`: the close single at 1x neutral and talking, the head at 4x neutral and talking, the seated figure in
    the wide at 1x and 4x;
  - `contestants`: the three candidates beside the eight contestants, and Kai and Rosa, at 1x and the same pixels at 4x;
  - `quiz` and `quiz-2x`: each candidate at the podium between four pairings;
  - `onair`: the provisional look in the quiz's framings;
  - `gestures`: the quizmaster's nine gestures on each candidate;
  - `legacy`: the old renderer's sprites and close-ups, with the heads at 3x.
- Filmstrips rendered in node at 12 frames a second: talking, a blink, a turn to the partner and to the screen; the
  three-shots at 3x; close-ups at 4x and 8x.
- The stage is a placeholder: a dark room, the question board behind the host in the programme's purple with its fog
  rim, the podium and two desks. The quiz studio is step 5.
- Measured as well as looked at:
  - where the head's dark mass sits, against every other face (IoU at s 1 and 1.37);
  - the head's silhouette (IoU);
  - the whole figure's colour histogram (the experts' rule: above 0.35 from everyone);
  - orphan pixels in the head box at s 1 / 2.15 / 3.4;
  - the cost of a close single;
  - for the voices: timbre (40-band mel cepstrum, coefficients 1–12, mean distance), median F0 and IQR,
    PocketSphinx's word error rate, band balance, clicks and whistles. Every voice was measured against every voice
    in `server/voice/casting.json` on the same copy.

---

## Round 1 — the first lab render (during the build)

Not scored: the faults were found and fixed before the panel looked.

1. **B's pompadour read as a beret**: a dark ellipse on the head with a black underside like a brim across the forehead.
   From the front a pompadour rises from the hairline: the front now faces the lens in the base tone, the top turns up
   to the key, and strands rise from the hairline and sweep back. The silhouette is the skull's circle stretched upward
   (it had a notch where an ellipse met the cap).
2. **C's hijab was a plastic helmet**: half the dome flat cyan. The cloth is now matte:
   - the dome in the base with a thin sheen arc;
   - the key-side panel in the base, the far one in shade;
   - a 1 px lit fold round the face.
3. **C's drape had a seam and a column.** A vertical tone split ran under the chin. It now turns along the far plane,
   on a line from the chin's far corner that slants toward the hem (shared by the head part and the drape,
   `scarfFar`). Folds meant for the panels had collapsed to the chin's width below it and drew a neck column; they now
   stay beside the face.
4. **B's satin lapels were cream.** `base.js` registers every look's `lapel` under its own key before the look's mats
   are read, so a mat of the same name cannot replace it. The look names the satin's key (`matKeys`) and registers it
   first.
5. **B's bow tie vanished in the wide.** A part 2 px tall loses its colour to its own outline. In the wide it is now
   painted on the shirt in exact colours: a 7 px purple bar with a maroon knot.
6. **Distinctness, measured:**
   - A's dark mass overlapped Dev's high-top by 0.53 and Nova's halo by 0.52 (FULL TIME's bar: 0.5). The puffs now sit
     further apart and a little higher: 0.47 and 0.45.
   - B overlapped Dev by 0.66 and Max by 0.56. B now has blue-black hair with a steel gloss, one silver streak swept up
     with the pompadour, and a roll higher on the side away from the part: 0.48 and 0.41.
7. **A's red blazer shouted**: on the purple board it outshone the face. It is now crimson (lit in red, the base dark
   red). Penny's burgundy sits two steps darker.
8. **The voices were dull.** Kokoro's non-English voices have no tonal-match curve in `tools/voice/tone.json`, so the
   host sat about 3 dB under the cast from 2 kHz up. `measure.py tone-add` adds curves for jf_gongitsune, pf_dora,
   hm_psi and jf_nezumi against the file's own target. No English curve changed.
9. **The old renderer's puffs were mouse ears**: two smooth discs. They are now a lobed cloud of coil crescents each.
   C's black bar under the chin is now a soft shadow.

## Round 2 — the panel's first look

Faults:

1. **C's black jacket vanished on the dark stage** (director, first-time viewer: "a blue head on a podium"). It is now
   charcoal, which keeps her shoulders.
2. **A's centre part ran up into the gap between the puffs**, a stalk at 1x (pixel artist). It now stops 3 u above the
   hairline.
3. **A's coils left single-pixel specks**: 119 orphans at s 3.4, the most of the cast (cast 21–97). Specks are pruned
   to the base: 57.
4. **B's sheen strokes ended in steel dust at s 1.5** (pixel artist). They are pruned too: 34 → 32.
5. **B's silver streak was a white stripe at close-ups** (designer: "a racing stripe"). The white now stays on its lit
   edge (a quarter of the lock), the rest silver with fog separations. It leans with the sweep and narrows over the
   crown.
6. **B's cream jacket turned blue in shade**: its fog side plane read as a panel at 1x. It is shaded in silver now (a
   cool step on warm cloth, as Rosa B's knit).
7. **C's intelligibility looked low** (casting director): WER 0.36 on the quiz's own copy, worse than any presenter's.
   On four copies (the casting copy, the calibration copy and two of the quiz's own) it is 0.18, mid-cast (the cast
   0.09–0.26 on the same four). One copy is noise: the decision now uses four.
8. **A presence boost was tried and dropped.** A and C still sit about 1.3 dB under Nova, the cast's dullest voice, in
   2–5 kHz. A chain boost of 2.5 dB at 3.3 kHz brought them level, but moved C to 38 from Rosa and A to 57 from Rhea.
   The distinctness was partly the duller top. Without the boost, after the channel's own tonal match, they stay
   61–75 from everyone. Kept.
9. The lab: the 4x crops cut the puffs and the chin; the gesture crops cut the pointing hand. Fixed.

| Category | Score |
|---|---|
| Distinctness | 9.7 |
| Readability at 1x | 9.5 |
| Personality fit | 9.6 |
| Craft | 9.5 |
| Voice | 9.4 |
| **Round** | **9.4** |

## Round 3 — passed: 9.75

Renders: the lab's sheets (`candidates`, `contestants`, `quiz`, `quiz-2x`, `onair`, `gestures`, `legacy`), and the
filmstrips: talking, blink and turn for A, B and C. Also the three-shots at 3x: Penny | A | Nova, Max | B | Lola and
Paco | C | Ada.

The panel's defects (QUALITY_LOOP rule 2: at least ten, concrete; all nitpicks now, none fixed further):

1. A, wide (s 1): the puffs are two 6 px clouds with a 3 px gap. They read as puffs over the board, but at that size
   their lobes are 1 px and the pair is close to symmetrical: a viewer could say "buns".
2. A, close at 8x: the coils are rings of crescents with dark creases, a little like bubbles. At 4x they read as curls.
3. A, close: the hair material's side rim lights the near puff's inner edge, by the gap: a second silver mark besides
   the hair light on the far puff. Same direction, two rims.
4. A: the stud is Ada's drawer, a gold point with a fog pixel: a cool spark beside warm skin.
5. A, mediums (s 2.15): the drawn-back hair between the puffs is one dark band; its comb lines show only at close-ups.
6. B, close: the streak starts at full width just above the hairline. Its white edge is 1–2 px: it is the tell, and a
   touch graphic.
7. B, wide: the bow is a painted bar on the shirt, and the neck's skin shows above it (no collar band at 1x).
8. B: the jacket's silver shade is a cool step on warm cream, deliberate but visible at 4x.
9. A and B: medium-brown and olive skin are close at 1x; the candidates differ by hair and cloth more than complexion
   (only one airs).
10. C, close: the lit fold runs unbroken round the forehead and down the key side, a crisp 1 px outline round the face.
11. C: her charcoal is Paco's cloth. Beside him in the three-shot there are two charcoal jackets; the hijab and the
    drape carry her.
12. C, wide: the drape is one azure shape over both shoulders, heavy at 1x like a short cape, but unmistakable.
13. The voices are measured, not heard: three non-English Kokoro voices read with English phonemes. A colour of accent
    or a phrasing a recogniser cannot judge is possible, and the owner's audition is the remaining check.
14. Old renderer: A's sprite puffs are 4–5 px blobs, and the close-up's puffs are coarser than v2's.

The panel's reading:

- **Distinctness (9.8).**
  - Dark mass in the head, at s 1: A at most 0.47 (Dev), B 0.48 (Dev), C 0.36 (Ines). At s 1.37: 0.43, 0.33 and 0.34.
    The cast's own nearest pairs are 0.51–0.77; the bar is 0.5.
  - Head silhouettes at most 0.77, 0.92 and 0.69 (cast pairs up to 0.97).
  - Figure histograms at least 1.10 (A, June), 0.92 (B, Omar) and 0.56 (C, Rosa) from everyone. From FULL TIME's
    candidates too: B to Rosa B's cream knit 0.53, C to Rosa A 0.56.
  - The three candidates are 1.72–1.84 apart.
  - Hair or headwear of their own (no drawer shared). No one on air has puffs, a pompadour, a silver streak, a bow tie,
    a dinner jacket or a hijab.
  - The voices share no component with any voice on the channel, adverts included, and none of the browser's fallback
    settings. Their timbres are 61–75 from the nearest voice: the cast's closest pairs that share no component are
    45–47, and those that share one (the earlier mistake) 32.
  - Nearest neighbours:
    - A: Nova (dark coils, deep skin, a purple cardigan) and Dev (a high-top).
    - B: Dev (a high-top, deep skin, green) and Max (a brown quiff and beard, tobacco).
    - C: Ines (long waves, a plum jacket).
- **Readability at 1x (9.75).** The first-time viewer names each from the wide: "the one with two puffs in red", "the
  one in the white dinner jacket with the bow tie and the grey streak", "the woman in the blue hijab". Each holds over
  the purple board: the puffs dark, the streak and the cream light, the hijab bright. Each holds in all four pairings
  at the podium. Defects 1, 7 and 12 keep it from 10.
- **Personality fit (9.75).**
  - A is the liveliest: energy 0.95, the readiest smile; the puffs and the crimson play.
  - B is the showman kept exact: a neat bow, a crisp part, a quick lively melody.
  - C is the calmest: an even head and a level gaze.
  - All three are warm (a resting smile of 0.26–0.30, the cast's warmest), quick in their voices' pace, and seated with
    the question cards.
  - The quiz-show producer: none mocks or takes a side. Their gestures are the channel's own, with no laugh, no thumbs
    and no shaking head.
- **Craft (9.75).**
  - Palette only, at s 1 / 1.5 / 2.15 / 3.4 / 4.4 and at the remote scale.
  - Orphan pixels at s 1 / 2.15 / 3.4: A 6 / 37 / 57, B 8 / 20 / 32, C 4 / 28 / 43 (the cast 1–19 / 11–56 / 21–97).
  - Mouths open and close with the visemes and blink; the hijab never covers the mouth, even wide open (tested).
  - The puffs bounce after the head, the roll lags it; the hijab's face opening follows the turn.
  - Nothing clipped in the wide three-shot or the host's single, MCU and close (tested).
  - Nine gestures on each, the hands drawn.
  - A close single costs 2.2–2.8 ms (the cast 1.6–3.0).
  - The old renderer draws all three, sprite and close-up.
  - Defects 2–5, 8, 10 and 14 keep it from 10.
- **Voice (9.75).** Each candidate is measured with the channel's tonal match, the broadcast chain at −16 LUFS, no
  clicks and no whistle.
  - Mean word error over four copies: A 0.14, B 0.17, C 0.18, in the middle of the cast's 0.09–0.26.
  - Each voice's pace on the casting copy (20.1 / 20.9 / 19.7 s) lies inside the cast's 18.8–21.2.
  - Melodies: A 4.5 semitones, B 6.6 (the liveliest male melody on the channel), C 3.6 (the even one).
  - Each has its own pause set, with a beat before an answer (colon 0.30, ellipsis 0.55) and after a question (0.44).
  - What keeps it from 10 is defect 13: measured, not heard. A and C also sit 1.3 dB under the duller cast voice in
    presence.

| Category | Score |
|---|---|
| Distinctness | 9.8 |
| Readability at 1x | 9.75 |
| Personality fit | 9.75 |
| Craft | 9.75 |
| Voice | 9.75 |
| **Round** | **9.75** |

The QUALITY_LOOP rubric's other categories, for the looks (the rig, the direction and the gestures are the channel's
own, unchanged):

- **anatomy and proportion, 9.8**: adult proportions on Lola's, Paco's and Penny's proven seated bodies;
- **motion, 9.75**: the puffs follow through, the roll lags, the drape stays with the body while the head turns
  inside it;
- **acting, 9.75**: the channel's own direction, the personas set per candidate.

Lowest: 9.75.

### What the owner decides

- **The name**:
  - A: Quinn Query, who asks every question as if it were the best one yet, and takes the answer exactly as it aired;
  - B: Theo Tally, the showman who keeps the tally, brisk, warm and fair;
  - C: Layla Level, calm, quick and exact, who keeps the game level.

  Each name fits its look.
- **The face**: A, B or C (`public/js/pay-attention-looks.js`, one letter for both renderers).
- **The voice**: listen in the lab (`public/lab/pay-attention-voices`):
  - voice A: bright and quick, American (female);
  - voice B: a light, lively baritone, American (male);
  - voice C: clear and even, British (female).

  Look A or C goes with voice A or C (both female); look B goes with voice B (male).

  To change it: `server/voice/casting.json` `qm.voice`, `speed` and `lang` from `qm.candidates[letter]`, and
  `config/channel.json` `presenters.qm.voice` (`gender`, `lang`, `pitch`, `rate` from the same entry) with `name`.
  The test checks that the three agree.

### Left open (honest)

- **The quiz studio.** Every render here stands on a placeholder stage. The looks need one more look on step 5's set:
  the charcoal and the black hair rely on the silver rim against a dark wall.
- **The voices need a human ear.** No one has listened to them yet (defect 13).
- **The tonal match curves change `tools/voice/tone.json`**, one of the voice cache's fingerprint files: after this
  merges the station renders its cached clips once more.
- **Pointing at a player from the centre.** `point_partner` points to the rig's one partner side: at the podium the
  director sets the side for each player (step 4).
- **The `qm` presenter hosts no programme yet.** `test/channel.test.js` allows that only until a programme of kind
  `quiz` exists. The kind is on the main line (the station's commit); the quiz's programme entry will name `qm` as
  its one presenter.
